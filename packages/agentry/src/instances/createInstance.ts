import type React from 'react'
import type {
  Instance,
  AgentInstance,
  SubagentInstance,
  AgentToolInstance,
  ToolInstance,
  SystemInstance,
  ContextInstance,
  MessageInstance,
  ToolsContainerInstance,
  ConditionInstance,
  AgentComponentProps,
  AgentToolComponentProps,
  ToolComponentProps,
  SystemComponentProps,
  ContextComponentProps,
  MessageComponentProps,
  ToolsContainerProps,
  ConditionComponentProps,
} from './types'
import { InstanceType, isAgentInstance, isInstance } from './types'
import { assistantSeedMessage, userMessage } from '../types/messages'
import type {
  AgentProps,
  BaseAgentProps,
  CompactionControl,
  Model,
} from '../types'

/** Requires all AgentProps keys, with variant fields distributed across the union. */
type AgentPropsAllKeys = {
  [K in keyof Required<BaseAgentProps>]: BaseAgentProps[K]
} & {
  provider: AgentProps['provider']
  model: AgentProps['model']
  thinking: AgentProps['thinking']
}

interface SubagentCreationProps extends Omit<
  AgentComponentProps,
  'children' | 'model'
> {
  model?: AgentComponentProps['model']
  agentNode?: React.ReactNode
}

interface PropagatedSettings {
  provider?: AgentProps['provider']
  stream?: boolean
  temperature?: number
  compactionControl?: CompactionControl
  maxTokens?: number
  maxIterations?: number
  model?: Model
  thinking?: AgentProps['thinking']
}

export type ElementProps =
  | AgentComponentProps
  | AgentToolComponentProps
  | ToolComponentProps
  | SystemComponentProps
  | ContextComponentProps
  | MessageComponentProps
  | ToolsContainerProps
  | ConditionComponentProps

// oxlint-disable-next-line max-params -- called by reconciler host config with fixed arity
export function createInstance(
  type: InstanceType,
  props: ElementProps,
  rootContainer: Instance | object | null,
  _hostContext: PropagatedSettings = {},
): Instance {
  switch (type) {
    case InstanceType.Agent:
      return createAgentInstance(props as AgentComponentProps, rootContainer)
    case InstanceType.AgentTool:
      return createAgentToolInstance(props as AgentToolComponentProps)
    case InstanceType.Tool:
      return createToolInstance(props as ToolComponentProps)
    case InstanceType.System:
      return createSystemInstance(props as SystemComponentProps)
    case InstanceType.Context:
      return createContextInstance(props as ContextComponentProps)
    case InstanceType.Message:
      return createMessageInstance(props as MessageComponentProps)
    case InstanceType.Tools:
      return createToolsContainerInstance(props as ToolsContainerProps)
    case InstanceType.Condition:
      return createConditionInstance(props as ConditionComponentProps)
    default:
      throw new Error(`Unknown element type: ${type}`)
  }
}

function createAgentInstance(
  props: AgentComponentProps,
  rootContainer?: Instance | object | null,
): AgentInstance {
  if (
    !rootContainer ||
    !isInstance(rootContainer) ||
    !isAgentInstance(rootContainer) ||
    !rootContainer.store
  ) {
    throw new Error('No store found in root container.')
  }

  const provider = props.provider ?? rootContainer.props.provider
  const store = rootContainer.store

  const instance: AgentInstance = {
    type: InstanceType.Agent,
    props: {
      provider,
      model: props.model,
      name: props.name,
      description: props.description,
      maxTokens: props.maxTokens ?? 4096,
      maxIterations: props.maxIterations,
      temperature: props.temperature,
      stream: props.stream ?? true,
      compactionControl: props.compactionControl,
      thinking: props.thinking,
      onMessage: props.onMessage,
      onComplete: props.onComplete,
      onError: props.onError,
      onStepFinish: props.onStepFinish,
    } satisfies AgentPropsAllKeys as AgentProps,
    engine: null,
    systemParts: [],
    tools: [],
    children: [],
    parent: null,
    store,
  }

  if (props.model) {
    rootContainer.props.model = props.model
  }

  return instance
}

function createToolInstance(props: ToolComponentProps): ToolInstance {
  return {
    type: InstanceType.Tool,
    tool: props.tool,
    parent: null,
  }
}

function createAgentToolInstance(
  props: AgentToolComponentProps,
): AgentToolInstance {
  const { agentTool } = props
  return {
    type: InstanceType.AgentTool,
    name: agentTool.name,
    description: agentTool.description,
    parameters: agentTool.parameters,
    jsonSchema: agentTool.jsonSchema,
    agent: agentTool.agent,
    parent: null,
  }
}

function createSystemInstance(props: SystemComponentProps): SystemInstance {
  return {
    type: InstanceType.System,
    content: reactNodeToString(props.children),
    cache: props.cache,
    parent: null,
  }
}

function createContextInstance(props: ContextComponentProps): ContextInstance {
  return {
    type: InstanceType.Context,
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
  const content = props.rawContent ?? reactNodeToString(props.children)

  return {
    type: InstanceType.Message,
    message:
      props.role === 'user'
        ? userMessage(content)
        : assistantSeedMessage(content),
    parent: null,
  }
}

function createToolsContainerInstance(
  _props: ToolsContainerProps,
): ToolsContainerInstance {
  return {
    type: InstanceType.Tools,
    children: [],
    parent: null,
  }
}

function createConditionInstance(
  props: ConditionComponentProps,
): ConditionInstance {
  return {
    type: InstanceType.Condition,
    when: props.when,
    model: props.model,
    provider: props.provider,
    isActive: typeof props.when === 'boolean' ? props.when : false,
    children: [],
    parent: null,
  }
}

export function createSubagentInstance(
  props: SubagentCreationProps,
  inherited: PropagatedSettings = {},
): SubagentInstance {
  if (!props.name) {
    throw new Error('Child agents must have a name.')
  }

  const model = props.model ?? inherited.model
  if (!model) {
    throw new Error(
      `Subagent "${props.name}" requires a model. Provide one on the subagent or parent agent.`,
    )
  }

  return {
    type: InstanceType.Subagent,
    name: props.name,
    description: props.description,
    props: {
      provider: props.provider ?? inherited.provider,
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
      temperature: props.temperature ?? inherited.temperature,
      stream: props.stream ?? inherited.stream ?? true,
      compactionControl: props.compactionControl ?? inherited.compactionControl,
      thinking: props.thinking ?? inherited.thinking,
      // callbacks never inherited
      onMessage: props.onMessage,
      onComplete: props.onComplete,
      onError: props.onError,
      onStepFinish: props.onStepFinish,
    } satisfies AgentPropsAllKeys as AgentProps,
    systemParts: [],
    tools: [],
    children: [],
    parent: null,
    agentNode: props.agentNode ?? null,
  }
}
