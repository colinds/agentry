import { EventEmitter } from 'eventemitter3'
import { yieldToSchedulerImmediate } from '../scheduler'
import type {
  AgentState,
  AgentStreamEvent,
  AgentResult,
  PendingToolCall,
  ToolContext,
  Model,
  OnStepFinishResult,
  StepToolCall,
  StepToolResult,
  ThinkingConfig,
} from '../types'
import type { AgentInstance } from '../instances'
import { isMessageInstance } from '../instances'
import { evaluateConditions } from './conditions'
import {
  transition,
  extractToolUses,
  extractText,
  isMemoryTool,
} from '../types'
import { executeTool } from '../tools'
import { executeMemoryTool, type MemoryToolInput } from '../tools/memoryTool'
import { createRunAgent } from '../run/runAgentFunction'
import { debug } from '../debug'
import { buildSystemPrompt } from './createEngineConfig'
import { flushSync } from '../reconciler/renderer'
import type { AgentStore } from '../store'
import { collectChild } from '../reconciler/collectors'
import {
  isThinkingBlock,
  type AgentMessage,
  type AgentMessageParam,
  type ToolResultContentBlock,
} from '../types/messages'
import type { ProviderName } from '../types/provider'
import type {
  ProviderAdapter,
  ProviderClientMap,
  SystemBlock,
} from '../providers/types'
import { createDefaultAdapters } from '../providers'
import type Anthropic from '@anthropic-ai/sdk'
import type OpenAI from 'openai'
import type {
  BetaMessage,
  BetaMessageParam,
  BetaTextBlock,
} from '@anthropic-ai/sdk/resources/beta'
import type { Model as AnthropicModel } from '@anthropic-ai/sdk/resources/messages'
import { toOpenAIInput } from '../providers/openai'
import type { z } from 'zod'

export interface ExecutionEngineEvents {
  stateChange: (state: AgentState) => void
  stream: (event: AgentStreamEvent) => void
  message: (message: AgentMessage) => void
  complete: (result: AgentResult) => void
  error: (error: Error) => void
  stepFinish: (result: OnStepFinishResult) => void
}

export type SystemPrompt = string | SystemBlock[]

const DEFAULT_TOKEN_THRESHOLD = 100_000

const DEFAULT_SUMMARY_PROMPT = `You have been working on the task described above but have not yet completed it. Write a continuation summary that will allow you (or another instance of yourself) to resume work efficiently in a future context window where the conversation history will be replaced with this summary. Your summary should be structured, concise, and actionable. Include:
1. Task Overview
2. Current State
3. Important Discoveries
4. Next Steps
5. Context to Preserve
Be concise but complete. Write in a way that enables immediate resumption of the task.
Wrap your summary in <summary></summary> tags.`

export interface ExecutionEngineConfig {
  provider: ProviderName
  client: ProviderClientMap[ProviderName]
  clients?: Partial<ProviderClientMap>
  adapters?: Record<ProviderName, ProviderAdapter<ProviderName>>
  model: Model
  maxTokens: number
  system?: SystemPrompt
  stream?: boolean
  maxIterations?: number
  compactionControl?: {
    enabled: boolean
    contextTokenThreshold?: number
    model?: Model
    summaryPrompt?: string
  }
  stopSequences?: string[]
  temperature?: number
  agentName?: string
  agentInstance: AgentInstance
  store: AgentStore
  thinking?: ThinkingConfig
  betas?: string[]
}

function hasName(t: object | null): t is { name: string } {
  return typeof t === 'object' && t !== null && 'name' in t
}

function isMemoryToolInput(
  input: z.output<z.ZodType>,
): input is MemoryToolInput {
  return (
    typeof input === 'object' &&
    input !== null &&
    'command' in input &&
    typeof input.command === 'string'
  )
}

/**
 * Handles the conversation loop with the configured AI provider via a ProviderAdapter.
 * Manages state transitions, tool execution, condition evaluation, and compaction.
 */
export class ExecutionEngine extends EventEmitter<ExecutionEngineEvents> {
  private client: ProviderClientMap[ProviderName]
  private adapter: ProviderAdapter<ProviderName>
  private config: ExecutionEngineConfig
  private store: AgentStore
  private iterationCount = 0
  private lastMessage: AgentMessage | null = null
  private aborted = false
  private agentInstance: AgentInstance
  private toolExecutionTimes = new Map<string, number>()

  constructor(config: ExecutionEngineConfig) {
    super()
    this.client = config.client
    if (!config.provider) {
      throw new Error('Provider is required in execution engine config.')
    }
    const provider = config.provider
    const adapters = config.adapters ?? createDefaultAdapters()
    this.adapter = adapters[provider]
    this.config = {
      ...config,
      provider,
      adapters,
      clients: config.clients ?? {},
    }
    this.store = config.store
    this.agentInstance = config.agentInstance
  }

  get executionState(): AgentState {
    return this.store.getState().executionState
  }

  get messages(): readonly AgentMessageParam[] {
    return this.store.getState().messages
  }

  updateConfig(updates: Partial<ExecutionEngineConfig>): void {
    this.config = { ...this.config, ...updates }
  }

  pushMessage(message: AgentMessageParam): void {
    this.store.getState().actions.pushMessage(message)
  }

  private transition(event: Parameters<typeof transition>[1]): void {
    const newState = transition(this.store.getState().executionState, event)
    this.store.getState().actions.setExecutionState(newState)
    this.emit('stateChange', newState)
  }

  private async evaluateAllConditions(
    signal?: AbortSignal,
    options?: { evaluateNL?: boolean },
  ): Promise<boolean> {
    try {
      return await evaluateConditions(
        this.agentInstance,
        this.messages as AgentMessageParam[],
        this.config.clients ?? {},
        this.config.provider,
        this.config.model,
        signal,
        options,
      )
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      if (err.name === 'AbortError') throw err
      console.error(
        '[agentry] NL condition evaluation failed, conditions unchanged:',
        err,
      )
      this.emit('error', err)
      return false
    }
  }

  // todo(colin): not a huge fan on recollecting everything
  // ideally we should compute changesets and only recollect the necessary children
  // that is why this is still experimental
  private recollectAll(): void {
    this.agentInstance.tools = []
    this.agentInstance.systemParts = []
    this.agentInstance.sdkTools = []
    this.agentInstance.mcpServers = []

    for (const child of this.agentInstance.children) {
      if (isMessageInstance(child)) {
        continue
      }
      collectChild(this.agentInstance, child)
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

        const isFirstIteration = this.iterationCount === 1
        const conditionsChanged = await this.evaluateAllConditions(
          abortController.signal,
          { evaluateNL: isFirstIteration }, // only evaluate NL conditions from the user's history
        )
        if (conditionsChanged) {
          this.recollectAll()
        }

        const message = await this.makeApiCall(abortController)
        this.lastMessage = message
        this.emit('message', message)

        const assistantMessage: AgentMessageParam = {
          role: 'assistant',
          content: message.content,
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

          const toolResults = await this.executeTools(
            pendingTools,
            abortController,
          )

          const toolResultMessage: AgentMessageParam = {
            role: 'user',
            content: toolResults,
          }
          this.pushMessage(toolResultMessage)

          this.transition({ type: 'tools_completed', results: [] })

          // force React to commit any pending state updates from tool handlers
          flushSync(() => {})
          await yieldToSchedulerImmediate()
          await this.checkAndCompact(abortController.signal)

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
  ): Promise<AgentMessage> {
    const system = buildSystemPrompt(this.agentInstance)
    const startTime = performance.now()
    const response = await this.adapter.createTurn(this.client, {
      model: this.config.model,
      maxTokens: this.config.maxTokens,
      system,
      messages: this.messages as AgentMessageParam[],
      tools: this.agentInstance.tools,
      sdkTools: this.agentInstance.sdkTools,
      mcpServers: this.agentInstance.mcpServers,
      stopSequences: this.config.stopSequences,
      temperature: this.config.temperature,
      thinking: this.config.thinking,
      betas: this.config.betas,
      stream: this.config.stream,
      signal: abortController.signal,
      onStream: (event) => this.emit('stream', event),
    })
    const durationMs = Math.round(performance.now() - startTime)
    debug('api', `Response #${this.iterationCount}`, {
      durationMs,
      stopReason: response.message.stop_reason,
      toolUses: extractToolUses(response.message).map((t) => t.name),
      textLength: extractText(response.message).length,
    })
    return response.message
  }

  private async executeTools(
    pendingTools: PendingToolCall[],
    abortController: AbortController,
  ): Promise<ToolResultContentBlock[]> {
    this.transition({ type: 'tools_executing', pendingTools })

    const signal = abortController.signal
    const providerFields =
      this.config.provider === 'anthropic'
        ? {
            provider: 'anthropic' as const,
            client: this.client as ProviderClientMap['anthropic'],
          }
        : {
            provider: 'openai' as const,
            client: this.client as ProviderClientMap['openai'],
          }
    const context: ToolContext = {
      agentName: this.config.agentName ?? 'agent',
      clients: this.config.clients,
      model: this.config.model,
      signal,
      runAgent: createRunAgent({
        provider: this.config.provider,
        clients: this.config.clients,
        model: this.config.model,
        signal,
      }),
      ...providerFields,
    }

    const { tools: internalTools = [], sdkTools = [] } = this.agentInstance

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

          return this.buildToolResult({
            toolCall,
            startTime,
            result,
            isError,
          })
        }

        // check if it's an SDK tool
        const sdkTool = sdkTools.find(
          (t) => hasName(t) && t.name === toolCall.name,
        )

        if (sdkTool) {
          // Memory tool requires client-side handlers
          if (isMemoryTool(sdkTool) && sdkTool.memoryHandlers) {
            if (!isMemoryToolInput(toolCall.input)) {
              return {
                type: 'tool_result' as const,
                tool_use_id: toolCall.id,
                content: 'Error: Invalid memory tool input payload',
                is_error: true,
              }
            }
            const { result, isError } = await executeMemoryTool(
              sdkTool,
              toolCall.input,
            )

            return this.buildToolResult({
              toolCall,
              startTime,
              result,
              isError,
            })
          }

          // Non-memory SDK tools (web_search, code_interpreter) are dispatched to the provider and handled server-side
          return this.buildToolResult({
            toolCall,
            startTime,
            result: `Tool '${toolCall.name}' is a server-side tool and cannot be executed locally`,
            isError: true,
          })
        }

        return this.buildToolResult({
          toolCall,
          startTime,
          result: `Error: Tool '${toolCall.name}' not found`,
          isError: true,
        })
      }),
    )

    return results
  }

  private buildToolResult(opts: {
    toolCall: PendingToolCall
    startTime: number
    result: ToolResultContentBlock['content']
    isError: boolean
  }): ToolResultContentBlock {
    const { toolCall, startTime, result, isError } = opts
    const executionTime = performance.now() - startTime
    this.toolExecutionTimes.set(toolCall.id, executionTime)

    this.emit('stream', {
      type: 'tool_result',
      toolId: toolCall.id,
      result: typeof result === 'string' ? result : JSON.stringify(result),
      isError,
    })

    return {
      type: 'tool_result',
      tool_use_id: toolCall.id,
      content: result,
      is_error: isError ? true : undefined,
    } as ToolResultContentBlock
  }

  private buildStepFinishResult(
    message: AgentMessage,
    toolUses: Array<{ id: string; name: string; input: z.output<z.ZodType> }>,
    toolResults: ToolResultContentBlock[],
  ): OnStepFinishResult {
    const text = extractText(message)
    const thinking = message.content.find(isThinkingBlock)?.thinking

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

  private buildResult(): AgentResult {
    if (!this.lastMessage) {
      throw new Error('No message received')
    }

    const thinking = this.lastMessage.content.find(isThinkingBlock)?.thinking

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
      thinking,
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

  private async checkAndCompact(signal?: AbortSignal): Promise<boolean> {
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

    const summaryPrompt =
      compactionControl.summaryPrompt ?? DEFAULT_SUMMARY_PROMPT
    const currentMessages = [...this.messages]
    const provider = this.config.provider

    if (provider === 'anthropic') {
      const model = (compactionControl.model ??
        this.config.model) as AnthropicModel
      const client = this.client as Anthropic
      let response: BetaMessage
      try {
        response = await client.beta.messages.create(
          {
            model,
            messages: [
              ...(currentMessages as BetaMessageParam[]),
              {
                role: 'user',
                content: [{ type: 'text', text: summaryPrompt }],
              },
            ],
            max_tokens: this.config.maxTokens,
            betas: this.config.betas?.length ? this.config.betas : undefined,
          },
          { signal },
        )
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e))
        console.error(
          '[agentry] Compaction API call failed, continuing without compaction:',
          err,
        )
        this.emit('error', err)
        return false
      }

      const summaryBlock = response.content.find(
        (block): block is BetaTextBlock => block.type === 'text',
      )
      if (!summaryBlock) {
        console.warn('[agentry] Compaction: model returned no text summary')
        return false
      }

      this.store.getState().actions.setMessages([
        {
          role: 'user',
          content: [{ type: 'text', text: summaryBlock.text }],
        },
      ])
      return true
    } else if (provider === 'openai') {
      const model = compactionControl.model ?? this.config.model
      const client = this.client as OpenAI
      const input = [
        ...toOpenAIInput(currentMessages),
        { role: 'user' as const, content: summaryPrompt },
      ]
      let oaiResponse: OpenAI.Responses.Response
      try {
        oaiResponse = await client.responses.create(
          {
            model,
            input,
            max_output_tokens: this.config.maxTokens,
            stream: false,
          },
          { signal },
        )
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e))
        console.error(
          '[agentry] Compaction API call failed, continuing without compaction:',
          err,
        )
        this.emit('error', err)
        return false
      }

      const summaryText = oaiResponse.output
        .flatMap((item) =>
          item.type === 'message' && Array.isArray(item.content)
            ? item.content
            : [],
        )
        .filter(
          (part): part is OpenAI.Responses.ResponseOutputText =>
            part.type === 'output_text',
        )[0]?.text
      if (!summaryText) {
        console.warn('[agentry] Compaction: model returned no text summary')
        return false
      }

      this.store
        .getState()
        .actions.setMessages([
          { role: 'user', content: [{ type: 'text', text: summaryText }] },
        ])
      return true
    } else {
      console.warn(
        `[agentry] Compaction not implemented for provider: ${provider}`,
      )
      return false
    }
  }
}
