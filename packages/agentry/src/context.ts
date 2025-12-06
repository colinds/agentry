import { createContext, createElement } from 'react'
import type { ReactNode } from 'react'
import type { AgentStore } from './store'

/**
 * Context for agent store access.
 * Used by hooks (useMessages, useExecutionState, etc.) to access agent state.
 */
export const AgentContext = createContext<AgentStore | null>(null)

/**
 * Provider component that makes agent store available to children
 */
export function AgentProvider({
  store,
  children,
}: {
  store: AgentStore
  children: ReactNode
}) {
  return createElement(AgentContext.Provider, { value: store }, children)
}
