import type { ReactElement } from 'react'
import type { z } from 'zod'
import type {
  BetaCodeExecutionTool20250825,
  BetaMemoryTool20250818,
  BetaWebSearchTool20250305,
} from '@anthropic-ai/sdk/resources/beta'
import type { Model, AgentResult } from './agent'
import type { ProviderName } from './provider'
import type { ProviderClientMap } from '../providers/types'
import type { JsonObject } from './json'

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

export type ToolResult = string | Array<{ type: 'text'; text: string }>

export type CodeExecutionTool = BetaCodeExecutionTool20250825
export type WebSearchTool = BetaWebSearchTool20250305
export type MemoryTool = BetaMemoryTool20250818 & {
  memoryHandlers?: MemoryHandlers
}

/**
 * Union of all supported SDK tools
 */
export type SdkTool = CodeExecutionTool | WebSearchTool | MemoryTool

/**
 * Type guard for code execution tool
 */
export function isCodeExecutionTool(tool: SdkTool): tool is CodeExecutionTool {
  return 'type' in tool && tool.type === 'code_execution_20250825'
}

/**
 * Type guard for web search tool
 */
export function isWebSearchTool(tool: SdkTool): tool is WebSearchTool {
  return 'type' in tool && tool.type === 'web_search_20250305'
}

/**
 * Type guard for memory tool
 */
export function isMemoryTool(tool: SdkTool): tool is MemoryTool {
  return 'type' in tool && tool.type === 'memory_20250818'
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

export interface ToolContext {
  agentName: string
  provider?: ProviderName
  clients?: Partial<ProviderClientMap>
  /** Client for current provider (backward-compatible alias) */
  client?: ProviderClientMap[ProviderName]
  model?: Model
  // abort signal for cancellation
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

export interface RunnableTool<TInput = z.output<z.ZodType>> {
  name: string
  description: string
  parameters: z.ZodType<TInput>
  handler: (
    input: TInput,
    context: ToolContext,
  ) => Promise<ToolResult> | ToolResult
}

export interface InternalTool<TInput = z.output<z.ZodType>>
  extends RunnableTool<TInput> {
  jsonSchema: Record<string, object | string | number | boolean | null>
  strict?: boolean
}

export type DefineToolOptions<TSchema extends z.ZodType> = Omit<
  RunnableTool<z.infer<TSchema>>,
  'parameters'
> & {
  parameters: TSchema
  strict?: boolean
}

export type ToolUnion = InternalTool | SdkTool

export function isRunnableTool(tool: ToolUnion): tool is InternalTool {
  return 'handler' in tool && typeof tool.handler === 'function'
}

export interface PendingToolCall {
  id: string
  name: string
  input: z.output<z.ZodType>
}

export interface ToolExecutionResult {
  tool_use_id: string
  content: ToolResult
  is_error: boolean
}
