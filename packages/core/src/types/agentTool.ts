import type { z } from 'zod'
import type React from 'react'

/**
 * Function type that receives typed input and returns a React element
 * The input type is inferred from the Zod schema
 */
export type AgentToolFunction<TSchema extends z.ZodType> = (
  input: z.infer<TSchema>,
) => React.ReactElement

/**
 * Options for defining an agent tool (used in defineAgentTool)
 * This is the user-facing interface for creating agent tools
 */
export interface DefineAgentToolOptions<TSchema extends z.ZodType> {
  name: string
  description: string
  parameters: TSchema
  agent: AgentToolFunction<TSchema>
}

/**
 * Internal representation of an agent tool with JSON schema
 * This is what gets stored in the reconciler instance
 */
export interface InternalAgentTool<TInput = unknown> {
  name: string
  description: string
  parameters: z.ZodType<TInput>
  jsonSchema: Record<string, unknown>
  agent: AgentToolFunction<z.ZodType<TInput>>
}
