import { useContext } from 'react'
import { useStore } from 'zustand'
import {
  createAgentStore,
  type AgentStore,
  type AgentStoreState,
} from '@agentry/core/store'
import { AgentContext, AgentProvider } from '@agentry/core/context'
import type { AgentState, BetaMessageParam } from '@agentry/core/types'

export {
  createAgentStore,
  AgentContext,
  AgentProvider,
  type AgentStore,
  type AgentStoreState,
}

/**
 * Get the agent store from context (throws if not found)
 */
function useAgentStore(): AgentStore {
  const store = useContext(AgentContext)
  if (!store) {
    throw new Error(
      'Agent hooks must be used within an AgentProvider. ' +
        'Make sure your component is a child of <Agent>.',
    )
  }
  return store
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
  return useStore(store, ({ executionState }) => executionState)
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
  return useStore(store, ({ messages }) => messages)
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
