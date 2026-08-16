export { run, createAgent, createAI } from './run'
export { AgentHandle } from './handles'
export { defineTool, defineAgentTool, defineMemoryTool } from './tools'
export { AgentryProviderError } from './pi'
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
  Memory,
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
  AgentResult,
  AgentMessageParam,
  AgentStreamEvent,
  Model,
  ProviderId,
  ProviderName,
  ThinkingLevel,
  ToolContext,
  OnStepFinishResult,
} from './types'

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
