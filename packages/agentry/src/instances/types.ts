import type {
  AgentMessageParam,
  ImageContent,
  TextContent,
} from '../types/messages'
import type {
  AgentProps,
  InternalTool,
  AgentToolFunction,
  InternalAgentTool,
} from '../types'
import type { JsonValue } from '../types/json'
import type { AgentStore } from '../store'
import type { TSchema } from 'typebox'
import type { ProviderModelOverride } from '../types/agent'
import type { MCPServerConfig } from '../mcp/types'

export type { MCPServerConfig }

export enum InstanceType {
  Agent = 'agent',
  Tool = 'tool',
  System = 'system',
  Context = 'context',
  Message = 'message',
  Subagent = 'subagent',
  AgentTool = 'agent_tool',
  Tools = 'tools',
  McpServer = 'mcp_server',
  Condition = 'condition',
}

export interface BaseInstance {
  type: InstanceType
  parent: Instance | null
}

export interface AgentInstance extends BaseInstance {
  type: InstanceType.Agent
  props: AgentProps
  systemParts: Array<{ content: string }>
  /**
   * Name-keyed rather than positional: a tool's identity is its name, which is
   * what makes conditional mounting robust and lets consecutive renders be
   * diffed. Insertion order is preserved, so wire order stays stable.
   */
  tools: Map<string, InternalTool>
  /** Names seen more than once during collection; rejected at the turn boundary. */
  duplicateToolNames: Set<string>
  mcpServers: MCPServerConfig[]
  children: Instance[]
  store: AgentStore
}

export interface ToolInstance extends BaseInstance {
  type: InstanceType.Tool
  tool: InternalTool
}

export interface SystemInstance extends BaseInstance {
  type: InstanceType.System
  content: string
}

export interface ContextInstance extends BaseInstance {
  type: InstanceType.Context
  content: string
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
  systemParts: Array<{ content: string }>
  tools: Map<string, InternalTool>
  duplicateToolNames: Set<string>
  mcpServers: MCPServerConfig[]
  agentNode: React.ReactNode | null
}

export interface AgentToolInstance extends BaseInstance {
  type: InstanceType.AgentTool
  name: string
  description: string
  parameters: TSchema
  jsonSchema: Record<string, JsonValue>
  agent: AgentToolFunction<TSchema>
}

export type ConditionInstance = BaseInstance &
  ProviderModelOverride & {
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
  | SystemInstance
  | ContextInstance
  | MessageInstance
  | ToolsContainerInstance
  | MCPServerInstance
  | ConditionInstance

export type AgentComponentProps = AgentProps & {
  children?: React.ReactNode
}

export interface ToolComponentProps {
  tool: InternalTool
}

export interface AgentToolComponentProps {
  agentTool: InternalAgentTool
}

export interface SystemComponentProps {
  children: React.ReactNode
}

export interface ContextComponentProps {
  children: React.ReactNode
}

export interface MessageComponentProps {
  role: 'user' | 'assistant'
  children?: React.ReactNode
  rawContent?: string | Array<TextContent | ImageContent>
}

export type MessageRawContent = MessageComponentProps['rawContent']

export type MCPServerComponentProps = MCPServerConfig

export interface ToolsContainerProps {
  children?: React.ReactNode
}

export type ConditionComponentProps = {
  when: boolean | string
  children?: React.ReactNode
} & ProviderModelOverride

export function isMCPServerInstance(
  instance: Instance,
): instance is MCPServerInstance {
  return instance.type === InstanceType.McpServer
}

export function isAgentInstance(instance: Instance): instance is AgentInstance {
  return instance.type === InstanceType.Agent
}

export function isToolInstance(instance: Instance): instance is ToolInstance {
  return instance.type === InstanceType.Tool
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
