import type { z } from 'zod'
import type Anthropic from '@anthropic-ai/sdk'
import type {
  BetaToolUnion,
  BetaToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/beta'

export type ToolResult = string | BetaToolResultBlockParam['content']

export type ToolUpdate =
  | { type: 'add'; tool: InternalTool }
  | { type: 'remove'; toolName: string }

export interface ToolContext {
  agentName: string
  client: Anthropic
  // abort signal for cancellation
  signal?: AbortSignal
  metadata?: Record<string, unknown>
  // dynamic tool updates (add/remove tools during execution)
  updateTools?: (updates: ToolUpdate[]) => void
}

export interface RunnableTool<TInput = unknown> {
  name: string
  description: string
  inputSchema: z.ZodType<TInput>

  handler: (
    input: TInput,
    context: ToolContext,
  ) => Promise<ToolResult> | ToolResult
}

export interface InternalTool<TInput = unknown> extends RunnableTool<TInput> {
  jsonSchema: Record<string, unknown>
}

export interface DefineToolOptions<TSchema extends z.ZodType> {
  name: string
  description: string
  parameters: TSchema
  handler: (
    input: z.infer<TSchema>,
    context: ToolContext,
  ) => Promise<ToolResult> | ToolResult
}

export type ToolUnion = InternalTool | BetaToolUnion

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
