import type { ReactNode } from 'react'
import { z } from 'zod'
import { defineAgentTool } from '@agentry/core/tools'
import type {
  InternalAgentTool,
  DefineAgentToolOptions,
} from '@agentry/core/types'

export type AgentToolProps<TSchema extends z.ZodType = z.ZodType> =
  | InternalAgentTool<z.infer<TSchema>>
  | DefineAgentToolOptions<TSchema>

/**
 * AgentTool component - registers an agent tool with the parent agent
 *
 * @example using defineAgentTool
 * ```tsx
 * const researcherTool = defineAgentTool({
 *   name: 'researcher',
 *   description: 'Research specialist',
 *   parameters: z.object({
 *     topic: z.string(),
 *     depth: z.enum(['shallow', 'deep']).optional()
 *   }),
 *   agent: (input) => (
 *     <Agent name="researcher">
 *       <System>Research: {input.topic}</System>
 *     </Agent>
 *   )
 * });
 *
 * <AgentTool {...researcherTool} />
 * ```
 *
 * @example using inline props
 * ```tsx
 * <AgentTool
 *   name="researcher"
 *   description="Research specialist"
 *   parameters={z.object({
 *     topic: z.string(),
 *     depth: z.enum(['shallow', 'deep']).optional()
 *   })}
 *   agent={(input) => (
 *     <Agent name="researcher">
 *       <System>Research: {input.topic}</System>
 *     </Agent>
 *   )}
 * />
 * ```
 */
export function AgentTool<TSchema extends z.ZodType>(
  props: AgentToolProps<TSchema>,
): ReactNode {
  if ('parameters' in props && 'jsonSchema' in props) {
    return (
      <agent_tool agentTool={props as InternalAgentTool<unknown>} key={props.name} />
    )
  }

  const agentTool = defineAgentTool(props)

  return (
    <agent_tool
      agentTool={agentTool as InternalAgentTool<unknown>}
      key={agentTool.name}
    />
  )
}
