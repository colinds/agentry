import type { ReactNode } from 'react'
import type { TSchema } from 'typebox'
import { defineAgentTool } from '../tools'
import type { InternalAgentTool, DefineAgentToolOptions } from '../types'

export type AgentToolProps<TParameters extends TSchema = TSchema> =
  | InternalAgentTool
  | DefineAgentToolOptions<TParameters>

/**
 * AgentTool component - registers an agent tool with the parent agent
 *
 * @example using defineAgentTool
 * ```tsx
 * const researcherTool = defineAgentTool({
 *   name: 'researcher',
 *   description: 'Research specialist',
 *   parameters: Type.Object({
 *     topic: Type.String(),
 *     depth: Type.Optional(Type.String())
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
export function AgentTool(props: InternalAgentTool): ReactNode
export function AgentTool<TParameters extends TSchema>(
  props: DefineAgentToolOptions<TParameters>,
): ReactNode
export function AgentTool<TParameters extends TSchema>(
  props: AgentToolProps<TParameters>,
): ReactNode {
  if ('parameters' in props && 'jsonSchema' in props) {
    return (
      <agent_tool agentTool={props as InternalAgentTool} key={props.name} />
    )
  }

  const agentTool = defineAgentTool(props)

  return (
    <agent_tool
      agentTool={agentTool as InternalAgentTool}
      key={agentTool.name}
    />
  )
}
