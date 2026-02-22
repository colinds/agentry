import { createStore, type StoreApi } from 'zustand/vanilla'
import { AgentStatus, type AgentState } from './types/state'
import type { AgentMessageParam } from './types/messages'

export interface AgentStoreState {
  executionState: AgentState
  messages: AgentMessageParam[]
  actions: {
    setExecutionState: (state: AgentState) => void
    pushMessage: (message: AgentMessageParam) => void
    removeMessage: (message: AgentMessageParam) => void
    setMessages: (messages: AgentMessageParam[]) => void
  }
}

export type AgentStore = StoreApi<AgentStoreState>

export function createAgentStore(): AgentStore {
  return createStore<AgentStoreState>((set) => ({
    executionState: { status: AgentStatus.Idle },
    messages: [],
    actions: {
      setExecutionState: (state) => set({ executionState: state }),
      pushMessage: (message) =>
        set((s) => ({ messages: [...s.messages, message] })),
      removeMessage: ({ role, content }) =>
        set((s) => ({
          messages: s.messages.filter(
            (m) => m.role !== role || m.content !== content,
          ),
        })),
      setMessages: (messages) => set({ messages }),
    },
  }))
}
