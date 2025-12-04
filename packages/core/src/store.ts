import { createStore, type StoreApi } from 'zustand/vanilla'
import type { AgentState } from './types/state.ts'
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta'

export interface AgentStoreState {
  executionState: AgentState
  messages: BetaMessageParam[]
  actions: {
    setExecutionState: (state: AgentState) => void
    pushMessage: (message: BetaMessageParam) => void
    removeMessage: (message: BetaMessageParam) => void
    setMessages: (messages: BetaMessageParam[]) => void
  }
}

export type AgentStore = StoreApi<AgentStoreState>

export function createAgentStore(): AgentStore {
  return createStore<AgentStoreState>((set) => ({
    executionState: { status: 'idle' },
    messages: [],
    actions: {
      setExecutionState: (state) => set({ executionState: state }),
      pushMessage: (message) =>
        set((s) => ({ messages: [...s.messages, message] })),
      removeMessage: ({ role, content }) =>
        set((s) => ({
          messages: s.messages.filter(
            (m) => m.role !== role && m.content !== content,
          ),
        })),
      setMessages: (messages) => set({ messages }),
    },
  }))
}
