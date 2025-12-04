import type { ReactNode } from 'react'

export interface SystemProps {
  children: ReactNode
  cache?: 'ephemeral'
}

/**
 * system prompt component - adds to the agent's system prompt
 *
 * @example
 * ```tsx
 * <Agent model="claude-sonnet-4-5">
 *   <System>
 *     You are a helpful assistant
 *     Be concise in your responses
 *   </System>
 * </Agent>
 * ```
 */
export function System({ children, cache }: SystemProps): ReactNode {
  return <system cache={cache}>{children}</system>
}
