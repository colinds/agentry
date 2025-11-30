import type { ReactNode } from 'react';

export interface ContextProps {
  children: ReactNode;
  /** priority for context compaction (higher = more important) */
  priority?: number;
}

/**
 * context component - adds contextual information to the agent
 *
 * @example
 * ```tsx
 * <Agent model="claude-sonnet-4-5">
 *   <Context priority={800}>
 *     Current user: {user.name}
 *     Account type: {user.accountType}
 *   </Context>
 * </Agent>
 * ```
 */
export function Context({ children, priority = 500 }: ContextProps): ReactNode {
  return <context priority={priority}>{children}</context>;
}
