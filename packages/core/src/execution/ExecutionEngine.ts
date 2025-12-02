import Anthropic from '@anthropic-ai/sdk'
import { EventEmitter } from 'eventemitter3'
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
  BetaMemoryTool20250818,
} from '@anthropic-ai/sdk/resources/beta'
import { yieldToSchedulerImmediate } from '../scheduler.ts'
import type {
  AgentState,
  AgentStreamEvent,
  AgentResult,
  PendingToolCall,
  ToolContext,
  CompactionControl,
  Model,
  OnStepFinishResult,
  StepToolCall,
  StepToolResult,
} from '../types/index.ts'
import { ANTHROPIC_BETAS, type AnthropicBeta } from '../constants.ts'
import type { AgentInstance } from '../instances/index.ts'
import {
  transition,
  extractToolUses,
  extractText,
  isMemoryTool,
  isCodeExecutionTool,
} from '../types/index.ts'
import type { SdkTool } from '../types/index.ts'
import { toApiTool, executeTool } from '../tools/index.ts'
import { executeMemoryTool } from '../tools/memoryTool.ts'
import { debug } from '../debug.ts'
import { flushSync } from '../reconciler/renderer.ts'
import type { AgentStore } from '../store.ts'

/**
 * Sanitize content blocks from API responses to be safe for sending back as parameters.
 * Removes response-only fields like 'parsed' that are not allowed in request parameters.
 */
function sanitizeContentBlocks(
  content: BetaContentBlock[],
): BetaContentBlockParam[] {
  return content.map((block) => {
    if (block.type === 'text') {
      if ('parsed' in block) {
        delete block.parsed
      }
      return block as BetaTextBlockParam
    }
    return block as BetaContentBlockParam
  })
}

// subset of Anthropic's MessageCreateParams
interface CreateMessageParams {
  model: string
  max_tokens: number
  system?: string
  messages: BetaMessageParam[]
  tools?: BetaToolUnion[]
  mcp_servers?: BetaRequestMCPServerURLDefinition[]
  stop_sequences?: string[]
  temperature?: number
  betas?: string[]
}

export interface ExecutionEngineEvents {
  stateChange: (state: AgentState) => void
  stream: (event: AgentStreamEvent) => void
  message: (message: BetaMessage) => void
  complete: (result: AgentResult) => void
  error: (error: Error) => void
  stepFinish: (result: OnStepFinishResult) => void
}

export interface ExecutionEngineConfig {
  client: Anthropic
  model: Model
  maxTokens: number
  system?: string
  stream?: boolean
  maxIterations?: number
  compactionControl?: CompactionControl
  stopSequences?: string[]
  temperature?: number
  agentName?: string
  agentInstance?: AgentInstance
  store: AgentStore
}

const DEFAULT_TOKEN_THRESHOLD = 100_000

function hasName(t: unknown): t is { name: string } {
  return typeof t === 'object' && t !== null && 'name' in t
}

/**
 * Convert SdkTool to Anthropic API format (BetaToolUnion)
 * Strips memoryHandlers from MemoryTool before sending to API
 */
function toApiSdkTool(sdkTool: SdkTool): BetaToolUnion {
  if (isMemoryTool(sdkTool)) {
    // Strip memoryHandlers - it's not part of the API contract
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { memoryHandlers, ...apiTool } = sdkTool
    return apiTool as BetaMemoryTool20250818
  }
  // CodeExecutionTool and WebSearchTool are already in the correct format
  return sdkTool as BetaToolUnion
}

const DEFAULT_SUMMARY_PROMPT = `You have been working on the task described above but have not yet completed it. Write a continuation summary that will allow you (or another instance of yourself) to resume work efficiently in a future context window where the conversation history will be replaced with this summary. Your summary should be structured, concise, and actionable. Include:
1. Task Overview
2. Current State
3. Important Discoveries
4. Next Steps
5. Context to Preserve
Be concise but complete. Write in a way that enables immediate resumption of the task.
Wrap your summary in <summary></summary> tags.`

/**
 * execution engine handles the conversation loop with Claude
 *
 * inspired by BetaToolRunner but with our own interface and React integration
 */
export class ExecutionEngine extends EventEmitter<ExecutionEngineEvents> {
  private client: Anthropic
  private config: ExecutionEngineConfig
  private store: AgentStore
  private iterationCount = 0
  private lastMessage: BetaMessage | null = null
  private aborted = false
  private agentInstance: AgentInstance | null = null
  private toolExecutionTimes = new Map<string, number>()

  constructor(config: ExecutionEngineConfig) {
    super()
    this.client = config.client
    this.config = config
    this.store = config.store
    this.agentInstance = config.agentInstance ?? null
  }

  get executionState(): AgentState {
    return this.store.getState().executionState
  }

  get messages(): readonly BetaMessageParam[] {
    return this.store.getState().messages
  }

  updateConfig(updates: Partial<ExecutionEngineConfig>): void {
    this.config = { ...this.config, ...updates }
  }

  pushMessage(message: BetaMessageParam): void {
    this.store.setState((s) => ({ messages: [...s.messages, message] }))
  }

  private transition(event: Parameters<typeof transition>[1]): void {
    const newState = transition(this.store.getState().executionState, event)
    this.store.setState({ executionState: newState })
    this.emit('stateChange', newState)
  }

  private buildParams(): CreateMessageParams {
    const tools: BetaToolUnion[] = []

    const {
      tools: internalTools = [],
      sdkTools = [],
      mcpServers = [],
    } = this.agentInstance ?? {}
    tools.push(...internalTools.map(toApiTool))
    tools.push(...sdkTools.map(toApiSdkTool))

    if (mcpServers?.length) {
      for (const server of mcpServers) {
        tools.push({
          type: 'mcp_toolset',
          mcp_server_name: server.name,
        })
      }
    }

    const betas: AnthropicBeta[] = []
    if (mcpServers?.length) {
      betas.push(ANTHROPIC_BETAS.MCP_CLIENT)
    }
    if (sdkTools.some(isCodeExecutionTool)) {
      betas.push(ANTHROPIC_BETAS.CODE_EXECUTION)
    }
    if (sdkTools.some(isMemoryTool)) {
      betas.push(ANTHROPIC_BETAS.CONTEXT_MANAGEMENT)
    }

    return {
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      system: this.config.system,
      messages: this.messages as BetaMessageParam[],
      tools: tools.length > 0 ? tools : undefined,
      mcp_servers: mcpServers?.length ? mcpServers : undefined,
      stop_sequences: this.config.stopSequences,
      temperature: this.config.temperature,
      betas: betas.length > 0 ? betas : undefined,
    }
  }

  async run(): Promise<AgentResult> {
    this.aborted = false
    this.iterationCount = 0

    try {
      while (!this.aborted) {
        if (
          this.config.maxIterations !== undefined &&
          this.iterationCount >= this.config.maxIterations
        ) {
          break
        }

        this.iterationCount++
        const abortController = new AbortController()
        this.transition({ type: 'start_streaming', abortController })

        const message = await this.makeApiCall(abortController)
        this.lastMessage = message
        this.emit('message', message)

        const assistantMessage: BetaMessageParam = {
          role: 'assistant',
          content: sanitizeContentBlocks(message.content),
        }
        this.pushMessage(assistantMessage)

        const toolUses = extractToolUses(message)
        if (toolUses.length > 0 && message.stop_reason === 'tool_use') {
          const pendingTools: PendingToolCall[] = toolUses.map((tu) => ({
            id: tu.id,
            name: tu.name,
            input: tu.input,
          }))

          this.transition({ type: 'tools_requested', pendingTools })

          const toolResults = await this.executeTools(pendingTools)

          const toolResultMessage: BetaMessageParam = {
            role: 'user',
            content: toolResults,
          }
          this.pushMessage(toolResultMessage)

          this.transition({ type: 'tools_completed', results: [] })

          // force React to commit any pending state updates from tool handlers
          flushSync(() => {})
          await yieldToSchedulerImmediate()

          await this.checkAndCompact()

          const stepResult = this.buildStepFinishResult(
            message,
            toolUses,
            toolResults,
          )
          this.emit('stepFinish', stepResult)
        } else {
          const stepResult = this.buildStepFinishResult(message, [], [])
          this.emit('stepFinish', stepResult)
          break
        }
      }

      if (!this.lastMessage) {
        throw new Error('Execution ended without receiving a message')
      }

      const result = this.buildResult()
      this.transition({ type: 'completed', finalMessage: this.lastMessage })
      this.emit('complete', result)
      return result
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.transition({ type: 'error', error: err })
      this.emit('error', err)
      throw err
    }
  }

  private async makeApiCall(
    abortController: AbortController,
  ): Promise<BetaMessage> {
    const params = this.buildParams()

    debug('api', `Request #${this.iterationCount}`, {
      model: params.model,
      tools: params.tools?.map((t) => ('name' in t ? t.name : t.type)),
      messageCount: params.messages.length,
      system: params.system
        ? `${params.system.substring(0, 80)}...`
        : undefined,
      ...(params.mcp_servers?.length
        ? { mcpServers: params.mcp_servers?.map((s) => s.name) }
        : {}),
    })

    let response: BetaMessage
    if (this.config.stream) {
      response = await this.streamApiCall(params, abortController)
    } else {
      response = await this.client.beta.messages.create(
        { ...params, stream: false },
        { signal: abortController.signal },
      )
    }

    debug('api', `Response #${this.iterationCount}`, {
      stopReason: response.stop_reason,
      toolUses: extractToolUses(response).map((t) => t.name),
      textLength: extractText(response).length,
      cacheCreation: response.usage.cache_creation_input_tokens,
      cacheRead: response.usage.cache_read_input_tokens,
    })

    return response
  }

  private async streamApiCall(
    params: CreateMessageParams,
    abortController: AbortController,
  ): Promise<BetaMessage> {
    const stream = this.client.beta.messages.stream(params, {
      signal: abortController.signal,
    })

    stream.on('text', (text, snapshot) => {
      this.emit('stream', { type: 'text', text, accumulated: snapshot })
    })

    stream.on('thinking', (thinking) => {
      this.emit('stream', { type: 'thinking', text: thinking })
    })

    stream.on('contentBlock', (block) => {
      if (block.type === 'tool_use') {
        this.emit('stream', {
          type: 'tool_use_start',
          toolName: block.name,
          toolId: block.id,
        })
      }
    })

    stream.on('inputJson', () => {})

    const finalMessage = await stream.finalMessage()

    this.emit('stream', {
      type: 'message_complete',
      stopReason: finalMessage.stop_reason ?? 'unknown',
    })

    return finalMessage
  }

  private async executeTools(
    pendingTools: PendingToolCall[],
  ): Promise<BetaToolResultBlockParam[]> {
    this.transition({ type: 'tools_executing', pendingTools })

    const currentState = this.executionState
    const context: ToolContext = {
      agentName: this.config.agentName ?? 'agent',
      client: this.client,
      signal:
        currentState.status === 'streaming'
          ? currentState.abortController.signal
          : undefined,
    }

    const { tools: internalTools = [], sdkTools = [] } =
      this.agentInstance ?? {}

    const results = await Promise.all(
      pendingTools.map(async (toolCall) => {
        const startTime = performance.now()

        const tool = internalTools.find((t) => t.name === toolCall.name)

        if (tool) {
          debug('tool', `Executing: ${toolCall.name}`, {
            input: toolCall.input,
          })
          const { result, isError } = await executeTool(
            tool,
            toolCall.input,
            context,
          )

          debug('tool', `Result: ${toolCall.name}`, {
            isError,
            input: toolCall.input,
            result:
              typeof result === 'string' ? result.substring(0, 100) : result,
          })

          const executionTime = performance.now() - startTime
          this.toolExecutionTimes.set(toolCall.id, executionTime)

          this.emit('stream', {
            type: 'tool_result',
            toolId: toolCall.id,
            result:
              typeof result === 'string' ? result : JSON.stringify(result),
            isError,
          })

          return {
            type: 'tool_result' as const,
            tool_use_id: toolCall.id,
            content: result,
            is_error: isError ? true : undefined,
          }
        }

        // check if it's an SDK tool
        const sdkTool = sdkTools.find(
          (t) => hasName(t) && t.name === toolCall.name,
        )

        if (sdkTool) {
          // Memory tool requires client-side handlers
          if (isMemoryTool(sdkTool) && sdkTool.memoryHandlers) {
            const { result, isError } = await executeMemoryTool(
              sdkTool,
              toolCall.input as Parameters<typeof executeMemoryTool>[1],
            )

            const executionTime = performance.now() - startTime
            this.toolExecutionTimes.set(toolCall.id, executionTime)

            this.emit('stream', {
              type: 'tool_result',
              toolId: toolCall.id,
              result:
                typeof result === 'string' ? result : JSON.stringify(result),
              isError,
            })

            return {
              type: 'tool_result' as const,
              tool_use_id: toolCall.id,
              content: result,
              is_error: isError ? true : undefined,
            }
          }

          // Other SDK tools are handled by Anthropic server-side
          const errorMessage = `Tool '${toolCall.name}' is a server-side tool and cannot be executed locally`
          const executionTime = performance.now() - startTime
          this.toolExecutionTimes.set(toolCall.id, executionTime)

          this.emit('stream', {
            type: 'tool_result',
            toolId: toolCall.id,
            result: errorMessage,
            isError: true,
          })

          return {
            type: 'tool_result' as const,
            tool_use_id: toolCall.id,
            content: errorMessage,
            is_error: true,
          }
        }

        const errorMessage = `Error: Tool '${toolCall.name}' not found`
        const executionTime = performance.now() - startTime
        this.toolExecutionTimes.set(toolCall.id, executionTime)

        this.emit('stream', {
          type: 'tool_result',
          toolId: toolCall.id,
          result: errorMessage,
          isError: true,
        })

        return {
          type: 'tool_result' as const,
          tool_use_id: toolCall.id,
          content: errorMessage,
          is_error: true,
        }
      }),
    )

    return results
  }

  private buildStepFinishResult(
    message: BetaMessage,
    toolUses: Array<{ id: string; name: string; input: unknown }>,
    toolResults: BetaToolResultBlockParam[],
  ): OnStepFinishResult {
    const text = extractText(message)

    const thinkingBlock = message.content.find(
      (b): b is Extract<BetaContentBlock, { type: 'thinking' }> =>
        b.type === 'thinking',
    )
    const thinking = thinkingBlock?.thinking

    const toolCalls: StepToolCall[] = toolUses.map((tu) => ({
      id: tu.id,
      name: tu.name,
      input: tu.input,
    }))

    const toolResultsWithTimes: StepToolResult[] = toolResults.map((tr) => {
      const toolUse = toolUses.find((tu) => tu.id === tr.tool_use_id)
      return {
        toolCallId: tr.tool_use_id,
        toolName: toolUse?.name ?? 'unknown',
        result: tr.content,
        isError: tr.is_error ?? false,
        executionTime: this.toolExecutionTimes.get(tr.tool_use_id),
      }
    })

    return {
      stepNumber: this.iterationCount,
      text,
      thinking,
      toolCalls,
      toolResults: toolResultsWithTimes,
      finishReason: message.stop_reason,
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cacheCreationTokens:
          message.usage.cache_creation_input_tokens ?? undefined,
        cacheReadTokens: message.usage.cache_read_input_tokens ?? undefined,
        totalTokens: message.usage.input_tokens + message.usage.output_tokens,
      },
      message,
      messages: [...this.messages],
      timestamp: new Date(),
    }
  }

  private async checkAndCompact(): Promise<boolean> {
    const compactionControl = this.config.compactionControl
    if (!compactionControl?.enabled) {
      return false
    }

    if (!this.lastMessage) {
      return false
    }

    const totalTokens =
      this.lastMessage.usage.input_tokens +
      this.lastMessage.usage.output_tokens +
      (this.lastMessage.usage.cache_creation_input_tokens ?? 0) +
      (this.lastMessage.usage.cache_read_input_tokens ?? 0)

    const threshold =
      compactionControl.contextTokenThreshold ?? DEFAULT_TOKEN_THRESHOLD

    if (totalTokens < threshold) {
      return false
    }

    const model = compactionControl.model ?? this.config.model
    const summaryPrompt =
      compactionControl.summaryPrompt ?? DEFAULT_SUMMARY_PROMPT

    const currentMessages = [...this.messages]
    const lastMessage = currentMessages[currentMessages.length - 1]
    if (
      lastMessage?.role === 'assistant' &&
      Array.isArray(lastMessage.content)
    ) {
      const nonToolBlocks = lastMessage.content.filter(
        (block: { type: string }) => block.type !== 'tool_use',
      )
      if (nonToolBlocks.length === 0) {
        currentMessages.pop()
      } else {
        currentMessages[currentMessages.length - 1] = {
          ...lastMessage,
          content: nonToolBlocks,
        }
      }
    }

    const response = await this.client.beta.messages.create({
      model,
      messages: [
        ...currentMessages,
        {
          role: 'user',
          content: [{ type: 'text', text: summaryPrompt }],
        },
      ],
      max_tokens: this.config.maxTokens,
    })

    const summaryBlock = response.content.find(
      (block): block is BetaTextBlock => block.type === 'text',
    )

    if (!summaryBlock) {
      return false
    }

    this.store.setState({
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: summaryBlock.text }],
        },
      ],
    })

    return true
  }

  private buildResult(): AgentResult {
    if (!this.lastMessage) {
      throw new Error('No message received')
    }

    return {
      content: extractText(this.lastMessage),
      messages: [...this.messages],
      usage: {
        inputTokens: this.lastMessage.usage.input_tokens,
        outputTokens: this.lastMessage.usage.output_tokens,
        cacheCreationInputTokens:
          this.lastMessage.usage.cache_creation_input_tokens ?? undefined,
        cacheReadInputTokens:
          this.lastMessage.usage.cache_read_input_tokens ?? undefined,
      },
      stopReason: this.lastMessage.stop_reason,
    }
  }

  abort(): void {
    this.aborted = true
    const currentState = this.executionState
    if (currentState.status === 'streaming') {
      currentState.abortController.abort()
    }
    const error = new Error('Execution aborted')
    this.transition({ type: 'error', error })
    this.emit('error', error)
  }
}
