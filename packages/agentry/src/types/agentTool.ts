import type { Static, TSchema } from 'typebox'
import type React from 'react'
import type { JsonValue } from './json'

/**
 * Function type that receives typed input and returns a React element
 * The input type is inferred from the TypeBox schema
 */
export type AgentToolFunction<TParameters extends TSchema> = (
  input: Static<TParameters>,
) => React.ReactElement

/**
 * Options for defining an agent tool (used in defineAgentTool)
 * This is the user-facing interface for creating agent tools
 */
export interface DefineAgentToolOptions<TParameters extends TSchema> {
  name: string
  description: string
  parameters: TParameters
  agent: AgentToolFunction<TParameters>
}

/**
 * Internal representation of an agent tool with JSON schema
 * This is what gets stored in the reconciler instance
 */
export interface InternalAgentTool {
  name: string
  description: string
  parameters: TSchema
  jsonSchema: Record<string, JsonValue>
  agent: AgentToolFunction<TSchema>
}
