export { run, createAgent, createAI } from './run'
export { AgentHandle } from './handles'
export { defineTool, defineAgentTool } from './tools'
export { AgentryContextOverflowError, AgentryProviderError } from './pi'
export {
  Agent,
  Tool,
  AgentTool,
  System,
  Context,
  Message,
  Tools,
  Condition,
  MCP,
  useExecutionState,
  useMessages,
  useAgentState,
} from './components'

/** TypeBox schema builder — tool `parameters` are plain JSON Schema. */
export { Type } from 'typebox'
export type { Static, TSchema } from 'typebox'

export type {
  MCPServerConfig,
  McpStdioServerConfig,
  McpUrlServerConfig,
  McpToolConfiguration,
} from './mcp'

export type {
  ContextUsage,
  ContextSection,
  ToolUsage,
} from './execution/contextUsage'

export type {
  AgentResult,
  AgentMessageParam,
  AgentStreamEvent,
  AgentState,
  CompactionControl,
  Model,
  ProviderId,
  ProviderName,
  ThinkingLevel,
  CacheRetention,
  ProviderHeaders,
  RetryPolicy,
  RunAgentOptions,
  ToolContext,
  ToolResult,
  OnStepFinishResult,
} from './types'
export type { AgentStoreState } from './store'
export type { RunOptions, CreateAgentOptions } from './run/agent'

/**
 * pi types re-exported for convenience. Build a `Models` collection with pi's
 * own `createModels`/provider factories and pass it to `run`/`createAI`.
 */
export type {
  Api,
  AssistantMessage,
  KnownProvider,
  Message as PiMessage,
  Models,
  StopReason,
  TextContent,
  ThinkingContent,
  ToolCall,
  ToolResultMessage,
  Usage,
  UserMessage,
} from '@earendil-works/pi-ai'
