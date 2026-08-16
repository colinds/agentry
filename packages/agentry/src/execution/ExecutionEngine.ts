import { EventEmitter } from 'eventemitter3'
import type {
  Api,
  CacheRetention,
  Model,
  Models,
  ThinkingLevel,
} from '@earendil-works/pi-ai'
import type {
  AgentState,
  AgentStreamEvent,
  AgentResult,
  PendingToolCall,
  ToolContext,
  OnStepFinishResult,
  StepToolCall,
  StepToolResult,
} from '../types'
import type { AgentInstance } from '../instances'
import { isMessageInstance } from '../instances'
import { evaluateConditions } from './conditions'
import {
  transition,
  TransitionType,
  AgentStatus,
  extractToolCalls,
  extractText,
} from '../types'
import { executeTool } from '../tools'
import { createRunAgent } from '../run/runAgentFunction'
import { debug } from '../debug'
import { buildSystemPrompt } from './createEngineConfig'
import type { AgentStore } from '../store'
import { collectChild } from '../reconciler/collectors'
import {
  isThinkingBlock,
  isTextBlock,
  toolResultMessage,
  userMessage,
  type AgentMessage,
  type AgentMessageParam,
  type ToolCall,
  type ToolResultMessage,
} from '../types/messages'
import { createTurn } from '../pi/turn'
import { resolveModel } from '../pi/models'
import { toPiTools } from '../pi/tools'
import { connectMcpServer, type McpConnection } from '../mcp'
import {
  diffResources,
  hasResourceChanges,
  narrateResourceDelta,
  snapshotResources,
  type ResourceSnapshot,
} from './resourceDiff'

interface ExecutionEngineEvents {
  stateChange: (state: AgentState) => void
  stream: (event: AgentStreamEvent) => void
  message: (message: AgentMessage) => void
  complete: (result: AgentResult) => void
  error: (error: Error) => void
  stepFinish: (result: OnStepFinishResult) => void
}

/** System prompts are a single string under pi; caching is a provider concern. */
export type SystemPrompt = string

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
  models: Models
  provider: string
  model: string
  maxTokens: number
  system?: SystemPrompt
  stream?: boolean
  maxIterations?: number
  compactionControl?: {
    enabled: boolean
    contextTokenThreshold?: number
    model?: string
    summaryPrompt?: string
  }
  temperature?: number
  agentName?: string
  agentInstance: AgentInstance
  store: AgentStore
  reasoning?: ThinkingLevel
  cacheRetention?: CacheRetention
  /** Per-run identifier used by providers for prompt-cache affinity. */
  sessionId?: string
}

function buildToolContext(
  config: ExecutionEngineConfig,
  signal: AbortSignal,
): ToolContext {
  return {
    agentName: config.agentName ?? 'agent',
    models: config.models,
    provider: config.provider,
    model: config.model,
    signal,
    runAgent: createRunAgent({
      models: config.models,
      provider: config.provider,
      model: config.model,
      signal,
    }),
  }
}

/**
 * Handles the conversation loop with the configured provider via pi.
 * Manages state transitions, tool execution, condition evaluation, and compaction.
 */
export class ExecutionEngine extends EventEmitter<ExecutionEngineEvents> {
  private config: ExecutionEngineConfig
  private store: AgentStore
  private resolvedModel: Model<Api>
  private iterationCount = 0
  private lastMessage: AgentMessage | null = null
  private aborted = false
  private agentInstance: AgentInstance
  private toolExecutionTimes = new Map<string, number>()
  /** Live MCP connections, keyed by server name. */
  private mcpConnections = new Map<string, McpConnection>()
  /** Last resource set narrated to the model, for turn-boundary diffing. */
  private lastNarratedResources: ResourceSnapshot | null = null

  /**
   * Async-aware step finish callback. Unlike the EventEmitter-based 'stepFinish'
   * event, this callback is awaited before the next iteration begins, allowing
   * consumers to perform async work (e.g. logging, persistence) that must complete
   * before execution continues.
   */
  onStepFinish?: (result: OnStepFinishResult) => void | Promise<void>

  /**
   * Renders the agent tree for the turn about to start. Supplied by the owning
   * handle, which knows the React element; the engine only knows *when*.
   */
  renderTurn?: () => Promise<void>

  constructor(config: ExecutionEngineConfig) {
    super()
    if (!config.provider) {
      throw new Error('Provider is required in execution engine config.')
    }
    if (!config.models) {
      throw new Error(
        'A pi Models collection is required in execution engine config.',
      )
    }
    this.config = config
    this.resolvedModel = resolveModel(
      config.models,
      config.provider,
      config.model,
    )
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
    if (updates.model || updates.provider || updates.models) {
      this.resolvedModel = resolveModel(
        this.config.models,
        this.config.provider,
        this.config.model,
      )
    }
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
    options?: { evaluateNL?: boolean; consecutiveFailures?: number },
  ): Promise<{ changed: boolean; consecutiveFailures: number }> {
    try {
      const changed = await evaluateConditions({
        root: this.agentInstance,
        messages: this.messages as AgentMessageParam[],
        models: this.config.models,
        provider: this.config.provider,
        signal,
        evaluateNL: options?.evaluateNL,
      })
      return { changed, consecutiveFailures: 0 }
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      if (err.name === 'AbortError' || signal?.aborted) throw err

      const failures = (options?.consecutiveFailures ?? 0) + 1

      if (failures >= 3) {
        throw new Error(
          `[agentry] NL condition evaluation failed ${failures} consecutive times (agent: ${this.config.agentName ?? 'unknown'}). Aborting to prevent silently stale conditions.`,
          { cause: err },
        )
      }

      debug(
        'conditions',
        `NL condition evaluation failed (agent: ${this.config.agentName ?? 'unknown'}, iteration: ${this.iterationCount}, consecutive failures: ${failures}), conditions may be stale due to evaluation failure`,
        { error: err.message },
      )
      console.error(
        `[agentry] NL condition evaluation failed (agent: ${this.config.agentName ?? 'unknown'}, iteration: ${this.iterationCount}, consecutive failures: ${failures}), conditions may be stale due to evaluation failure:`,
        err,
      )
      this.emit('error', err)
      return { changed: false, consecutiveFailures: failures }
    }
  }

  // todo(colin): not a huge fan on recollecting everything
  // ideally we should compute changesets and only recollect the necessary children
  // that is why this is still experimental
  private recollectAll(): void {
    this.agentInstance.tools = new Map()
    this.agentInstance.duplicateToolNames = new Set()
    this.agentInstance.systemParts = []
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
      let conditionEvalFailures = 0

      while (!this.aborted) {
        if (
          this.config.maxIterations !== undefined &&
          this.iterationCount >= this.config.maxIterations
        ) {
          break
        }

        this.iterationCount++
        const abortController = new AbortController()
        this.transition({
          type: TransitionType.StartStreaming,
          abortController,
        })

        // Turn-boundary render: the tree is rendered exactly once per turn,
        // immediately before the model call. State written during a turn (a
        // `setState` inside a tool handler, say) is deliberately not visible
        // until here, which is what removes the need to synchronize React
        // mid-turn.
        await this.renderTurn?.()

        const isFirstIteration = this.iterationCount === 1
        const conditionResult = await this.evaluateAllConditions(
          abortController.signal,
          {
            evaluateNL: isFirstIteration,
            consecutiveFailures: conditionEvalFailures,
          },
        )
        conditionEvalFailures = conditionResult.consecutiveFailures
        if (conditionResult.changed) {
          this.recollectAll()
        }

        await this.syncMcpConnections(abortController.signal)
        this.assertUniqueToolNames()
        this.narrateResourceChanges()

        const message = await this.makeApiCall(abortController)
        this.lastMessage = message
        this.emit('message', message)
        this.pushMessage(message)

        const toolCalls = extractToolCalls(message)
        if (toolCalls.length > 0 && message.stopReason === 'toolUse') {
          const pendingTools: PendingToolCall[] = toolCalls.map((tc) => ({
            id: tc.id,
            name: tc.name,
            input: tc.arguments,
          }))

          this.transition({ type: TransitionType.ToolsRequested, pendingTools })

          const toolResults = await this.executeTools(
            pendingTools,
            abortController,
          )

          // pi models each tool result as its own message rather than batching
          // them into a single user turn.
          for (const result of toolResults) {
            this.pushMessage(result)
          }

          this.transition({ type: TransitionType.ToolsCompleted, results: [] })

          await this.checkAndCompact(abortController.signal)

          const stepResult = this.buildStepFinishResult(
            message,
            toolCalls,
            toolResults,
          )
          this.emit('stepFinish', stepResult)
          await this.onStepFinish?.(stepResult)
        } else {
          const stepResult = this.buildStepFinishResult(message, [], [])
          this.emit('stepFinish', stepResult)
          await this.onStepFinish?.(stepResult)
          break
        }
      }

      if (!this.lastMessage) {
        throw new Error('Execution ended without receiving a message')
      }

      const result = this.buildResult()
      this.transition({
        type: TransitionType.Completed,
        finalMessage: this.lastMessage,
      })
      this.emit('complete', result)
      return result
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.transition({ type: TransitionType.Error, error: err })
      this.emit('error', err)
      throw err
    }
  }

  /**
   * Brings live MCP connections in line with the `<MCP>` servers currently in
   * the tree, then exposes their tools as ordinary agentry tools.
   *
   * pi has no MCP support by design, so servers are connected client-side and
   * each remote tool is proxied through `tools/call`. Connections are reused
   * across turns; a server that leaves the tree (for example when a
   * `<Condition>` deactivates) is disconnected.
   */
  private async syncMcpConnections(signal: AbortSignal): Promise<void> {
    const declared = this.agentInstance.mcpServers
    const declaredNames = new Set(declared.map((server) => server.name))

    for (const [name, connection] of this.mcpConnections) {
      if (!declaredNames.has(name)) {
        this.mcpConnections.delete(name)
        await connection.close().catch(() => {})
        debug('mcp', `Disconnected from "${name}" (no longer in tree)`)
      }
    }

    for (const server of declared) {
      if (this.mcpConnections.has(server.name)) continue
      const connection = await connectMcpServer(server, signal)
      this.mcpConnections.set(server.name, connection)
    }

    for (const connection of this.mcpConnections.values()) {
      for (const tool of connection.tools) {
        this.agentInstance.tools.set(tool.name, tool)
      }
    }
  }

  /**
   * Rejects duplicate tool names at the turn boundary, where the error is
   * legible — collection happens inside React's commit phase, so throwing
   * there surfaces as an unrelated failure.
   */
  private assertUniqueToolNames(): void {
    const duplicates = this.agentInstance.duplicateToolNames
    if (duplicates.size === 0) return

    const names = [...duplicates].sort().join(', ')
    throw new Error(
      `[agentry] Duplicate tool name(s): ${names}. Tool names must be unique within an agent.`,
    )
  }

  /**
   * Announces tool-set changes into the transcript at the turn boundary.
   *
   * Dynamic tools would otherwise appear and vanish with no explanation, which
   * the model has no way to interpret.
   */
  private narrateResourceChanges(): void {
    const snapshot = snapshotResources(this.agentInstance.tools.values())
    const delta = diffResources(this.lastNarratedResources, snapshot)

    if (hasResourceChanges(delta)) {
      const narration = narrateResourceDelta(delta)
      this.pushMessage(userMessage(narration))
      debug('resources', narration)

      // Changing the tool set rewrites the provider's tools array, which
      // invalidates its prompt cache. Gate tools on rarely-changing state.
      debug(
        'resources',
        'Tool set changed between turns — this invalidates the provider prompt cache.',
      )
    }

    this.lastNarratedResources = snapshot
  }

  /** Closes every live MCP connection. Called when the owning handle closes. */
  async closeMcpConnections(): Promise<void> {
    const connections = [...this.mcpConnections.values()]
    this.mcpConnections.clear()
    await Promise.all(connections.map((c) => c.close().catch(() => {})))
  }

  private async makeApiCall(
    abortController: AbortController,
  ): Promise<AgentMessage> {
    const system = buildSystemPrompt(this.agentInstance)
    const startTime = performance.now()
    const message = await createTurn(this.config.models, {
      model: this.resolvedModel,
      context: {
        systemPrompt: system,
        messages: this.messages as AgentMessageParam[],
        tools: toPiTools([...this.agentInstance.tools.values()]),
      },
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
      reasoning: this.config.reasoning,
      cacheRetention: this.config.cacheRetention,
      sessionId: this.config.sessionId,
      stream: this.config.stream ?? false,
      signal: abortController.signal,
      onStream: (event) => this.emit('stream', event),
    })
    const durationMs = Math.round(performance.now() - startTime)
    debug('api', `Response #${this.iterationCount}`, {
      durationMs,
      stopReason: message.stopReason,
      toolUses: extractToolCalls(message).map((t) => t.name),
      textLength: extractText(message).length,
    })
    return message
  }

  private async executeTools(
    pendingTools: PendingToolCall[],
    abortController: AbortController,
  ): Promise<ToolResultMessage[]> {
    this.transition({ type: TransitionType.ToolsExecuting, pendingTools })

    const signal = abortController.signal
    const context = buildToolContext(this.config, signal)

    const internalTools = this.agentInstance.tools

    const results = await Promise.all(
      pendingTools.map(async (toolCall) => {
        const startTime = performance.now()

        const tool = internalTools.get(toolCall.name)

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

        debug('tool', `Tool "${toolCall.name}" not found`, {
          available: [...internalTools.keys()],
        })
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
    result: ToolResultMessage['content'] | string
    isError: boolean
  }): ToolResultMessage {
    const { toolCall, startTime, result, isError } = opts
    const executionTime = performance.now() - startTime
    this.toolExecutionTimes.set(toolCall.id, executionTime)

    this.emit('stream', {
      type: 'tool_result',
      toolId: toolCall.id,
      result: typeof result === 'string' ? result : JSON.stringify(result),
      isError,
    })

    return toolResultMessage({
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      content: result,
      isError,
    })
  }

  private buildStepFinishResult(
    message: AgentMessage,
    toolCalls: ToolCall[],
    toolResults: ToolResultMessage[],
  ): OnStepFinishResult {
    const text = extractText(message)
    const thinking = message.content.find(isThinkingBlock)?.thinking

    const stepToolCalls: StepToolCall[] = toolCalls.map((tc) => ({
      id: tc.id,
      name: tc.name,
      input: tc.arguments,
    }))

    const toolResultsWithTimes: StepToolResult[] = toolResults.map((tr) => ({
      toolCallId: tr.toolCallId,
      toolName: tr.toolName,
      result: tr.content,
      isError: tr.isError,
      executionTime: this.toolExecutionTimes.get(tr.toolCallId),
    }))

    return {
      stepNumber: this.iterationCount,
      text,
      thinking,
      toolCalls: stepToolCalls,
      toolResults: toolResultsWithTimes,
      finishReason: message.stopReason,
      usage: {
        inputTokens: message.usage.input,
        outputTokens: message.usage.output,
        cacheCreationTokens: message.usage.cacheWrite,
        cacheReadTokens: message.usage.cacheRead,
        totalTokens: message.usage.totalTokens,
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
        inputTokens: this.lastMessage.usage.input,
        outputTokens: this.lastMessage.usage.output,
        cacheCreationInputTokens: this.lastMessage.usage.cacheWrite,
        cacheReadInputTokens: this.lastMessage.usage.cacheRead,
        costUSD: this.lastMessage.usage.cost.total,
      },
      thinking,
      stopReason: this.lastMessage.stopReason,
    }
  }

  abort(): void {
    this.aborted = true
    const currentState = this.executionState
    if (currentState.status === AgentStatus.Streaming) {
      currentState.abortController.abort()
    }
    const error = new Error('Execution aborted')
    error.name = 'AbortError'
    this.transition({ type: TransitionType.Error, error })
    this.emit('error', error)
  }

  private async checkAndCompact(signal?: AbortSignal): Promise<boolean> {
    const compactionControl = this.config.compactionControl
    if (!compactionControl?.enabled || !this.lastMessage) {
      return false
    }

    const totalTokens = this.lastMessage.usage.totalTokens

    const threshold =
      compactionControl.contextTokenThreshold ?? DEFAULT_TOKEN_THRESHOLD

    if (totalTokens < threshold) {
      return false
    }

    const summaryPrompt =
      compactionControl.summaryPrompt ?? DEFAULT_SUMMARY_PROMPT
    const currentMessages = [...this.messages] as AgentMessageParam[]

    try {
      const compactionModel = compactionControl.model
        ? resolveModel(
            this.config.models,
            this.config.provider,
            compactionControl.model,
          )
        : this.resolvedModel

      const message = await createTurn(this.config.models, {
        model: compactionModel,
        context: {
          messages: [...currentMessages, userMessage(summaryPrompt)],
          tools: [],
        },
        maxTokens: this.config.maxTokens,
        stream: false,
        signal: signal ?? AbortSignal.timeout(60_000),
        onStream: () => {},
      })

      const summaryText = message.content
        .filter(isTextBlock)
        .map((block) => block.text)
        .join('')

      if (!summaryText) {
        const err = new Error(
          `[agentry] Compaction: model returned no text summary (agent: ${this.config.agentName ?? 'unknown'})`,
        )
        console.warn(err.message)
        this.emit('error', err)
        return false
      }

      this.store
        .getState()
        .actions.setMessages([
          userMessage([{ type: 'text', text: summaryText }]),
        ])
      return true
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      // Re-throw abort errors — the agent is being cancelled
      if (err.name === 'AbortError') throw err
      // Re-throw fatal errors (auth failures, invalid model) — these won't resolve on retry
      const status = (err as { status?: number }).status
      if (status === 401 || status === 403 || status === 404) {
        throw err
      }
      // Re-throw programming errors — these indicate bugs, not transient failures
      if (
        err instanceof TypeError ||
        err instanceof ReferenceError ||
        err instanceof SyntaxError
      ) {
        throw err
      }
      const compactionModel = compactionControl.model ?? this.config.model
      const tokenCount = this.lastMessage?.usage.totalTokens ?? 0
      console.warn(
        `[agentry] Compaction failed for agent "${this.config.agentName ?? 'unknown'}" ` +
          `(model: ${compactionModel}, tokens: ${tokenCount}): ${err.message}. ` +
          `Continuing without compaction.`,
      )
      this.emit('error', err)
      return false
    }
  }
}
