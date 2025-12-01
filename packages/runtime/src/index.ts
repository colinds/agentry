import { setSubagentToolFactory } from '@agentry/core'
import { createSubagentTool } from './createSubagentTool.ts'
setSubagentToolFactory(createSubagentTool)

export { render, createAgent, type RenderOptions } from './render.ts'
export { AgentHandle, type AgentHandleEvents } from './handles/index.ts'
export { renderSubagent, type RenderSubagentOptions } from './renderSubagent.ts'

export {
  useExecutionState,
  useMessages,
  useAgentState,
  useAgentStore,
  AgentProvider,
  AgentContext,
  createAgentStore,
  type AgentStore,
  type AgentStoreState,
} from './hooks.ts'

export {
  Agent,
  Tool,
  System,
  Context,
  Message,
  Tools,
  WebSearch,
  MCP,
  defineTool,
  type AgentProps,
  type ToolProps,
  type SystemProps,
  type ContextProps,
  type MessageProps,
  type ToolsProps,
  type WebSearchProps,
  type MCPProps,
} from '@agentry/components'

export type {
  AgentResult,
  AgentStreamEvent,
  AgentState,
  InternalTool,
  ToolContext,
  ToolResult,
  Model,
  BetaMessage,
  BetaMessageParam,
  OnStepFinishResult,
  StepToolCall,
  StepToolResult,
  StepUsage,
} from '@agentry/core'
