import type { AgentMessageParam, AgentContentBlock } from '../types/messages'
import type {
  AgentProps,
  InternalTool,
  BuiltInTool,
  AgentToolFunction,
  InternalAgentTool,
} from '../types'
import type { JsonValue } from '../types/json'
import type { ExecutionEngine } from '../execution'
import type { AgentStore } from '../store'
import type { z } from 'zod'
import type { ProviderClientMap, MCPServerConfig } from '../providers/types'

export type { MCPServerConfig }

export interface BaseInstance {
  type: string
  parent: Instance | null
}

export interface AgentInstance extends BaseInstance {
  type: 'agent'
  props: AgentProps
  client: ProviderClientMap[keyof ProviderClientMap] | undefined
  engine: ExecutionEngine | null
  systemParts: Array<{ content: string; cache?: 'ephemeral' }>
  tools: InternalTool[]
  sdkTools: BuiltInTool[]
  mcpServers: MCPServerConfig[]
  children: Instance[]
  store: AgentStore
}

export interface ToolInstance extends BaseInstance {
  type: 'tool'
  tool: InternalTool
}

export interface SdkToolInstance extends BaseInstance {
  type: 'sdk_tool'
  tool: BuiltInTool
}

export interface SystemInstance extends BaseInstance {
  type: 'system'
  content: string
  cache?: 'ephemeral'
}

export interface ContextInstance extends BaseInstance {
  type: 'context'
  content: string
  cache?: 'ephemeral'
}

export interface MessageInstance extends BaseInstance {
  type: 'message'
  message: AgentMessageParam
}

export interface MCPServerInstance extends BaseInstance {
  type: 'mcp_server'
  config: MCPServerConfig
}

export interface ToolsContainerInstance extends BaseInstance {
  type: 'tools_container'
  children: Instance[]
}

export interface SubagentInstance extends BaseInstance {
  type: 'subagent'
  name: string
  description?: string
  props: AgentProps
  children: Instance[]
  systemParts: Array<{ content: string; cache?: 'ephemeral' }>
  tools: InternalTool[]
  sdkTools: BuiltInTool[]
  mcpServers: MCPServerConfig[]
  agentNode: React.ReactNode | null
}

export interface AgentToolInstance extends BaseInstance {
  type: 'agent_tool'
  name: string
  description: string
  parameters: z.ZodType
  jsonSchema: Record<string, JsonValue>
  agent: AgentToolFunction<z.ZodType>
}

export interface ConditionInstance extends BaseInstance {
  type: 'condition'
  parent: Instance | null
  when: boolean | string
  isActive: boolean
  children: Instance[]
}

export type AgentLike = AgentInstance | SubagentInstance

export type Instance =
  | AgentInstance
  | SubagentInstance
  | AgentToolInstance
  | ToolInstance
  | SdkToolInstance
  | SystemInstance
  | ContextInstance
  | MessageInstance
  | ToolsContainerInstance
  | MCPServerInstance
  | ConditionInstance

export type AgentComponentProps = AgentProps & {
  client?: ProviderClientMap[keyof ProviderClientMap]
  children?: React.ReactNode
}

export interface ToolComponentProps {
  tool: InternalTool
}

export interface AgentToolComponentProps {
  agentTool: InternalAgentTool
}

export interface SdkToolComponentProps {
  tool: BuiltInTool
}

export interface SystemComponentProps {
  children: React.ReactNode
  cache?: 'ephemeral'
}

export interface ContextComponentProps {
  children: React.ReactNode
  cache?: 'ephemeral'
}

export interface MessageComponentProps {
  role: 'user' | 'assistant'
  children?: React.ReactNode
  rawContent?: string | AgentContentBlock[]
}

export interface MCPServerComponentProps {
  name: string
  url: string
  authorization_token?: string
  tool_configuration?: MCPServerConfig['tool_configuration']
}

export interface ToolsContainerProps {
  children?: React.ReactNode
}

export interface ConditionComponentProps {
  when: boolean | string
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

export function isAgentToolInstance(
  instance: Instance,
): instance is AgentToolInstance {
  return instance.type === 'agent_tool'
}

export function isConditionInstance(
  instance: Instance,
): instance is ConditionInstance {
  return instance.type === 'condition'
}

export function isInstance(value: object | null): value is Instance {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    'parent' in value
  )
}
