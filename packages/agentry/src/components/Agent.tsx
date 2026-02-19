import type { ReactNode } from 'react'
import type { AgentComponentProps } from '../instances/types'
import type { ProviderName } from '../types/provider'
import type { Model } from '../types/agent'

type BaseAgentProps = Omit<AgentComponentProps, 'client' | 'model' | 'provider'>

/**
 * When `provider` is given, `model` must also be given (they go together).
 * - Root agents: specify both (`provider="anthropic" model="claude-haiku-4-5"`)
 * - Subagents: can omit both (inherit from context), or specify `model` alone
 *   to override the model while inheriting the provider.
 */
type ProviderModelProps =
  | { provider: ProviderName; model: Model }
  | { provider?: undefined; model?: Model }

export type AgentComponentPublicProps = BaseAgentProps & ProviderModelProps

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
