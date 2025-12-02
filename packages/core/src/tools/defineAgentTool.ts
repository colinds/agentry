import { z } from 'zod'
import type {
  DefineAgentToolOptions,
  InternalAgentTool,
} from '../types/agentTool.ts'

/**
 * Creates a type-safe agent tool definition
 *
 * @example
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
 * })
 */
export function defineAgentTool<TSchema extends z.ZodType>(
  options: DefineAgentToolOptions<TSchema>,
): InternalAgentTool<z.infer<TSchema>> {
  const { name, description, parameters, agent } = options

  return {
    name,
    description,
    parameters,
    jsonSchema: z.toJSONSchema(parameters),
    agent,
  } as InternalAgentTool<z.infer<TSchema>>
}
