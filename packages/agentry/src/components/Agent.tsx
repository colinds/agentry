import type { ReactNode } from 'react'
import type {
  BaseAgentProps,
  ProviderModelOverride,
  ThinkingConfig,
  AnthropicThinkingEnabled,
  OpenAIThinkingEnabled,
} from '../types/agent'

/**
 * `provider` and `model` must be specified together or not at all.
 * - Root agents: specify both (`provider="anthropic" model="claude-haiku-4-5"`)
 * - Subagents inside AgentTool: can omit both (inherit from parent)
 *
 * Extends `ProviderModelOverride` but makes `model` required when `provider`
 * is specified (root agents must provide a model).
 */
type PublicProviderVariant =
  | (Required<Extract<ProviderModelOverride, { provider: 'anthropic' }>> & {
      thinking?: AnthropicThinkingEnabled | { type: 'disabled' }
    })
  | (Required<Extract<ProviderModelOverride, { provider: 'openai' }>> & {
      thinking?: OpenAIThinkingEnabled | { type: 'disabled' }
      websocket?: boolean
    })
  | { provider?: undefined; model?: undefined; thinking?: ThinkingConfig }

export type AgentComponentPublicProps = BaseAgentProps &
  PublicProviderVariant & { children?: React.ReactNode }

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
