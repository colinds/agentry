import type { ReactNode } from 'react'
import type { AgentComponentProps } from '../instances/types'

export interface AgentComponentPublicProps extends Omit<
  AgentComponentProps,
  'client' | 'model'
> {
  // model is optional - required for root agents, inherited for subagents
  model?: AgentComponentProps['model']
}

/**
 * Agent component - the root container for an AI agent
 *
 * @example
 * ```tsx
 * <Agent model="claude-sonnet-4-5" maxTokens={4096}>
 *   <System>You are a helpful assistant</System>
 *   <Tools>
 *     <Tool {...searchTool} />
 *     <AgentTool
 *       name="researcher"
 *       description="Research specialist"
 *       parameters={z.object({ topic: z.string() })}
 *       agent={(input) => (
 *         <Agent name="researcher">
 *           <System>Research: {input.topic}</System>
 *         </Agent>
 *       )}
 *     />
 *   </Tools>
 * </Agent>
 * ```
 */
export function Agent({
  children,
  ...props
}: AgentComponentPublicProps): ReactNode {
  // All agents are now root agents - no implicit nesting
  // Use AgentTool for explicit nested agents
  return <agent {...props}>{children}</agent>
}
