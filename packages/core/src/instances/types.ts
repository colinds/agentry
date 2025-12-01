import type Anthropic from '@anthropic-ai/sdk'
import type {
  BetaMessageParam,
  BetaToolUnion,
  BetaRequestMCPServerURLDefinition,
} from '@anthropic-ai/sdk/resources/beta'
import type { AgentProps, InternalTool } from '../types/index.ts'
import type { ExecutionEngine } from '../execution/index.ts'

export interface BaseInstance {
  type: string
  parent: Instance | null
}

export interface BaseAgentInstance extends BaseInstance {
  pendingUpdates: PendingUpdate[]
}

export interface AgentInstance extends BaseAgentInstance {
  type: 'agent'
  props: AgentProps
  client: Anthropic
  engine: ExecutionEngine | null
  systemParts: Array<{ content: string; priority: number }>
  tools: InternalTool[]
  sdkTools: BetaToolUnion[]
  contextParts: Array<{ content: string; priority: number }>
  messages: BetaMessageParam[]
  mcpServers: BetaRequestMCPServerURLDefinition[]
  children: Instance[]
}

export interface ToolInstance extends BaseInstance {
  type: 'tool'
  tool: InternalTool
}

export interface SdkToolInstance extends BaseInstance {
  type: 'sdk_tool'
  tool: BetaToolUnion
}

export interface SystemInstance extends BaseInstance {
  type: 'system'
  content: string
  priority: number
}

export interface ContextInstance extends BaseInstance {
  type: 'context'
  content: string
  priority: number
}

export interface MessageInstance extends BaseInstance {
  type: 'message'
  message: BetaMessageParam
}

export interface MCPServerInstance extends BaseInstance {
  type: 'mcp_server'
  config: BetaRequestMCPServerURLDefinition
}

export interface ToolsContainerInstance extends BaseInstance {
  type: 'tools_container'
  children: Instance[]
}

export interface SubagentInstance extends BaseAgentInstance {
  type: 'subagent'
  name: string
  description?: string
  props: AgentProps
  children: Instance[]
  reactChildren: React.ReactNode | null
  systemParts: Array<{ content: string; priority: number }>
  tools: InternalTool[]
  sdkTools: BetaToolUnion[]
  contextParts: Array<{ content: string; priority: number }>
  messages: BetaMessageParam[]
  mcpServers: BetaRequestMCPServerURLDefinition[]
}

export type AgentLike = AgentInstance | SubagentInstance

export type Instance =
  | AgentInstance
  | SubagentInstance
  | ToolInstance
  | SdkToolInstance
  | SystemInstance
  | ContextInstance
  | MessageInstance
  | ToolsContainerInstance
  | MCPServerInstance

export type PendingUpdate =
  | { type: 'tool_added'; tool: InternalTool }
  | { type: 'tool_removed'; toolName: string }
  | { type: 'sdk_tool_added'; tool: BetaToolUnion }
  | { type: 'sdk_tool_removed'; toolName: string }
  | { type: 'system_updated'; content: string; priority: number }
  | { type: 'context_updated'; content: string; priority: number }
  | { type: 'message_added'; message: BetaMessageParam }

export interface AgentComponentProps extends AgentProps {
  client?: Anthropic
  children?: React.ReactNode
}

export interface ToolComponentProps {
  tool: InternalTool
}

export interface SdkToolComponentProps {
  tool: BetaToolUnion
}

export interface SystemComponentProps {
  children: React.ReactNode
  priority?: number
  cache?: 'ephemeral'
}

export interface ContextComponentProps {
  children: React.ReactNode
  priority?: number
  cache?: 'ephemeral'
}

export interface MessageComponentProps {
  role: 'user' | 'assistant'
  children: React.ReactNode
}

export interface MCPServerComponentProps {
  name: string
  url: string
  authorization_token?: string
  tool_configuration?: BetaRequestMCPServerURLDefinition['tool_configuration']
}

export interface ToolsContainerProps {
  children?: React.ReactNode
}

export function isAgentInstance(instance: Instance): instance is AgentInstance {
  return instance.type === 'agent'
}

export function isToolInstance(instance: Instance): instance is ToolInstance {
  return instance.type === 'tool'
}

export function isSdkToolInstance(
  instance: Instance,
): instance is SdkToolInstance {
  return instance.type === 'sdk_tool'
}

export function isSystemInstance(
  instance: Instance,
): instance is SystemInstance {
  return instance.type === 'system'
}

export function isContextInstance(
  instance: Instance,
): instance is ContextInstance {
  return instance.type === 'context'
}

export function isMessageInstance(
  instance: Instance,
): instance is MessageInstance {
  return instance.type === 'message'
}

export function isToolsContainerInstance(
  instance: Instance,
): instance is ToolsContainerInstance {
  return instance.type === 'tools_container'
}

export function isSubagentInstance(
  instance: Instance,
): instance is SubagentInstance {
  return instance.type === 'subagent'
}

export function isAgentLike(instance: Instance): instance is AgentLike {
  return instance.type === 'agent' || instance.type === 'subagent'
}

export function isMCPServerInstance(
  instance: Instance,
): instance is MCPServerInstance {
  return instance.type === 'mcp_server'
}

export function isInstance(value: unknown): value is Instance {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    'parent' in value
  )
}
