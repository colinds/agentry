import Anthropic from '@anthropic-ai/sdk';
import { EventEmitter } from 'eventemitter3';
import type {
  BetaMessage,
  BetaMessageParam,
  BetaToolUnion,
  BetaToolResultBlockParam,
  BetaTextBlock,
  BetaContentBlock,
  BetaContentBlockParam,
  BetaTextBlockParam,
  BetaRequestMCPServerURLDefinition,
} from '@anthropic-ai/sdk/resources/beta';
import { unstable_scheduleCallback, unstable_ImmediatePriority } from 'scheduler';
import type {
  AgentState,
  AgentStreamEvent,
  AgentResult,
  InternalTool,
  PendingToolCall,
  ToolContext,
  ToolUpdate,
  CompactionControl,
  Model,
  OnStepFinishResult,
  StepToolCall,
  StepToolResult,
} from '../types/index.ts';
import { ANTHROPIC_BETAS, type AnthropicBeta } from '../constants.ts';
import type { AgentInstance } from '../instances/index.ts';
import { initialState, transition, extractToolUses, extractText } from '../types/index.ts';
import { toApiTool, executeTool } from '../tools/index.ts';
import { debug } from '../debug.ts';
import { flushSync } from '../reconciler/renderer.ts';
import type { AgentStore } from '../store.ts';

/**
 * Sanitize content blocks from API responses to be safe for sending back as parameters.
 * Removes response-only fields like 'parsed' that are not allowed in request parameters.
 */
function sanitizeContentBlocks(
  content: BetaContentBlock[],
): BetaContentBlockParam[] {
  return content.map((block) => {
    if (block.type === 'text') {
      // Remove 'parsed' field from text blocks (response-only field)
      const { parsed, ...textBlock } = block as any;
      return textBlock as BetaTextBlockParam;
    }
    // For other block types (tool_use, image, etc.), return as-is
    // They don't have response-only fields that need stripping
    return block as BetaContentBlockParam;
  });
}

// params type for API calls
interface CreateMessageParams {
  model: string;
  max_tokens: number;
  system?: string;
  messages: BetaMessageParam[];
  tools?: BetaToolUnion[];
  mcp_servers?: BetaRequestMCPServerURLDefinition[];
  stop_sequences?: string[];
  temperature?: number;
  betas?: string[];
}

// events emitted by the execution engine
export interface ExecutionEngineEvents {
  stateChange: (state: AgentState) => void;
  stream: (event: AgentStreamEvent) => void;
  message: (message: BetaMessage) => void;
  complete: (result: AgentResult) => void;
  error: (error: Error) => void;
  stepFinish: (result: OnStepFinishResult) => void;
}

// configuration for the execution engine
export interface ExecutionEngineConfig {
  client: Anthropic;
  model: Model;
  maxTokens: number;
  system?: string;
  tools: InternalTool[];
  sdkTools: BetaToolUnion[];
  mcpServers?: BetaRequestMCPServerURLDefinition[];
  messages: BetaMessageParam[];
  stream?: boolean;
  maxIterations?: number;
  compactionControl?: CompactionControl;
  stopSequences?: string[];
  temperature?: number;
  agentName?: string;
  agentInstance?: AgentInstance;
  /** Store - single source of truth for messages and state */
  store: AgentStore;
}

const DEFAULT_TOKEN_THRESHOLD = 100_000;

const DEFAULT_SUMMARY_PROMPT = `You have been working on the task described above but have not yet completed it. Write a continuation summary that will allow you (or another instance of yourself) to resume work efficiently in a future context window where the conversation history will be replaced with this summary. Your summary should be structured, concise, and actionable. Include:
1. Task Overview
2. Current State
3. Important Discoveries
4. Next Steps
5. Context to Preserve
Be concise but complete. Write in a way that enables immediate resumption of the task.
Wrap your summary in <summary></summary> tags.`;

/**
 * execution engine handles the conversation loop with Claude
 *
 * inspired by BetaToolRunner but with our own interface and React integration
 */
export class ExecutionEngine extends EventEmitter<ExecutionEngineEvents> {
  #client: Anthropic;
  #config: ExecutionEngineConfig;
  #store: AgentStore;
  #iterationCount = 0;
  #lastMessage: BetaMessage | null = null;
  #aborted = false;
  #agentInstance: AgentInstance | null = null;
  #toolExecutionTimes = new Map<string, number>();

  constructor(config: ExecutionEngineConfig) {
    super();
    this.#client = config.client;
    this.#config = config;
    this.#store = config.store;
    this.#agentInstance = config.agentInstance ?? null;

    // Initialize store with messages
    if (config.messages.length > 0) {
      this.#store.setState({ messages: [...config.messages] });
    }
  }

  // get current execution state from store
  get executionState(): AgentState {
    return this.#store.getState().executionState;
  }

  // get current messages from store (single source of truth)
  get messages(): readonly BetaMessageParam[] {
    return this.#store.getState().messages;
  }

  // update configuration (can be called during execution for hot updates)
  updateConfig(updates: Partial<ExecutionEngineConfig>): void {
    this.#config = { ...this.#config, ...updates };
  }

  // add a message to the store
  pushMessage(message: BetaMessageParam): void {
    this.#store.setState((s) => ({ messages: [...s.messages, message] }));
  }

  // transition to a new state
  #transition(event: Parameters<typeof transition>[1]): void {
    const newState = transition(this.#store.getState().executionState, event);
    this.#store.setState({ executionState: newState });
    this.emit('stateChange', newState);
  }

  // build the API params
  #buildParams(): CreateMessageParams {
    const tools = [
      ...this.#config.tools.map(toApiTool),
      ...this.#config.sdkTools,
    ] as BetaToolUnion[];

    const mcpServers = this.#config.mcpServers;
    if (mcpServers?.length) {
      for (const server of mcpServers) {
        tools.push({
          type: 'mcp_toolset',
          mcp_server_name: server.name,
        } as BetaToolUnion);
      }
    }

    const betas: AnthropicBeta[] = [];
    if (mcpServers?.length) {
      betas.push(ANTHROPIC_BETAS.MCP_CLIENT);
    } 

    return {
      model: this.#config.model,
      max_tokens: this.#config.maxTokens,
      system: this.#config.system,
      messages: this.messages as BetaMessageParam[],
      tools: tools.length > 0 ? tools : undefined,
      mcp_servers: mcpServers?.length ? mcpServers : undefined,
      stop_sequences: this.#config.stopSequences,
      temperature: this.#config.temperature,
      betas: betas.length > 0 ? betas : undefined,
    };
  }

  // run the execution loop
  async run(): Promise<AgentResult> {
    this.#aborted = false;
    this.#iterationCount = 0;

    try {
      while (!this.#aborted) {
        // check iteration limit
        if (
          this.#config.maxIterations !== undefined &&
          this.#iterationCount >= this.#config.maxIterations
        ) {
          break;
        }

        this.#iterationCount++;
        const abortController = new AbortController();
        this.#transition({ type: 'start_streaming', abortController });

        // make the API call
        const message = await this.#makeApiCall(abortController);
        this.#lastMessage = message;
        this.emit('message', message);

        // add assistant message to history (sanitize to remove response-only fields)
        const assistantMessage: BetaMessageParam = {
          role: 'assistant',
          content: sanitizeContentBlocks(message.content),
        };
        this.pushMessage(assistantMessage);

        // check if we need to execute tools
        const toolUses = extractToolUses(message);
        if (toolUses.length > 0 && message.stop_reason === 'tool_use') {
          const pendingTools: PendingToolCall[] = toolUses.map((tu) => ({
            id: tu.id,
            name: tu.name,
            input: tu.input,
          }));

          this.#transition({ type: 'tools_requested', pendingTools });

          // execute tools
          const toolResults = await this.#executeTools(pendingTools);

          // add tool results to messages
          const toolResultMessage: BetaMessageParam = {
            role: 'user',
            content: toolResults,
          };
          this.pushMessage(toolResultMessage);

          this.#transition({ type: 'tools_completed', results: [] });

          // Force React to commit any pending state updates from tool handlers
          // With ConcurrentRoot, we need both:
          // 1. flushSync - processes synchronous React work
          // 2. Immediate priority yield - ensures concurrent scheduler commits
          flushSync(() => {});
          await new Promise<void>(resolve => {
            unstable_scheduleCallback(unstable_ImmediatePriority, () => resolve());
          });

          // Process any pending updates (dynamic tool adds/removes from setState)
          this.#processPendingUpdates();

          // check for compaction after tool execution
          await this.#checkAndCompact();

          // emit step finish event
          const stepResult = this.#buildStepFinishResult(message, toolUses, toolResults);
          this.emit('stepFinish', stepResult);
        } else {
          // no more tool calls, we're done
          // emit step finish event with no tools
          const stepResult = this.#buildStepFinishResult(message, [], []);
          this.emit('stepFinish', stepResult);
          break;
        }
      }

      if (!this.#lastMessage) {
        throw new Error('Execution ended without receiving a message');
      }

      const result = this.#buildResult();
      this.#transition({ type: 'completed', finalMessage: this.#lastMessage });
      this.emit('complete', result);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.#transition({ type: 'error', error: err });
      this.emit('error', err);
      throw err;
    }
  }

  // make an API call (streaming or non-streaming)
  async #makeApiCall(abortController: AbortController): Promise<BetaMessage> {
    const params = this.#buildParams();

    debug('api', `Request #${this.#iterationCount}`, {
      model: params.model,
      tools: params.tools?.map(t => ('name' in t ? t.name : t.type)),
      messageCount: params.messages.length,
      system: params.system ? `${params.system.substring(0, 80)}...` : undefined,
      mcpServers: params.mcp_servers?.map(s => s.name),
    });

    let response: BetaMessage;
    if (this.#config.stream) {
      response = await this.#streamApiCall(params, abortController);
    } else {
      response = await this.#client.beta.messages.create(
        { ...params, stream: false },
        { signal: abortController.signal },
      );
    }

    debug('api', `Response #${this.#iterationCount}`, {
      stopReason: response.stop_reason,
      toolUses: extractToolUses(response).map(t => t.name),
      textLength: extractText(response).length,
      cacheCreation: response.usage.cache_creation_input_tokens,
      cacheRead: response.usage.cache_read_input_tokens,
    });

    return response;
  }

  // streaming API call
  async #streamApiCall(
    params: CreateMessageParams,
    abortController: AbortController,
  ): Promise<BetaMessage> {
    const stream = this.#client.beta.messages.stream(params, {
      signal: abortController.signal,
    });

    let accumulatedText = '';

    stream.on('text', (text, snapshot) => {
      accumulatedText = snapshot;
      this.emit('stream', { type: 'text', text, accumulated: snapshot });
    });

    stream.on('thinking', (thinking) => {
      this.emit('stream', { type: 'thinking', text: thinking });
    });

    stream.on('contentBlock', (block) => {
      if (block.type === 'tool_use') {
        this.emit('stream', {
          type: 'tool_use_start',
          toolName: block.name,
          toolId: block.id,
        });
      }
    });

    stream.on('inputJson', (partialJson, snapshot) => {
      // we'd need to track which tool this belongs to
      // for now, emit generic event
    });

    const finalMessage = await stream.finalMessage();

    this.emit('stream', {
      type: 'message_complete',
      stopReason: finalMessage.stop_reason ?? 'unknown',
    });

    return finalMessage;
  }

  // execute pending tools
  async #executeTools(pendingTools: PendingToolCall[]): Promise<BetaToolResultBlockParam[]> {
    this.#transition({ type: 'tools_executing', pendingTools });

    const currentState = this.executionState;
    const context: ToolContext = {
      agentName: this.#config.agentName ?? 'agent',
      client: this.#client,
      signal: currentState.status === 'streaming' ? currentState.abortController.signal : undefined,
      updateTools: this.#agentInstance ? (updates: ToolUpdate[]) => {
        for (const update of updates) {
          if (update.type === 'add') {
            this.#agentInstance!.pendingUpdates.push({ type: 'tool_added', tool: update.tool });
          } else {
            this.#agentInstance!.pendingUpdates.push({ type: 'tool_removed', toolName: update.toolName });
          }
        }
      } : undefined,
    };

    // execute all tools in parallel
    const results = await Promise.all(
      pendingTools.map(async (toolCall) => {
        const startTime = performance.now();

        // find the tool
        const tool = this.#config.tools.find((t) => t.name === toolCall.name);

        if (!tool) {
          // check if it's an SDK tool (handled by Anthropic)
          const sdkTool = this.#config.sdkTools.find(
            (t) => 'name' in t && t.name === toolCall.name,
          );

          if (sdkTool) {
            // SDK tools are handled by Anthropic, we shouldn't receive them here
            // but just in case, return an error
            const executionTime = performance.now() - startTime;
            this.#toolExecutionTimes.set(toolCall.id, executionTime);
            return {
              type: 'tool_result' as const,
              tool_use_id: toolCall.id,
              content: `Tool '${toolCall.name}' is a server-side tool and cannot be executed locally`,
              is_error: true,
            };
          }

          const executionTime = performance.now() - startTime;
          this.#toolExecutionTimes.set(toolCall.id, executionTime);
          return {
            type: 'tool_result' as const,
            tool_use_id: toolCall.id,
            content: `Error: Tool '${toolCall.name}' not found`,
            is_error: true,
          };
        }

        // execute the tool
        debug('tool', `Executing: ${toolCall.name}`, toolCall.input);
        const { result, isError } = await executeTool(tool, toolCall.input, context);
        const executionTime = performance.now() - startTime;
        this.#toolExecutionTimes.set(toolCall.id, executionTime);

        debug('tool', `Result: ${toolCall.name}`, {
          isError,
          result: typeof result === 'string' ? result.substring(0, 100) : result
        });

        // emit tool result event
        this.emit('stream', {
          type: 'tool_result',
          toolId: toolCall.id,
          result: typeof result === 'string' ? result : JSON.stringify(result),
          isError,
        });

        return {
          type: 'tool_result' as const,
          tool_use_id: toolCall.id,
          content: result,
          is_error: isError ? true : undefined,
        };
      }),
    );

    return results;
  }

  // build step finish result from current state
  #buildStepFinishResult(
    message: BetaMessage,
    toolUses: Array<{ id: string; name: string; input: unknown }>,
    toolResults: BetaToolResultBlockParam[]
  ): OnStepFinishResult {
    // extract text content
    const text = extractText(message);

    // extract thinking content
    const thinkingBlock = message.content.find(
      (b): b is Extract<BetaContentBlock, { type: 'thinking' }> => b.type === 'thinking'
    );
    const thinking = thinkingBlock?.thinking;

    // build tool calls array
    const toolCalls: StepToolCall[] = toolUses.map((tu) => ({
      id: tu.id,
      name: tu.name,
      input: tu.input,
    }));

    // build tool results array with execution times
    const toolResultsWithTimes: StepToolResult[] = toolResults.map((tr) => {
      const toolUse = toolUses.find((tu) => tu.id === tr.tool_use_id);
      return {
        toolCallId: tr.tool_use_id,
        toolName: toolUse?.name ?? 'unknown',
        result: tr.content,
        isError: tr.is_error ?? false,
        executionTime: this.#toolExecutionTimes.get(tr.tool_use_id),
      };
    });

    return {
      stepNumber: this.#iterationCount,
      text,
      thinking,
      toolCalls,
      toolResults: toolResultsWithTimes,
      finishReason: message.stop_reason,
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cacheCreationTokens: message.usage.cache_creation_input_tokens,
        cacheReadTokens: message.usage.cache_read_input_tokens,
        totalTokens: message.usage.input_tokens + message.usage.output_tokens,
      },
      message,
      messages: [...this.messages],
      timestamp: new Date(),
    };
  }

  // process pending updates from the instance
  #processPendingUpdates(): void {
    if (!this.#agentInstance || this.#agentInstance.pendingUpdates.length === 0) {
      return;
    }

    for (const update of this.#agentInstance.pendingUpdates) {
      if (update.type === 'tool_added') {
        // add tool if not already present
        if (!this.#config.tools.find((t) => t.name === update.tool.name)) {
          this.#config.tools.push(update.tool);
        }
      } else if (update.type === 'tool_removed') {
        const index = this.#config.tools.findIndex((t) => t.name === update.toolName);
        if (index >= 0) {
          this.#config.tools.splice(index, 1);
        }
      } else if (update.type === 'sdk_tool_added') {
        if (!this.#config.sdkTools.includes(update.tool)) {
          this.#config.sdkTools.push(update.tool);
        }
      } else if (update.type === 'sdk_tool_removed') {
        const index = this.#config.sdkTools.findIndex(
          (t) => 'name' in t && t.name === update.toolName,
        );
        if (index >= 0) {
          this.#config.sdkTools.splice(index, 1);
        }
      }
    }

    // clear processed updates
    this.#agentInstance.pendingUpdates = [];
  }

  // check if we need to compact the conversation
  async #checkAndCompact(): Promise<boolean> {
    const compactionControl = this.#config.compactionControl;
    if (!compactionControl?.enabled) {
      return false;
    }

    // calculate token usage from last message
    if (!this.#lastMessage) {
      return false;
    }

    const totalTokens =
      this.#lastMessage.usage.input_tokens +
      this.#lastMessage.usage.output_tokens +
      (this.#lastMessage.usage.cache_creation_input_tokens ?? 0) +
      (this.#lastMessage.usage.cache_read_input_tokens ?? 0);

    const threshold = compactionControl.contextTokenThreshold ?? DEFAULT_TOKEN_THRESHOLD;

    if (totalTokens < threshold) {
      return false;
    }

    // perform compaction
    const model = compactionControl.model ?? this.#config.model;
    const summaryPrompt = compactionControl.summaryPrompt ?? DEFAULT_SUMMARY_PROMPT;

    // remove tool_use blocks from last message to avoid validation errors
    const currentMessages = [...this.messages];
    const lastMessage = currentMessages[currentMessages.length - 1];
    if (lastMessage?.role === 'assistant' && Array.isArray(lastMessage.content)) {
      const nonToolBlocks = lastMessage.content.filter(
        (block: { type: string }) => block.type !== 'tool_use',
      );
      if (nonToolBlocks.length === 0) {
        currentMessages.pop();
      } else {
        currentMessages[currentMessages.length - 1] = { ...lastMessage, content: nonToolBlocks };
      }
    }

    const response = await this.#client.beta.messages.create({
      model,
      messages: [
        ...currentMessages,
        {
          role: 'user',
          content: [{ type: 'text', text: summaryPrompt }],
        },
      ],
      max_tokens: this.#config.maxTokens,
    });

    const summaryBlock = response.content.find(
      (block): block is BetaTextBlock => block.type === 'text',
    );

    if (!summaryBlock) {
      return false;
    }

    // replace messages with summary
    this.#store.setState({
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: summaryBlock.text }],
        },
      ],
    });

    return true;
  }

  // build the final result
  #buildResult(): AgentResult {
    if (!this.#lastMessage) {
      throw new Error('No message received');
    }

    return {
      content: extractText(this.#lastMessage),
      messages: [...this.messages],
      usage: {
        inputTokens: this.#lastMessage.usage.input_tokens,
        outputTokens: this.#lastMessage.usage.output_tokens,
        cacheCreationInputTokens: this.#lastMessage.usage.cache_creation_input_tokens ?? undefined,
        cacheReadInputTokens: this.#lastMessage.usage.cache_read_input_tokens ?? undefined,
      },
      stopReason: this.#lastMessage.stop_reason,
    };
  }

  // abort the execution
  abort(): void {
    this.#aborted = true;
    const currentState = this.executionState;
    if (currentState.status === 'streaming') {
      currentState.abortController.abort();
    }
    const error = new Error('Execution aborted');
    this.#transition({ type: 'error', error });
    this.emit('error', error);
  }

  // reset the engine
  reset(): void {
    this.#aborted = false;
    this.#iterationCount = 0;
    this.#lastMessage = null;
    this.#store.setState({ messages: [...this.#config.messages] });
    this.#transition({ type: 'reset' });
  }
}
