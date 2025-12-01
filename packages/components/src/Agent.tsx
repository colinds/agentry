import type { ReactNode } from 'react'
import type { AgentComponentProps } from '@agentry/core'

export interface AgentProps extends Omit<
  AgentComponentProps,
  'client' | 'model'
> {
  // model is optional for child agents (they inherit from parent)
  model?: AgentComponentProps['model']
  name?: string
  description?: string
  children?: ReactNode
}

/**
 * agent component - the root container for an AI agent
 *
 * @example
 * ```tsx
 * <Agent model="claude-sonnet-4-5" maxTokens={4096}>
 *   <System>You are a helpful assistant</System>
 *   <Tools>
 *     <Tool {...searchTool} />
 *   </Tools>
 * </Agent>
 * ```
 */
export function Agent({ children, ...props }: AgentProps): ReactNode {
  return <agent {...props}>{children}</agent>
}
