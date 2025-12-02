import type { z } from 'zod'
import type Anthropic from '@anthropic-ai/sdk'
import type {
  BetaToolResultBlockParam,
  BetaWebSearchTool20250305,
  BetaMemoryTool20250818,
} from '@anthropic-ai/sdk/resources/beta'
import type { Model } from './agent.ts'

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

export type ToolResult = string | BetaToolResultBlockParam['content']

/**
 * Code execution tool - enables code execution capability
 */
export interface CodeExecutionTool {
  type: 'code_execution_20250825'
  name: 'code_execution'
}

/**
 * Web search tool - enables web search capability
 */
export type WebSearchTool = BetaWebSearchTool20250305

/**
 * Memory tool - enables memory capability with client-side handlers
 */
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

export interface ToolContext {
  agentName: string
  client: Anthropic
  model?: Model
  // abort signal for cancellation
  signal?: AbortSignal
  metadata?: Record<string, unknown>
}

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
  jsonSchema: Record<string, unknown>
}

export type DefineToolOptions<TSchema extends z.ZodType> = Omit<
  RunnableTool<z.infer<TSchema>>,
  'parameters'
> & {
  parameters: TSchema
}

export type ToolUnion = InternalTool | SdkTool

export function isRunnableTool(tool: ToolUnion): tool is InternalTool {
  return 'handler' in tool && typeof tool.handler === 'function'
}

export interface PendingToolCall {
  id: string
  name: string
  input: unknown
}

export interface ToolExecutionResult {
  tool_use_id: string
  content: ToolResult
  is_error: boolean
}
