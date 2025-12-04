import type { ReactNode } from 'react'

export interface ContextProps {
  children: ReactNode
}

/**
 * context component - adds contextual information to the agent
 *
 * @example
 * ```tsx
 * <Agent model="claude-sonnet-4-5">
 *   <Context>
 *     Current user: {user.name}
 *     Account type: {user.accountType}
 *   </Context>
 * </Agent>
 * ```
 */
export function Context({ children }: ContextProps): ReactNode {
  return <context>{children}</context>
}
