import Anthropic from '@anthropic-ai/sdk'
import { EventEmitter } from 'eventemitter3'
import { createElement, type ReactNode } from 'react'
import type { AgentInstance } from '../instances/types.ts'
import type { AgentResult, AgentStreamEvent } from '../types/agent.ts'
import type { BetaMessageParam } from '../types/messages.ts'
import type { AgentStore } from '../store.ts'
import type { OnStepFinishResult } from '../types/lifecycle.ts'
import {
  unmountContainer,
  flushSync,
  updateContainer,
  type ContainerInfo,
} from '../reconciler/renderer.ts'
import { ExecutionEngine, createEngineConfig } from '../execution/index.ts'
import { isProcessing, type AgentState } from '../types/state.ts'
import { yieldToScheduler } from '../scheduler.ts'
import { AgentProvider } from '../context.ts'

export interface AgentHandleEvents {
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
  protected client: Anthropic
  protected running = false
  protected store: AgentStore
  protected instance: AgentInstance | null = null

  constructor(
    client: Anthropic,
    containerInfo: ContainerInfo,
    store: AgentStore,
  ) {
    super()
    this.client = client
    this.containerInfo = containerInfo
    this.store = store
  }

  get state(): AgentState {
    return this.store.getState().executionState
  }

  get messages(): readonly BetaMessageParam[] {
    return this.store.getState().messages
  }

  get isRunning(): boolean {
    return this.running
  }

  protected pushMessage(message: BetaMessageParam): void {
    this.store.setState((s) => ({ messages: [...s.messages, message] }))
  }

  /**
   * Core execution logic - runs an agent instance to completion
   * Handles engine creation, event wiring, execution, and callbacks
   */
  protected async executeAgent(
    agent: AgentInstance,
    options: {
      initialMessages?: BetaMessageParam[]
      emitEvents?: boolean
    } = {},
  ): Promise<AgentResult> {
    const { initialMessages, emitEvents = true } = options

    const storeMessages = this.store.getState().messages
    const messagesToUse =
      storeMessages.length > 0
        ? [...storeMessages]
        : (initialMessages ?? agent.messages)

    const { config } = createEngineConfig({
      agent,
      client: this.client,
      store: this.store,
      overrideMessages: messagesToUse,
    })

    this.engine = new ExecutionEngine(config)

    let onStateChange: ((state: AgentState) => void) | undefined
    let onStream: ((event: AgentStreamEvent) => void) | undefined
    let onError: ((error: Error) => void) | undefined
    let onStepFinish: ((result: OnStepFinishResult) => void) | undefined

    try {
      if (emitEvents) {
        onStateChange = (state: AgentState) => {
          // State is already updated in store by engine
          this.emit('stateChange', state)
        }
        onStream = (event: AgentStreamEvent) => {
          this.emit('stream', event)
          agent.props.onMessage?.(event)
        }
        onError = (error: Error) => {
          this.emit('error', error)
          agent.props.onError?.(error)
        }
        onStepFinish = (result: OnStepFinishResult) => {
          this.emit('stepFinish', result)
          agent.props.onStepFinish?.(result)
        }

        this.engine.on('stateChange', onStateChange)
        this.engine.on('stream', onStream)
        this.engine.on('error', onError)
        this.engine.on('stepFinish', onStepFinish)
      } else {
        // Still wire up agent props callbacks even if not emitting events
        onStream = (event: AgentStreamEvent) => {
          agent.props.onMessage?.(event)
        }
        onError = (error: Error) => {
          agent.props.onError?.(error)
        }
        onStepFinish = (result: OnStepFinishResult) => {
          agent.props.onStepFinish?.(result)
        }

        this.engine.on('stream', onStream)
        this.engine.on('error', onError)
        this.engine.on('stepFinish', onStepFinish)
      }

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
        this.pushMessage({ role: 'user', content: firstMessage })
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

    this.pushMessage({ role: 'user', content })

    return this.run()
  }

  async *stream(
    message: string,
  ): AsyncGenerator<AgentStreamEvent, AgentResult, undefined> {
    if (this.running) {
      throw new Error(
        'Agent is already running. Wait for current execution to complete or call abort() first.',
      )
    }

    this.pushMessage({ role: 'user', content: message })

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

    const runPromise = this.run().catch((e) => {
      error = e
      done = true
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
   * Subclasses can override for additional cleanup
   */
  protected cleanup(): void {}

  /**
   * Test-only method to access containerInfo for testing purposes
   * @internal This method is only intended for use in tests
   */
  __getContainerInfo(): ContainerInfo {
    return this.containerInfo
  }
}
