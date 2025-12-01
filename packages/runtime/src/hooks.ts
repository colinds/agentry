import * as React from 'react'
import { useStore } from 'zustand'
import {
  createAgentStore,
  AgentContext,
  InsideAgentContext,
  type AgentStore,
  type AgentStoreState,
  type AgentState,
  type BetaMessageParam,
} from '@agentry/core'

export { createAgentStore, AgentContext, InsideAgentContext, type AgentStore, type AgentStoreState }

/**
 * Get the agent store from context (throws if not found)
 */
function useAgentStore(): AgentStore {
  const store = React.useContext(AgentContext)
  if (!store) {
    throw new Error(
      'Agent hooks must be used within an AgentProvider. ' +
        'Make sure your component is a child of <Agent>.',
    )
  }
  return store
}

/**
 * Provider component that makes agent store available to children
 */
export function AgentProvider({
  store,
  children,
}: {
  store: AgentStore
  children: React.ReactNode
}): React.JSX.Element {
  return React.createElement(AgentContext.Provider, { value: store }, children)
}

/**
 * Hook to access the current execution state
 *
 * @example
 * ```tsx
 * function StatusIndicator() {
 *   const state = useExecutionState();
 *   return <span>{state.status}</span>;
 * }
 * ```
 */
export function useExecutionState(): AgentState {
  const store = useAgentStore()
  return useStore(store, (s) => s.executionState)
}

/**
 * Hook to access the message history
 *
 * @example
 * ```tsx
 * function MessageLogger() {
 *   const messages = useMessages();
 *   useEffect(() => {
 *     console.log('Messages updated:', messages.length);
 *   }, [messages]);
 *   return null;
 * }
 * ```
 */
export function useMessages(): BetaMessageParam[] {
  const store = useAgentStore()
  return useStore(store, (s) => s.messages)
}

/**
 * Hook to access the full store state (for advanced use cases)
 *
 * @example
 * ```tsx
 * function DebugComponent() {
 *   const { executionState, messages } = useAgentState();
 *   console.log('State:', executionState.status, 'Messages:', messages.length);
 *   return null;
 * }
 * ```
 */
export function useAgentState(): AgentStoreState {
  const store = useAgentStore()
  return useStore(store)
}

/**
 * Hook to access the raw store (for transient updates or subscriptions)
 */
export { useAgentStore }
