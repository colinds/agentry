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
  createAgent(element: ReactNode, options?: AIBoundCreateAgentOptions): AgentHandle
}

function mergeRunOptions(defaults: AIDefaults, options?: AIBoundRunOptions): RunOptions {
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

  function createAgent(element: ReactNode, options?: AIBoundCreateAgentOptions): AgentHandle {
    return createAgentBase(element, mergeCreateAgentOptions(defaults, options))
  }

  return { run, createAgent }
}
