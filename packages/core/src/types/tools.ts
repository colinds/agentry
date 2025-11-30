import type { z } from 'zod';
import type { BetaToolUnion, BetaToolResultBlockParam } from '@anthropic-ai/sdk/resources/beta';

// result type that tools can return
export type ToolResult = string | BetaToolResultBlockParam['content'];

// tool update operations for dynamic tool management
export type ToolUpdate =
  | { type: 'add'; tool: InternalTool }
  | { type: 'remove'; toolName: string };

// context passed to tool handlers
export interface ToolContext {
  // the agent instance that invoked the tool
  agentName?: string;
  // abort signal for cancellation
  signal?: AbortSignal;
  // additional metadata
  metadata?: Record<string, unknown>;
  // dynamic tool updates (add/remove tools during execution)
  updateTools?: (updates: ToolUpdate[]) => void;
}

// a runnable tool with type-safe handler
export interface RunnableTool<TInput = unknown> {
  // tool definition for the API
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;

  // handler that executes the tool
  handler: (input: TInput, context: ToolContext) => Promise<ToolResult> | ToolResult;
}

// internal representation with parsed JSON schema
export interface InternalTool<TInput = unknown> extends RunnableTool<TInput> {
  // JSON schema converted from zod for API
  jsonSchema: Record<string, unknown>;
}

// tool definition options for defineTool helper
export interface DefineToolOptions<TSchema extends z.ZodType> {
  name: string;
  description: string;
  parameters: TSchema;
  handler: (input: z.infer<TSchema>, context: ToolContext) => Promise<ToolResult> | ToolResult;
}

// union of our runnable tools and SDK built-in tools
export type ToolUnion = InternalTool | BetaToolUnion;

// check if a tool is our runnable tool type
export function isRunnableTool(tool: ToolUnion): tool is InternalTool {
  return 'handler' in tool && typeof tool.handler === 'function';
}

// pending tool call waiting for execution
export interface PendingToolCall {
  id: string;
  name: string;
  input: unknown;
}

// result of a tool execution
export interface ToolExecutionResult {
  tool_use_id: string;
  content: ToolResult;
  is_error: boolean;
}
