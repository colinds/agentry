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

export enum InstanceType {
  Agent = 'agent',
  Tool = 'tool',
  BuiltInTool = 'built_in_tool',
  System = 'system',
  Context = 'context',
  Message = 'message',
  McpServer = 'mcp_server',
  Subagent = 'subagent',
  AgentTool = 'agent_tool',
  Tools = 'tools',
  Condition = 'condition',
}

export interface BaseInstance {
  type: InstanceType
  parent: Instance | null
}

export interface AgentInstance extends BaseInstance {
  type: InstanceType.Agent
  props: AgentProps
  client: ProviderClientMap[keyof ProviderClientMap] | undefined
  engine: ExecutionEngine | null
  systemParts: Array<{ content: string; cache?: 'ephemeral' }>
  tools: InternalTool[]
  builtInTools: BuiltInTool[]
  mcpServers: MCPServerConfig[]
  children: Instance[]
  store: AgentStore
}

export interface ToolInstance extends BaseInstance {
  type: InstanceType.Tool
  tool: InternalTool
}

export interface SdkToolInstance extends BaseInstance {
  type: InstanceType.BuiltInTool
  tool: BuiltInTool
}

export interface SystemInstance extends BaseInstance {
  type: InstanceType.System
  content: string
  cache?: 'ephemeral'
}

export interface ContextInstance extends BaseInstance {
  type: InstanceType.Context
  content: string
  cache?: 'ephemeral'
}

export interface MessageInstance extends BaseInstance {
  type: InstanceType.Message
  message: AgentMessageParam
}

export interface MCPServerInstance extends BaseInstance {
  type: InstanceType.McpServer
  config: MCPServerConfig
}

export interface ToolsContainerInstance extends BaseInstance {
  type: InstanceType.Tools
  children: Instance[]
}

export interface SubagentInstance extends BaseInstance {
  type: InstanceType.Subagent
  name: string
  description?: string
  props: AgentProps
  children: Instance[]
  systemParts: Array<{ content: string; cache?: 'ephemeral' }>
  tools: InternalTool[]
  builtInTools: BuiltInTool[]
  mcpServers: MCPServerConfig[]
  agentNode: React.ReactNode | null
}

export interface AgentToolInstance extends BaseInstance {
  type: InstanceType.AgentTool
  name: string
  description: string
  parameters: z.ZodType
  jsonSchema: Record<string, JsonValue>
  agent: AgentToolFunction<z.ZodType>
}

export interface ConditionInstance extends BaseInstance {
  type: InstanceType.Condition
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
  return instance.type === InstanceType.Agent
}

export function isToolInstance(instance: Instance): instance is ToolInstance {
  return instance.type === InstanceType.Tool
}

export function isSdkToolInstance(
  instance: Instance,
): instance is SdkToolInstance {
  return instance.type === InstanceType.BuiltInTool
}

export function isSystemInstance(
  instance: Instance,
): instance is SystemInstance {
  return instance.type === InstanceType.System
}

export function isContextInstance(
  instance: Instance,
): instance is ContextInstance {
  return instance.type === InstanceType.Context
}

export function isMessageInstance(
  instance: Instance,
): instance is MessageInstance {
  return instance.type === InstanceType.Message
}

export function isToolsContainerInstance(
  instance: Instance,
): instance is ToolsContainerInstance {
  return instance.type === InstanceType.Tools
}

export function isSubagentInstance(
  instance: Instance,
): instance is SubagentInstance {
  return instance.type === InstanceType.Subagent
}

export function isAgentLike(instance: Instance): instance is AgentLike {
  return (
    instance.type === InstanceType.Agent ||
    instance.type === InstanceType.Subagent
  )
}

export function isMCPServerInstance(
  instance: Instance,
): instance is MCPServerInstance {
  return instance.type === InstanceType.McpServer
}

export function isAgentToolInstance(
  instance: Instance,
): instance is AgentToolInstance {
  return instance.type === InstanceType.AgentTool
}

export function isConditionInstance(
  instance: Instance,
): instance is ConditionInstance {
  return instance.type === InstanceType.Condition
}

export function isInstance(value: object | null): value is Instance {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    'parent' in value
  )
}
