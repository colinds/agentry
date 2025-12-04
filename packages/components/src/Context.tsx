import type { ReactNode } from 'react'

export interface ContextProps {
  children: ReactNode
  cache?: 'ephemeral'
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
export function Context({ children, cache }: ContextProps): ReactNode {
  return <context cache={cache}>{children}</context>
}
