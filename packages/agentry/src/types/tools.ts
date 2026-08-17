import type { ReactElement } from 'react'
import type { Static, TSchema } from 'typebox'
import type { Models } from '@earendil-works/pi-ai'
import type { Model, AgentResult, ProviderId } from './agent'
import type { JsonObject, JsonValue } from './json'
import type { ImageContent, TextContent } from './messages'

/**
 * What a tool handler may return.
 *
 * Images are included because pi carries them end-to-end — `ToolResultMessage`
 * holds `(TextContent | ImageContent)[]`, and pi's own provider APIs convert
 * them to native image blocks. Screenshot and chart tools depend on this.
 */
export type ToolResult = string | Array<TextContent | ImageContent>

/**
 * Options for running an agent programmatically from a tool handler
 */
export interface RunAgentOptions {
  /** Override provider */
  provider?: ProviderId
  /** Override the pi model collection used to resolve the agent's model */
  models?: Models
  /** Override parent's model */
  model?: Model
  /** Override maxTokens (defaults to the framework default, not the parent's) */
  maxTokens?: number
  /** Override temperature */
  temperature?: number
  /** Custom abort signal (defaults to parent's) */
  signal?: AbortSignal
}

type BaseToolContext = {
  agentName: string
  /**
   * The pi model collection backing this run. Carries every configured
   * provider, which is what makes cross-provider subagent spawning via
   * `context.runAgent()` work.
   */
  models: Models
  provider?: ProviderId
  model?: Model
  signal?: AbortSignal
  metadata?: JsonObject
  /**
   * Programmatically run an agent from within a tool handler.
   * The spawned agent runs to completion and returns its result.
   * Results are returned to the tool handler only (not visible to the model).
   *
   * @param agent - React element representing the agent to run
   * @param options - Optional configuration (model, maxTokens, temperature, signal)
   * @returns Promise resolving to the full AgentResult
   *
   * @example
   * ```tsx
   * handler: async (input, context) => {
   *   const result = await context.runAgent(
   *     <Agent name="researcher">
   *       <System>You are a research expert.</System>
   *       <Message role="user">Research: {input.topic}</Message>
   *     </Agent>
   *   )
   *   return `Research complete: ${result.content}`
   * }
   * ```
   */
  runAgent: (
    agent: ReactElement,
    options?: RunAgentOptions,
  ) => Promise<AgentResult>
}

export type ToolContext = BaseToolContext

export interface RunnableTool<TInput = unknown> {
  name: string
  description: string
  parameters: TSchema
  handler: (
    input: TInput,
    context: ToolContext,
  ) => Promise<ToolResult> | ToolResult
}

export interface InternalTool<TInput = unknown> extends RunnableTool<TInput> {
  jsonSchema: Record<string, JsonValue>
  strict?: boolean
}

/**
 * An already-defined tool of any input shape.
 *
 * `handler` is a function-typed property, so it is checked contravariantly:
 * widening the input to `never` is what lets `<Tool {...someTool} />` accept a
 * tool whose handler takes a concrete parameter type.
 */
export type AnyInternalTool = InternalTool<never>

export type DefineToolOptions<TParameters extends TSchema> = Omit<
  RunnableTool<Static<TParameters>>,
  'parameters'
> & {
  parameters: TParameters
  strict?: boolean
}

export interface PendingToolCall {
  id: string
  name: string
  input: JsonObject
}
