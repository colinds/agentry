import './jsx-elements.d.ts'

export { Agent, type AgentComponentPublicProps } from './Agent.tsx'
export { Tool, type ToolProps } from './Tool.tsx'
export { System, type SystemProps } from './System.tsx'
export { Context, type ContextProps } from './Context.tsx'
export { Message, type MessageProps } from './Message.tsx'
export { Tools, type ToolsProps } from './Tools.tsx'

export { WebSearch, type WebSearchProps } from './built-ins/WebSearch.tsx'
export { CodeExecution } from './built-ins/CodeExecution.tsx'
export {
  Memory,
  type MemoryProps,
  type MemoryHandlers,
} from './built-ins/Memory.tsx'

export { MCP, type MCPProps } from './MCP.tsx'

export { defineTool } from '@agentry/core'

export {
  useExecutionState,
  useMessages,
  useAgentState,
  useAgentStore,
  createAgentStore,
  AgentContext,
  InsideAgentContext,
  AgentProvider,
  type AgentStore,
  type AgentStoreState,
} from './hooks.ts'

export type { AgentryElements } from './jsx-elements.d.ts'
