import type { ReactNode } from 'react'
import type { Models } from '@earendil-works/pi-ai'
import { run as runBase, createAgent as createAgentBase } from './agent'
import { AgentHandle } from '../handles'
import type { AgentResult } from '../types'
import type { CreateAgentOptions, RunOptions } from './agent'

export interface AIDefaults {
  /** pi model collection; defaults to pi's full built-in catalog */
  models?: Models
  mode?: 'batch' | 'interactive'
  /** Stable identifier for prompt-cache affinity across runs. */
  sessionId?: string
}

export interface AIBoundRunOptions {
  models?: Models
  mode?: 'batch' | 'interactive'
  sessionId?: string
}

export interface AIBoundCreateAgentOptions {
  models?: Models
  sessionId?: string
}

export interface AI {
  run(
    element: ReactNode,
    options?: AIBoundRunOptions & { mode?: 'batch' },
  ): Promise<AgentResult>
  run(
    element: ReactNode,
    options: AIBoundRunOptions & { mode: 'interactive' },
  ): Promise<AgentHandle>
  createAgent(
    element: ReactNode,
    options?: AIBoundCreateAgentOptions,
  ): AgentHandle
}

function mergeRunOptions(
  defaults: AIDefaults,
  options?: AIBoundRunOptions,
): RunOptions {
  return {
    models: options?.models ?? defaults.models,
    mode: options?.mode ?? defaults.mode,
    sessionId: options?.sessionId ?? defaults.sessionId,
  }
}

function mergeCreateAgentOptions(
  defaults: AIDefaults,
  options?: AIBoundCreateAgentOptions,
): CreateAgentOptions {
  return {
    models: options?.models ?? defaults.models,
    sessionId: options?.sessionId ?? defaults.sessionId,
  }
}

/**
 * Create a pre-configured AI instance with bound default providers and mode.
 * All calls to `ai.run()` and `ai.createAgent()` inherit the defaults, with
 * per-call options merged on top.
 *
 * @example basic usage — zero config, pi resolves providers from env vars
 * ```ts
 * const ai = createAI({})
 *
 * const result = await ai.run(
 *   <Agent provider="anthropic" model="claude-haiku-4-5">
 *     <Message role="user">Hello!</Message>
 *   </Agent>
 * )
 * console.log(result.content)
 * ```
 *
 * @example restricting to specific providers
 * ```ts
 * import { createModels } from '@earendil-works/pi-ai'
 * import { anthropicProvider } from '@earendil-works/pi-ai/providers/anthropic'
 *
 * const models = createModels()
 * models.setProvider(anthropicProvider())
 *
 * const ai = createAI({ models })
 * ```
 *
 * @example interactive mode default
 * ```ts
 * const ai = createAI({ mode: 'interactive' })
 *
 * const handle = await ai.run(
 *   <Agent provider="anthropic" model="claude-haiku-4-5">
 *     <System>You are a helpful assistant</System>
 *   </Agent>
 * )
 * const result = await handle.sendMessage('Hello!')
 * ```
 */
export function createAI(defaults: AIDefaults = {}): AI {
  async function run(
    element: ReactNode,
    options?: AIBoundRunOptions & { mode?: 'batch' },
  ): Promise<AgentResult>
  async function run(
    element: ReactNode,
    options: AIBoundRunOptions & { mode: 'interactive' },
  ): Promise<AgentHandle>
  async function run(
    element: ReactNode,
    options?: AIBoundRunOptions,
  ): Promise<AgentResult | AgentHandle> {
    const merged = mergeRunOptions(defaults, options)

    if (merged.mode === 'interactive') {
      return runBase(element, { ...merged, mode: 'interactive' })
    }

    return runBase(element, { ...merged, mode: merged.mode ?? 'batch' })
  }

  function createAgent(
    element: ReactNode,
    options?: AIBoundCreateAgentOptions,
  ): AgentHandle {
    return createAgentBase(element, mergeCreateAgentOptions(defaults, options))
  }

  return { run, createAgent }
}
