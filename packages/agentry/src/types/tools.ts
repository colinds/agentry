import type { ReactElement } from 'react'
import type { z } from 'zod'
import type { Model, AgentResult } from './agent'
import type { ProviderName } from './provider'
import type { ProviderClientMap } from '../providers/types'
import type { JsonObject, JsonValue } from './json'
import type { TextContentArray } from './messages'

export interface MemoryHandlers {
  /** Handler for viewing directory contents or file contents */
  onView?: (input: {
    path: string
    view_range?: [number, number]
  }) => Promise<string> | string
  /** Handler for creating or overwriting a file */
  onCreate?: (input: {
    path: string
    file_text: string
  }) => Promise<string> | string
  /** Handler for replacing text in a file */
  onStrReplace?: (input: {
    path: string
    old_str: string
    new_str: string
  }) => Promise<string> | string
  /** Handler for inserting text at a specific line */
  onInsert?: (input: {
    path: string
    insert_line: number
    insert_text: string
  }) => Promise<string> | string
  /** Handler for deleting a file or directory */
  onDelete?: (input: { path: string }) => Promise<string> | string
  /** Handler for renaming or moving a file/directory */
  onRename?: (input: {
    old_path: string
    new_path: string
  }) => Promise<string> | string
}

export type ToolResult = string | TextContentArray

export enum BuiltInToolType {
  CodeExecution = 'code_execution',
  WebSearch = 'web_search',
  Memory = 'memory',
}

export interface CodeExecutionTool {
  type: BuiltInToolType.CodeExecution
  name: 'code_execution'
}

export interface WebSearchTool {
  type: BuiltInToolType.WebSearch
  name: 'web_search'
  max_uses?: number
  allowed_domains?: string[]
  blocked_domains?: string[]
  user_location?: {
    type: 'approximate'
    city?: string
    region?: string
    country?: string
    timezone?: string
  }
}

export interface MemoryTool {
  type: BuiltInToolType.Memory
  name: 'memory'
  memoryHandlers?: MemoryHandlers
}

/**
 * Union of all supported built-in tools
 */
export type BuiltInTool = CodeExecutionTool | WebSearchTool | MemoryTool

/**
 * Type guard for code execution tool
 */
export function isCodeExecutionTool(
  tool: BuiltInTool,
): tool is CodeExecutionTool {
  return tool.type === BuiltInToolType.CodeExecution
}

/**
 * Type guard for web search tool
 */
export function isWebSearchTool(tool: BuiltInTool): tool is WebSearchTool {
  return tool.type === BuiltInToolType.WebSearch
}

/**
 * Type guard for memory tool
 */
export function isMemoryTool(tool: BuiltInTool): tool is MemoryTool {
  return tool.type === BuiltInToolType.Memory
}

/**
 * Options for running an agent programmatically from a tool handler
 */
export interface RunAgentOptions {
  /** Override provider */
  provider?: ProviderName
  /** Override provider clients */
  clients?: Partial<ProviderClientMap>
  /** Override parent's model */
  model?: Model
  /** Override maxTokens (defaults to half parent's) */
  maxTokens?: number
  /** Override temperature */
  temperature?: number
  /** Custom abort signal (defaults to parent's) */
  signal?: AbortSignal
}

type ProviderContextFields =
  | { provider: 'anthropic'; client?: ProviderClientMap['anthropic'] }
  | { provider: 'openai'; client?: ProviderClientMap['openai'] }
  | { provider?: undefined; client?: undefined }

type BaseToolContext = {
  agentName: string
  clients?: Partial<ProviderClientMap>
  model?: Model
  signal?: AbortSignal
  metadata?: JsonObject
  /**
   * Programmatically run an agent from within a tool handler.
   * The spawned agent runs to completion and returns its result.
   * Results are returned to the tool handler only (not visible to Claude).
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

export type ToolContext = BaseToolContext & ProviderContextFields

export interface RunnableTool<TInput = unknown> {
  name: string
  description: string
  parameters: z.ZodType<TInput>
  handler: (
    input: TInput,
    context: ToolContext,
  ) => Promise<ToolResult> | ToolResult
}

export interface InternalTool<TInput = unknown> extends RunnableTool<TInput> {
  jsonSchema: Record<string, JsonValue>
  strict?: boolean
}

export type DefineToolOptions<TSchema extends z.ZodType> = Omit<
  RunnableTool<z.infer<TSchema>>,
  'parameters'
> & {
  parameters: TSchema
  strict?: boolean
}

export type ToolUnion = InternalTool | BuiltInTool

export function isRunnableTool(tool: ToolUnion): tool is InternalTool {
  return 'handler' in tool && typeof tool.handler === 'function'
}

export interface PendingToolCall {
  id: string
  name: string
  input: JsonObject
}

export interface ToolExecutionResult {
  tool_use_id: string
  content: ToolResult
  is_error: boolean
}
