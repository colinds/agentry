import type { ReactNode } from 'react'
import { run as runBase, createAgent as createAgentBase } from './agent'
import { AgentHandle } from '../handles'
import type { AgentResult } from '../types'
import type { ProviderClientMap } from '../providers/types'
import type { CreateAgentOptions, RunOptions } from './agent'

export interface AIDefaults {
  clients?: Partial<ProviderClientMap>
  mode?: 'batch' | 'interactive'
}

export interface AIBoundRunOptions {
  clients?: Partial<ProviderClientMap>
  mode?: 'batch' | 'interactive'
}

export interface AIBoundCreateAgentOptions {
  clients?: Partial<ProviderClientMap>
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
    clients: {
      ...defaults.clients,
      ...options?.clients,
    },
    mode: options?.mode ?? defaults.mode,
  }
}

function mergeCreateAgentOptions(
  defaults: AIDefaults,
  options?: AIBoundCreateAgentOptions,
): CreateAgentOptions {
  return {
    clients: {
      ...defaults.clients,
      ...options?.clients,
    },
  }
}

/**
 * Create a pre-configured AI instance with bound default clients and mode.
 * All calls to `ai.run()` and `ai.createAgent()` inherit the defaults, with
 * per-call options merged on top.
 *
 * @example basic usage — shared clients across multiple runs
 * ```ts
 * const ai = createAI({
 *   clients: { anthropic: new Anthropic() },
 * })
 *
 * const result = await ai.run(
 *   <Agent provider="anthropic" model="claude-haiku-4-5">
 *     <Message role="user">Hello!</Message>
 *   </Agent>
 * )
 * console.log(result.content)
 * ```
 *
 * @example multi-provider setup — override clients per call
 * ```ts
 * const ai = createAI({
 *   clients: { anthropic: new Anthropic(), openai: new OpenAI() },
 * })
 *
 * // per-call override — uses only the openai client for this run
 * const result = await ai.run(
 *   <Agent provider="openai" model="gpt-5-mini">
 *     <Message role="user">Hello!</Message>
 *   </Agent>,
 *   { clients: { openai: customOpenAIClient } }
 * )
 * ```
 *
 * @example interactive mode default
 * ```ts
 * const ai = createAI({
 *   clients: { anthropic: new Anthropic() },
 *   mode: 'interactive',
 * })
 *
 * const handle = await ai.run(
 *   <Agent provider="anthropic" model="claude-haiku-4-5">
 *     <System>You are a helpful assistant</System>
 *   </Agent>
 * )
 * const result = await handle.sendMessage('Hello!')
 * ```
 */
export function createAI(defaults: AIDefaults): AI {
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
