import type { TSchema } from 'typebox'
import type {
  DefineAgentToolOptions,
  InternalAgentTool,
} from '../types/agentTool'

/**
 * Creates a type-safe agent tool definition
 *
 * @example
 * const researcherTool = defineAgentTool({
 *   name: 'researcher',
 *   description: 'Research specialist',
 *   parameters: Type.Object({
 *     topic: Type.String(),
 *     depth: Type.Optional(Type.Union([Type.Literal('shallow'), Type.Literal('deep')]))
 *   }),
 *   agent: (input) => (
 *     <Agent name="researcher">
 *       <System>Research: {input.topic}</System>
 *     </Agent>
 *   )
 * })
 */
export function defineAgentTool<TParameters extends TSchema>(
  options: DefineAgentToolOptions<TParameters>,
): InternalAgentTool {
  const { name, description, parameters, agent } = options

  return {
    name,
    description,
    parameters,
    jsonSchema: { ...parameters },
    agent,
  } as unknown as InternalAgentTool
}
