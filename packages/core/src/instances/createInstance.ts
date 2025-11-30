import Anthropic from '@anthropic-ai/sdk';
import type React from 'react';
import type {
  Instance,
  AgentInstance,
  SubagentInstance,
  ToolInstance,
  SdkToolInstance,
  SystemInstance,
  ContextInstance,
  MessageInstance,
  ToolsContainerInstance,
  AgentComponentProps,
  ToolComponentProps,
  SdkToolComponentProps,
  SystemComponentProps,
  ContextComponentProps,
  MessageComponentProps,
  ToolsContainerProps,
} from './types.ts';
import { isAgentInstance, isInstance } from './types.ts';
import type { CompactionControl, Model } from '../types/index.ts';

// settings that propagate from parent to child
interface PropagatedSettings {
  stream?: boolean;
  temperature?: number;
  stopSequences?: string[];
  compactionControl?: CompactionControl;
  maxTokens?: number;
  maxIterations?: number;
  insideAgent?: boolean;
  model?: Model;
}

// element types we support
export type ElementType =
  | 'agent'
  | 'tool'
  | 'sdk_tool'
  | 'system'
  | 'context'
  | 'message'
  | 'tools';

// props union type
export type ElementProps =
  | AgentComponentProps
  | ToolComponentProps
  | SdkToolComponentProps
  | SystemComponentProps
  | ContextComponentProps
  | MessageComponentProps
  | ToolsContainerProps;

// create an instance from element type and props
export function createInstance(
  type: ElementType,
  props: ElementProps,
  rootContainer: Instance | unknown,
  hostContext: PropagatedSettings = {},
): Instance {
  switch (type) {
    case 'agent':
      // check if this is a child agent (we're nested inside another agent)
      if (hostContext.insideAgent) {
        return createSubagentInstance(props as AgentComponentProps, hostContext);
      }
      // This is the root agent from JSX - use its explicit props, not inherited
      return createAgentInstance(props as AgentComponentProps, rootContainer);
    case 'tool':
      return createToolInstance(props as ToolComponentProps);
    case 'sdk_tool':
      return createSdkToolInstance(props as SdkToolComponentProps);
    case 'system':
      return createSystemInstance(props as SystemComponentProps);
    case 'context':
      return createContextInstance(props as ContextComponentProps);
    case 'message':
      return createMessageInstance(props as MessageComponentProps);
    case 'tools':
      return createToolsContainerInstance(props as ToolsContainerProps);
    default:
      throw new Error(`Unknown element type: ${type}`);
  }
}

function createAgentInstance(props: AgentComponentProps, rootContainer?: unknown): AgentInstance {
  // create or use provided client
  const client = props.client ?? new Anthropic();

  const instance: AgentInstance = {
    type: 'agent',
    props: {
      model: props.model,
      name: props.name,
      maxTokens: props.maxTokens ?? 4096,
      maxIterations: props.maxIterations,
      stopSequences: props.stopSequences,
      temperature: props.temperature,
      stream: props.stream ?? true,
      compactionControl: props.compactionControl,
      onMessage: props.onMessage,
      onComplete: props.onComplete,
      onError: props.onError,
    },
    client,
    engine: null,
    systemParts: [],
    tools: [],
    sdkTools: [],
    contextParts: [],
    messages: [],
    children: [],
    pendingUpdates: [],
    parent: null,
    _updating: false,
  };

  // If this is the root agent (first child of container), update container's model for propagation
  if (rootContainer && isInstance(rootContainer) && isAgentInstance(rootContainer) && props.model) {
    rootContainer.props.model = props.model;
  }

  return instance;
}

function createToolInstance(props: ToolComponentProps): ToolInstance {
  return {
    type: 'tool',
    tool: props.tool,
    parent: null,
  };
}

function createSdkToolInstance(props: SdkToolComponentProps): SdkToolInstance {
  return {
    type: 'sdk_tool',
    tool: props.tool,
    parent: null,
  };
}

function createSystemInstance(props: SystemComponentProps): SystemInstance {
  return {
    type: 'system',
    content: reactNodeToString(props.children),
    priority: props.priority ?? 1000, // high priority by default
    parent: null,
  };
}

function createContextInstance(props: ContextComponentProps): ContextInstance {
  return {
    type: 'context',
    content: reactNodeToString(props.children),
    priority: props.priority ?? 500, // medium priority by default
    parent: null,
  };
}

// utility to convert ReactNode to string
function reactNodeToString(node: React.ReactNode): string {
  if (node === null || node === undefined) {
    return '';
  }
  if (typeof node === 'string') {
    return node;
  }
  if (typeof node === 'number') {
    return String(node);
  }
  if (typeof node === 'boolean') {
    return '';
  }
  if (Array.isArray(node)) {
    return node.map(reactNodeToString).join('');
  }
  // For other ReactNode types (ReactElement, ReactPortal, etc.), convert to string
  // This handles the common case where children are text with interpolated expressions
  return String(node);
}

function createMessageInstance(props: MessageComponentProps): MessageInstance {
  return {
    type: 'message',
    message: {
      role: props.role,
      content: reactNodeToString(props.children),
    },
    parent: null,
  };
}

function createToolsContainerInstance(_props: ToolsContainerProps): ToolsContainerInstance {
  return {
    type: 'tools_container',
    children: [],
    parent: null,
  };
}

export function createSubagentInstance(
  props: AgentComponentProps,
  inherited: PropagatedSettings = {},
): SubagentInstance {
  if (!props.name) {
    throw new Error('Child agents must have a name property');
  }

  return {
    type: 'subagent',
    name: props.name,
    description: props.description,
    agentElement: null,
    props: {
      model: props.model ?? inherited.model, // inherit model from parent if not specified
      name: props.name,
      // inherit with fallback to defaults (halve numeric values for subagents)
      maxTokens: props.maxTokens ?? (inherited.maxTokens ? Math.floor(inherited.maxTokens / 2) : 2048),
      maxIterations: props.maxIterations ?? (inherited.maxIterations ? Math.floor(inherited.maxIterations / 2) : 5),
      stopSequences: props.stopSequences ?? inherited.stopSequences,
      temperature: props.temperature ?? inherited.temperature,
      stream: props.stream ?? inherited.stream ?? false,
      compactionControl: props.compactionControl ?? inherited.compactionControl,
      // callbacks never inherited
      onMessage: props.onMessage,
      onComplete: props.onComplete,
      onError: props.onError,
    },
    systemParts: [],
    tools: [],
    sdkTools: [],
    contextParts: [],
    messages: [],
    children: [],
    parent: null,
  };
}
