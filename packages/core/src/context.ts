import * as React from 'react'
import type { AgentStore } from './store.ts'

/**
 * Context for agent store access.
 * Used by hooks (useMessages, useExecutionState, etc.) to access agent state.
 */
export const AgentContext = React.createContext<AgentStore | null>(null)

/**
 * Context for detecting if we're inside an Agent's children tree.
 */
export const InsideAgentContext = React.createContext<boolean>(false)
