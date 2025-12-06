import Anthropic from '@anthropic-ai/sdk'
import type React from 'react'
import type {
  Instance,
  AgentInstance,
  SubagentInstance,
  AgentToolInstance,
  ToolInstance,
  SdkToolInstance,
  SystemInstance,
  ContextInstance,
  MessageInstance,
  ToolsContainerInstance,
  MCPServerInstance,
  ConditionInstance,
  AgentComponentProps,
  AgentToolComponentProps,
  ToolComponentProps,
  SdkToolComponentProps,
  SystemComponentProps,
  ContextComponentProps,
  MessageComponentProps,
  ToolsContainerProps,
  MCPServerComponentProps,
  ConditionComponentProps,
} from './types'
import { isAgentInstance, isInstance } from './types'
import type { AgentProps, CompactionControl, Model } from '../types'

type RequiredAgentProps = { [K in keyof Required<AgentProps>]: AgentProps[K] }

interface SubagentCreationProps extends Omit<
  AgentComponentProps,
  'children' | 'model'
> {
  model?: AgentComponentProps['model']
  agentNode?: React.ReactNode
}

interface PropagatedSettings {
  stream?: boolean
  temperature?: number
  stopSequences?: string[]
  compactionControl?: CompactionControl
  maxTokens?: number
  maxIterations?: number
  model?: Model
  thinking?: AgentProps['thinking']
  betas?: string[]
}

export type ElementType =
  | 'agent'
  | 'agent_tool'
  | 'tool'
  | 'sdk_tool'
  | 'system'
  | 'context'
  | 'message'
  | 'tools'
  | 'mcp_server'
  | 'condition'

export type ElementProps =
  | AgentComponentProps
  | AgentToolComponentProps
  | ToolComponentProps
  | SdkToolComponentProps
  | SystemComponentProps
  | ContextComponentProps
  | MessageComponentProps
  | ToolsContainerProps
  | MCPServerComponentProps
  | ConditionComponentProps

export function createInstance(
  type: ElementType,
  props: ElementProps,
  rootContainer: Instance | unknown,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _hostContext: PropagatedSettings = {},
): Instance {
  switch (type) {
    case 'agent':
      return createAgentInstance(props as AgentComponentProps, rootContainer)
    case 'agent_tool':
      return createAgentToolInstance(props as AgentToolComponentProps)
    case 'tool':
      return createToolInstance(props as ToolComponentProps)
    case 'sdk_tool':
      return createSdkToolInstance(props as SdkToolComponentProps)
    case 'system':
      return createSystemInstance(props as SystemComponentProps)
    case 'context':
      return createContextInstance(props as ContextComponentProps)
    case 'message':
      return createMessageInstance(props as MessageComponentProps)
    case 'tools':
      return createToolsContainerInstance(props as ToolsContainerProps)
    case 'mcp_server':
      return createMCPServerInstance(props as MCPServerComponentProps)
    case 'condition':
      return createConditionInstance(props as ConditionComponentProps)
    default:
      throw new Error(`Unknown element type: ${type}`)
  }
}

function createAgentInstance(
  props: AgentComponentProps,
  rootContainer?: unknown,
): AgentInstance {
  if (
    !rootContainer ||
    !isInstance(rootContainer) ||
    !isAgentInstance(rootContainer) ||
    !rootContainer.store
  ) {
    throw new Error('No store found in root container.')
  }

  const client = props.client ?? rootContainer.client ?? new Anthropic()
  const store = rootContainer.store

  const instance: AgentInstance = {
    type: 'agent',
    props: {
      model: props.model,
      name: props.name,
      description: props.description,
      maxTokens: props.maxTokens ?? 4096,
      maxIterations: props.maxIterations,
      stopSequences: props.stopSequences,
      temperature: props.temperature,
      stream: props.stream ?? true,
      compactionControl: props.compactionControl,
      thinking: props.thinking,
      betas: props.betas,
      onMessage: props.onMessage,
      onComplete: props.onComplete,
      onError: props.onError,
      onStepFinish: props.onStepFinish,
    } satisfies RequiredAgentProps,
    client,
    engine: null,
    systemParts: [],
    tools: [],
    sdkTools: [],
    mcpServers: [],
    children: [],
    parent: null,
    store,
  }

  if (
    rootContainer &&
    isInstance(rootContainer) &&
    isAgentInstance(rootContainer) &&
    props.model
  ) {
    rootContainer.props.model = props.model
  }

  return instance
}

function createToolInstance(props: ToolComponentProps): ToolInstance {
  return {
    type: 'tool',
    tool: props.tool,
    parent: null,
  }
}

function createAgentToolInstance(
  props: AgentToolComponentProps,
): AgentToolInstance {
  const { agentTool } = props
  return {
    type: 'agent_tool',
    name: agentTool.name,
    description: agentTool.description,
    parameters: agentTool.parameters,
    jsonSchema: agentTool.jsonSchema,
    agent: agentTool.agent,
    parent: null,
  }
}

function createSdkToolInstance(props: SdkToolComponentProps): SdkToolInstance {
  return {
    type: 'sdk_tool',
    tool: props.tool,
    parent: null,
  }
}

function createSystemInstance(props: SystemComponentProps): SystemInstance {
  return {
    type: 'system',
    content: reactNodeToString(props.children),
    cache: props.cache,
    parent: null,
  }
}

function createContextInstance(props: ContextComponentProps): ContextInstance {
  return {
    type: 'context',
    content: reactNodeToString(props.children),
    cache: props.cache,
    parent: null,
  }
}

function reactNodeToString(node: React.ReactNode): string {
  if (node === null || node === undefined) {
    return ''
  }
  if (typeof node === 'string') {
    return node
  }
  if (typeof node === 'number') {
    return String(node)
  }
  if (typeof node === 'boolean') {
    return ''
  }
  if (Array.isArray(node)) {
    return node.map(reactNodeToString).join('')
  }
  return String(node)
}

function createMessageInstance(props: MessageComponentProps): MessageInstance {
  return {
    type: 'message',
    message: {
      role: props.role,
      content: reactNodeToString(props.children),
    },
    parent: null,
  }
}

function createToolsContainerInstance(
  _props: ToolsContainerProps, // eslint-disable-line @typescript-eslint/no-unused-vars
): ToolsContainerInstance {
  return {
    type: 'tools_container',
    children: [],
    parent: null,
  }
}

function createMCPServerInstance(
  props: MCPServerComponentProps,
): MCPServerInstance {
  return {
    type: 'mcp_server',
    config: {
      type: 'url',
      name: props.name,
      url: props.url,
      authorization_token: props.authorization_token,
      tool_configuration: props.tool_configuration,
    },
    parent: null,
  }
}

function createConditionInstance(
  props: ConditionComponentProps,
): ConditionInstance {
  return {
    type: 'condition',
    when: props.when,
    isActive: false,
    children: [],
    parent: null,
  }
}

export function createSubagentInstance(
  props: SubagentCreationProps,
  inherited: PropagatedSettings = {},
): SubagentInstance {
  if (!props.name) {
    throw new Error('Child agents must have a name property')
  }

  const model = props.model ?? inherited.model
  if (!model) {
    throw new Error(
      `Subagent "${props.name}" requires a model. Either provide model in props or ensure parent agent has a model.`,
    )
  }

  return {
    type: 'subagent',
    name: props.name,
    description: props.description,
    props: {
      model,
      name: props.name,
      description: props.description,
      // inherit with fallback to defaults (halve numeric values for subagents)
      maxTokens:
        props.maxTokens ??
        (inherited.maxTokens ? Math.floor(inherited.maxTokens / 2) : 4096),
      maxIterations:
        props.maxIterations ??
        (inherited.maxIterations
          ? Math.floor(inherited.maxIterations / 2)
          : undefined),
      stopSequences: props.stopSequences ?? inherited.stopSequences,
      temperature: props.temperature ?? inherited.temperature,
      stream: props.stream ?? inherited.stream ?? true,
      compactionControl: props.compactionControl ?? inherited.compactionControl,
      thinking: props.thinking ?? inherited.thinking,
      betas: props.betas ?? inherited.betas,
      // callbacks never inherited
      onMessage: props.onMessage,
      onComplete: props.onComplete,
      onError: props.onError,
      onStepFinish: props.onStepFinish,
    } satisfies RequiredAgentProps,
    systemParts: [],
    tools: [],
    sdkTools: [],
    mcpServers: [],
    children: [],
    parent: null,
    agentNode: props.agentNode ?? null,
  }
}
