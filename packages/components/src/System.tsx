import type { ReactNode } from 'react';

export interface SystemProps {
  children: ReactNode;
  /** priority for context compaction (higher = more important) */
  priority?: number;
}

/**
 * system prompt component - adds to the agent's system prompt
 *
 * @example
 * ```tsx
 * <Agent model="claude-sonnet-4-5">
 *   <System priority={1000}>You are a helpful assistant</System>
 *   <System priority={500}>Be concise in your responses</System>
 * </Agent>
 * ```
 */
export function System({ children, priority = 1000 }: SystemProps): ReactNode {
  return <system priority={priority}>{children}</system>;
}
