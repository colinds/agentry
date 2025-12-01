import { createStore, type StoreApi } from 'zustand/vanilla'
import type { AgentState } from './types/state.ts'
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta'

export interface AgentStoreState {
  executionState: AgentState
  messages: BetaMessageParam[]
}

export type AgentStore = StoreApi<AgentStoreState>

export function createAgentStore(): AgentStore {
  return createStore<AgentStoreState>(() => ({
    executionState: { status: 'idle' },
    messages: [],
  }))
}
