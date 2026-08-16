import { EventEmitter } from 'eventemitter3'
import { createElement, type ReactNode } from 'react'
import type { AgentInstance } from '../instances'
import type { AgentResult, AgentStreamEvent } from '../types/agent'
import type { AgentMessageParam } from '../types/messages'
import type { AgentStore } from '../store'
import type { OnStepFinishResult } from '../types/lifecycle'
import {
  unmountContainer,
  flushSync,
  updateContainer,
  type ContainerInfo,
} from '../reconciler/renderer'
import {
  ExecutionEngine,
  createEngineConfig,
  type ExecutionEngineConfig,
} from '../execution'
import { isProcessing, type AgentState } from '../types/state'
import { yieldToScheduler } from '../scheduler'
import { AgentProvider } from '../context'
import { userMessage } from '../types/messages'
import { describeMissingAuth, getDefaultModels } from '../pi/models'
import {
  describeContextUsage,
  type ContextUsage,
} from '../execution/contextUsage'
import { cleanupSessionResources, type Models } from '@earendil-works/pi-ai'

interface AgentHandleEvents {
  stateChange: (state: AgentState) => void
  stream: (event: AgentStreamEvent) => void
  complete: (result: AgentResult) => void
  error: (error: Error) => void
  stepFinish: (result: OnStepFinishResult) => void
}

/**
 * Abstract base class for agent handles
 * Contains shared execution logic for both regular agents and subagents
 */
export abstract class AbstractAgentHandle extends EventEmitter<AgentHandleEvents> {
  protected containerInfo: ContainerInfo
  protected engine: ExecutionEngine | null = null
  protected models: Models | undefined
  protected running = false
  protected store: AgentStore
  protected instance: AgentInstance | null = null
  /** Per-handle identifier used by pi for prompt-cache affinity. */
  protected sessionId: string

  constructor({
    models,
    containerInfo,
    store,
    sessionId,
  }: {
    models?: Models
    containerInfo: ContainerInfo
    store: AgentStore
    sessionId?: string
  }) {
    super()
    this.models = models
    this.containerInfo = containerInfo
    this.store = store
    this.sessionId = sessionId ?? crypto.randomUUID()
  }

  /**
   * Resolves the model collection, falling back to pi's full built-in catalog.
   * Lazy so that `createAgent()` can stay synchronous.
   */
  protected async ensureModels(): Promise<Models> {
    this.models ??= await getDefaultModels()
    return this.models
  }

  get state(): AgentState {
    return this.store.getState().executionState
  }

  get messages(): readonly AgentMessageParam[] {
    return this.store.getState().messages
  }

  get isRunning(): boolean {
    return this.running
  }

  protected pushMessage(message: AgentMessageParam): void {
    this.store.getState().actions.pushMessage(message)
  }

  /**
   * Hook called immediately before starting the execution engine
   * Subclasses can override to perform validation or setup
   */
  protected abstract beforeExecution(
    agent: AgentInstance,
    config: ExecutionEngineConfig,
    messages: readonly AgentMessageParam[],
  ): void

  /**
   * Core execution logic - runs an agent instance to completion
   * Handles engine creation, event wiring, execution, and callbacks
   */
  protected async executeAgent(
    agent: AgentInstance,
    options: {
      emitEvents?: boolean
    } = {},
  ): Promise<AgentResult> {
    const { emitEvents = true } = options

    const models = await this.ensureModels()

    if (agent.props.provider) {
      const missingAuth = await describeMissingAuth(
        models,
        agent.props.provider,
      )
      if (missingAuth) throw new Error(missingAuth)
    }

    const { config } = createEngineConfig({
      agent,
      models,
      store: this.store,
      sessionId: this.sessionId,
    })

    this.beforeExecution(agent, config, this.store.getState().messages)

    this.engine = new ExecutionEngine(config)

    // The engine decides when a turn starts; the handle knows what to render.
    this.engine.renderTurn = () => this.renderTurn()

    // Wire up async-aware onStepFinish so the engine awaits it before
    // proceeding to the next iteration.
    this.engine.onStepFinish = async (result: OnStepFinishResult) => {
      try {
        await agent.props.onStepFinish?.(result)
      } catch (err) {
        throw new Error('[agentry] onStepFinish callback threw', { cause: err })
      }
    }

    let onStateChange: ((state: AgentState) => void) | undefined
    const onStream = (event: AgentStreamEvent) => {
      if (emitEvents) this.emit('stream', event)
      agent.props.onMessage?.(event)
    }
    const onError = (error: Error) => {
      if (emitEvents) this.emit('error', error)
      agent.props.onError?.(error)
    }
    const onStepFinish = (result: OnStepFinishResult) => {
      if (emitEvents) this.emit('stepFinish', result)
    }

    try {
      if (emitEvents) {
        onStateChange = (state: AgentState) => this.emit('stateChange', state)
        this.engine.on('stateChange', onStateChange)
      }
      this.engine.on('stream', onStream)
      this.engine.on('error', onError)
      this.engine.on('stepFinish', onStepFinish)

      const result = await this.engine.run()

      if (emitEvents) {
        this.emit('complete', result)
      }
      agent.props.onComplete?.(result)

      return result
    } finally {
      if (this.engine) {
        if (onStateChange) this.engine.off('stateChange', onStateChange)
        if (onStream) this.engine.off('stream', onStream)
        if (onError) this.engine.off('error', onError)
        if (onStepFinish) this.engine.off('stepFinish', onStepFinish)
      }
    }
  }

  /**
   * Render React children with AgentProvider wrapper
   * Uses flushSync for consistent synchronous completion, then yields to scheduler
   * This ensures React effects complete before execution starts
   */
  protected async renderWithProvider(children: ReactNode): Promise<void> {
    const wrappedElement = createElement(AgentProvider, {
      store: this.store,
      children,
    })

    await new Promise<void>((resolve) => {
      flushSync(() => {
        updateContainer(wrappedElement, this.containerInfo, resolve)
      })
    })

    // yield to React's scheduler for pending effects
    await yieldToScheduler()
  }

  /**
   * Reports what is filling the context window: the assembled system prompt,
   * each tool's definition, and the message history, against the model's
   * window.
   *
   * Available once the agent has been prepared (after the first `run()`), since
   * the tool set is only known after a render.
   */
  describeContext(): ContextUsage | undefined {
    if (!this.instance) return undefined

    const provider = this.instance.props.provider
    const modelId = this.instance.props.model
    let contextWindow: number | undefined

    if (this.models && provider && modelId) {
      contextWindow = this.models.getModel(provider, modelId)?.contextWindow
    }

    // The most recent assistant turn carries what the provider actually
    // charged, which is the only trustworthy absolute figure.
    const messages = this.store.getState().messages
    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m.role === 'assistant')
    const reportedInputTokens =
      lastAssistant && 'usage' in lastAssistant
        ? lastAssistant.usage.input
        : undefined

    return describeContextUsage({
      agent: this.instance,
      messages,
      contextWindow,
      reportedInputTokens,
    })
  }

  /**
   * Re-renders the agent tree at a turn boundary. Subclasses know which element
   * to render; the default is a no-op for handles with nothing to re-render.
   */
  protected async renderTurn(): Promise<void> {}

  /**
   * Abstract method to prepare the agent instance before execution
   * Subclasses implement this to handle their specific setup
   */
  protected abstract prepareAgent(): Promise<AgentInstance>

  /**
   * Run the agent - delegates to prepareAgent then executes
   */
  async run(firstMessage?: string): Promise<AgentResult> {
    if (this.running) {
      throw new Error('Agent is already running')
    }

    this.running = true

    try {
      const agent = await this.prepareAgent()
      this.instance = agent

      if (firstMessage) {
        this.pushMessage(userMessage(firstMessage))
      }

      return await this.executeAgent(agent, {
        emitEvents: this.shouldEmitEvents(),
      })
    } finally {
      this.running = false
    }
  }

  /**
   * Whether this handle should emit events (true for regular agents, false for subagents)
   */
  protected abstract shouldEmitEvents(): boolean

  async sendMessage(content: string): Promise<AgentResult> {
    if (this.running) {
      throw new Error(
        'Agent is already running. Wait for current execution to complete or call abort() first.',
      )
    }

    return this.run(content)
  }

  async *stream(
    message: string,
  ): AsyncGenerator<AgentStreamEvent, AgentResult, undefined> {
    if (this.running) {
      throw new Error(
        'Agent is already running. Wait for current execution to complete or call abort() first.',
      )
    }

    const events: AgentStreamEvent[] = []
    let resolveNext: ((event: AgentStreamEvent | null) => void) | null = null
    let done = false
    let result: AgentResult | null = null
    let error: Error | null = null

    const onStream = (event: AgentStreamEvent) => {
      if (resolveNext) {
        resolveNext(event)
        resolveNext = null
      } else {
        events.push(event)
      }
    }

    const onComplete = (r: AgentResult) => {
      done = true
      result = r
      if (resolveNext) {
        resolveNext(null)
        resolveNext = null
      }
    }

    const onError = (e: Error) => {
      done = true
      error = e
      if (resolveNext) {
        resolveNext(null)
        resolveNext = null
      }
    }

    this.on('stream', onStream)
    this.on('complete', onComplete)
    this.on('error', onError)

    const runPromise = this.run(message).catch((e: unknown) => {
      error = e instanceof Error ? e : new Error(String(e))
      done = true
      if (resolveNext) {
        resolveNext(null)
        resolveNext = null
      }
    })

    try {
      while (!done) {
        if (events.length > 0) {
          yield events.shift()!
        } else {
          const event = await new Promise<AgentStreamEvent | null>(
            (resolve) => {
              resolveNext = resolve
            },
          )
          if (event) {
            yield event
          }
        }
      }

      while (events.length > 0) {
        yield events.shift()!
      }

      if (error) {
        throw error
      }

      await runPromise

      if (!result) {
        throw new Error('No result received')
      }

      return result
    } finally {
      this.off('stream', onStream)
      this.off('complete', onComplete)
      this.off('error', onError)
    }
  }

  abort(): void {
    this.engine?.abort()
  }

  close(): void {
    const state = this.store.getState().executionState
    if (isProcessing(state)) {
      this.abort()
    }

    this.cleanup()
    flushSync(() => {
      unmountContainer(this.containerInfo)
    })
    this.removeAllListeners()
  }

  /**
   * Subclasses can override for additional cleanup.
   * pi is stateless per turn, but MCP connections are long-lived and must be
   * torn down with the handle.
   */
  protected cleanup(): void {
    void this.engine?.closeMcpConnections()
    // Providers key long-lived resources (pooled sockets, cached sessions) by
    // session id; nothing else releases them.
    cleanupSessionResources(this.sessionId)
  }

  /**
   * Test-only method to access containerInfo for testing purposes
   * @internal This method is only intended for use in tests
   */
  __getContainerInfo(): ContainerInfo {
    return this.containerInfo
  }
}
