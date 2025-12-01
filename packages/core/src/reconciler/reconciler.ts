import { createContext } from 'react'
import ReactReconciler from 'react-reconciler'
import {
  type Instance,
  type AgentInstance,
  type SubagentInstance,
  type AgentLike,
  isAgentInstance,
  isSubagentInstance,
  isAgentLike,
  isToolInstance,
  isSdkToolInstance,
  isSystemInstance,
  isContextInstance,
  isMessageInstance,
  isToolsContainerInstance,
  isMCPServerInstance,
} from '../instances/index.ts'
import {
  createInstance,
  type ElementType,
  type ElementProps,
} from '../instances/index.ts'
import type { InternalTool, CompactionControl, Model } from '../types/index.ts'
import { debug } from '../debug.ts'
import { diffProps, disposeOnIdle } from './utils.ts'

function createReconciler<
  Type,
  Props,
  Container,
  Instance,
  TextInstance,
  SuspenseInstance,
  HydratableInstance,
  FormInstance,
  PublicInstance,
  HostContext,
  ChildSet,
  TimeoutHandle,
  NoTimeout,
  TransitionStatus,
>(
  config: ReactReconciler.HostConfig<
    Type,
    Props,
    Container,
    Instance,
    TextInstance,
    SuspenseInstance,
    HydratableInstance,
    FormInstance,
    PublicInstance,
    HostContext,
    ChildSet,
    TimeoutHandle,
    NoTimeout,
    TransitionStatus
  >,
): ReactReconciler.Reconciler<
  Container,
  Instance,
  TextInstance,
  SuspenseInstance,
  FormInstance,
  PublicInstance
> {
  // Type assertion needed due to complex generic types in react-reconciler
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reconciler = ReactReconciler(config as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return reconciler as any
}

interface PropagatedSettings {
  stream?: boolean
  temperature?: number
  stopSequences?: string[]
  compactionControl?: CompactionControl
  maxTokens?: number
  maxIterations?: number
  insideAgent?: boolean // track if we're nested inside an agent
  model?: Model // model to inherit for subagents
}

interface HostConfig {
  type: ElementType
  props: ElementProps
  container: AgentInstance
  instance: Instance
  textInstance: null
  suspenseInstance: never
  hydratableInstance: never
  formInstance: never
  publicInstance: Instance
  hostContext: PropagatedSettings
  childSet: never
  timeoutHandle: ReturnType<typeof setTimeout>
  noTimeout: -1
  TransitionStatus: null
}

export const reconciler = createReconciler<
  HostConfig['type'],
  HostConfig['props'],
  HostConfig['container'],
  HostConfig['instance'],
  HostConfig['textInstance'],
  HostConfig['suspenseInstance'],
  HostConfig['hydratableInstance'],
  HostConfig['formInstance'],
  HostConfig['publicInstance'],
  HostConfig['hostContext'],
  HostConfig['childSet'],
  HostConfig['timeoutHandle'],
  HostConfig['noTimeout'],
  HostConfig['TransitionStatus']
>({
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,

  isPrimaryRenderer: false,
  warnsIfNotActing: false,
  noTimeout: -1 as const,

  NotPendingTransition: null,
  // The reconciler types use the internal ReactContext with all the hidden properties
  // so we have to cast from the public React.Context type
  HostTransitionContext: createContext<HostConfig['TransitionStatus']>(
    null,
  ) as unknown as ReactReconciler.ReactContext<HostConfig['TransitionStatus']>,

  setCurrentUpdatePriority() {},

  // todo(investigate): why not 32 / DefaultEventPriority?
  getCurrentUpdatePriority: () => 1,

  resolveUpdatePriority: () => 1,

  resetFormInstance() {},

  requestPostPaintCallback() {},

  shouldAttemptEagerTransition: () => false,

  trackSchedulerEvent: () => {},

  resolveEventType: () => null,

  resolveEventTimeStamp: () => -1.1,

  maySuspendCommit: () => false,

  preloadInstance: () => false,

  startSuspendingCommit() {},

  suspendInstance() {},

  waitForCommitToBeReady: () => null,

  createInstance(type, props, rootContainer, hostContext, _internalHandle) {
    void _internalHandle
    return createInstance(type, props, rootContainer, hostContext)
  },

  createTextInstance: () => null,

  appendInitialChild(parentInstance, child) {
    // guard against null children (from createTextInstance)
    if (child === null) return
    appendChild(parentInstance, child)
  },

  finalizeInitialChildren: () => false,

  shouldSetTextContent: () => false,

  getRootHostContext(rootContainer) {
    return {
      stream: rootContainer.props.stream,
      temperature: rootContainer.props.temperature,
      stopSequences: rootContainer.props.stopSequences,
      compactionControl: rootContainer.props.compactionControl,
      maxTokens: rootContainer.props.maxTokens,
      maxIterations: rootContainer.props.maxIterations,
      insideAgent: false, // root level, not inside an agent yet
      model: rootContainer.props.model, // propagate model for subagents
    }
  },

  getChildHostContext(parentHostContext, type, _rootContainer) {
    void _rootContainer
    if (type === 'agent') {
      return { ...parentHostContext, insideAgent: true }
    }
    return parentHostContext
  },

  getPublicInstance(instance: HostConfig['instance']) {
    return instance
  },

  prepareForCommit: () => null,

  resetAfterCommit() {},

  preparePortalMount() {},

  scheduleTimeout: setTimeout,

  cancelTimeout: clearTimeout,

  getInstanceFromNode: () => null,

  beforeActiveInstanceBlur() {},

  afterActiveInstanceBlur() {},

  prepareScopeUpdate() {},

  getInstanceFromScope: () => null,

  detachDeletedInstance() {},

  appendChild(parentInstance, child) {
    // guard against null children
    if (child === null) return
    appendChild(parentInstance, child)
  },

  appendChildToContainer(container, child) {
    if (child === null) return
    appendChild(container, child)
  },

  insertBefore(parentInstance, child, beforeChild) {
    // guard against null children
    if (child === null || beforeChild === null) return
    insertBefore(parentInstance, child, beforeChild)
  },

  insertInContainerBefore(container, child, beforeChild) {
    if (child === null || beforeChild === null) return
    insertBefore(container, child, beforeChild)
  },

  removeChild(parentInstance, child) {
    // guard against null children
    if (child === null) return
    removeChild(parentInstance, child)
  },

  removeChildFromContainer(container, child) {
    if (child === null) return
    removeChild(container, child)
  },

  resetTextContent() {},

  commitTextUpdate() {},

  commitMount() {},

  commitUpdate(instance, _type, prevProps, nextProps, _internalHandle) {
    void _internalHandle
    const { changes, hasChanges } = diffProps(prevProps, nextProps)

    if (hasChanges) {
      applyUpdate(instance, changes)
    }
  },

  hideInstance() {},

  hideTextInstance() {},

  unhideInstance() {},

  unhideTextInstance() {},

  clearContainer(_container) {
    if (isAgentInstance(_container)) {
      _container.children = []
      _container.systemParts = []
      _container.tools = []
      _container.sdkTools = []
      _container.contextParts = []
      _container.messages = []
      _container.mcpServers = []
    }
  },
})

function appendChild(parent: Instance, child: Instance): void {
  child.parent = parent

  if (isAgentLike(parent)) {
    parent.children.push(child)
    debug(
      'reconciler',
      `appendChild: Adding child to ${isAgentInstance(parent) ? parent.props.name : 'subagent'}, child type: ${child.type}, isSubagent: ${isSubagentInstance(child)}`,
    )
    collectFromChild(parent, child)
  } else if (isToolsContainerInstance(parent)) {
    parent.children.push(child)
    const agent = findParentAgent(parent)
    if (agent) {
      debug(
        'reconciler',
        `appendChild: Adding child from Tools to ${isAgentInstance(agent) ? agent.props.name : 'subagent'}, child type: ${child.type}`,
      )
      collectFromChild(agent, child)
    }
  }
}

function insertBefore(
  parent: Instance,
  child: Instance,
  beforeChild: Instance,
): void {
  child.parent = parent

  if (isAgentLike(parent)) {
    const index = parent.children.indexOf(beforeChild)
    if (index >= 0) {
      parent.children.splice(index, 0, child)
    } else {
      parent.children.push(child)
    }
    debug(
      'reconciler',
      `insertBefore: Adding child to ${isAgentInstance(parent) ? parent.props.name : 'subagent'}, child type: ${child.type}, isSubagent: ${isSubagentInstance(child)}`,
    )
    collectFromChild(parent, child)
  } else if (isToolsContainerInstance(parent)) {
    const index = parent.children.indexOf(beforeChild)
    if (index >= 0) {
      parent.children.splice(index, 0, child)
    } else {
      parent.children.push(child)
    }
    const agent = findParentAgent(parent)
    if (agent) {
      debug(
        'reconciler',
        `insertBefore: Adding child from Tools to ${isAgentInstance(agent) ? agent.props.name : 'subagent'}, child type: ${child.type}`,
      )
      collectFromChild(agent, child)
    }
  }
}

function removeChild(parent: Instance, child: Instance): void {
  child.parent = null

  if (isAgentLike(parent)) {
    const index = parent.children.indexOf(child)
    if (index >= 0) {
      parent.children.splice(index, 1)
    }
    uncollectFromChild(parent, child)
  } else if (isToolsContainerInstance(parent)) {
    const index = parent.children.indexOf(child)
    if (index >= 0) {
      parent.children.splice(index, 1)
    }
    const agent = findParentAgent(parent)
    if (agent) {
      uncollectFromChild(agent, child)
    }
  }

  disposeOnIdle(() => {
    if (isSubagentInstance(child)) {
      child.tools = []
      child.sdkTools = []
      child.systemParts = []
      child.contextParts = []
      child.messages = []
      child.mcpServers = []
      child.children = []
    }
  })
}

function applyUpdate(
  instance: Instance,
  updatePayload: Partial<ElementProps>,
): void {
  if (isAgentInstance(instance)) {
    if (
      'model' in updatePayload &&
      updatePayload.model !== instance.props.model
    ) {
      console.warn(
        '[agentry] Model prop changed at runtime. This will only take effect on the next execution.',
        { oldModel: instance.props.model, newModel: updatePayload.model },
      )
    }

    Object.assign(instance.props, updatePayload)
  } else if (isSystemInstance(instance)) {
    const payload = updatePayload as { children?: string; priority?: number }
    if (payload.children !== undefined) {
      instance.content = payload.children
    }
    if (payload.priority !== undefined) {
      instance.priority = payload.priority
    }
    const agent = findParentAgent(instance)
    if (agent && isAgentInstance(agent)) {
      rebuildSystemParts(agent)
    }
  } else if (isContextInstance(instance)) {
    const payload = updatePayload as { children?: string; priority?: number }
    if (payload.children !== undefined) {
      instance.content = payload.children
    }
    if (payload.priority !== undefined) {
      instance.priority = payload.priority
    }
    const agent = findParentAgent(instance)
    if (agent && isAgentInstance(agent)) {
      rebuildContextParts(agent)
    }
  } else if (isToolInstance(instance)) {
    const payload = updatePayload as { tool?: typeof instance.tool }
    if (payload.tool !== undefined) {
      const agent = findParentAgent(instance)
      if (agent && isAgentInstance(agent)) {
        const oldIndex = agent.tools.findIndex(
          (t) => t.name === instance.tool.name,
        )
        if (oldIndex >= 0) {
          agent.tools.splice(oldIndex, 1)
        }
        instance.tool = payload.tool
        agent.tools.push(payload.tool)
      }
    }
  }
}

// collect state from a child into an agent-like parent
function collectFromChild(agent: AgentLike, child: Instance): void {
  debug(
    'reconciler',
    `collectFromChild: agent=${isAgentInstance(agent) ? agent.props.name : agent.name}, child.type=${child.type}, isSubagent=${isSubagentInstance(child)}`,
  )
  if (isToolInstance(child)) {
    debug('reconciler', `Tool added: ${child.tool.name}`)
    agent.tools.push(child.tool)
    agent.pendingUpdates.push({ type: 'tool_added', tool: child.tool })
  } else if (isSdkToolInstance(child)) {
    debug('reconciler', `SDK tool added: ${child.tool.name}`)
    agent.sdkTools.push(child.tool)
    agent.pendingUpdates.push({ type: 'sdk_tool_added', tool: child.tool })
  } else if (isSystemInstance(child)) {
    agent.systemParts.push({ content: child.content, priority: child.priority })
  } else if (isContextInstance(child)) {
    agent.contextParts.push({
      content: child.content,
      priority: child.priority,
    })
  } else if (isMessageInstance(child)) {
    agent.messages.push(child.message)
  } else if (isMCPServerInstance(child)) {
    debug('reconciler', `MCP server added: ${child.config.name}`)
    agent.mcpServers.push(child.config)
  } else if (isToolsContainerInstance(child)) {
    for (const grandchild of child.children) {
      collectFromChild(agent, grandchild)
    }
  } else if (isSubagentInstance(child)) {
    if (isAgentInstance(agent) && agent.props.model) {
      child.props.model = agent.props.model
    }
    if (isSubagentInstance(agent)) {
      if (isCircularReference(agent, child)) {
        throw new Error(
          `Circular subagent reference detected: '${child.name}' is an ancestor of '${agent.name}'. ` +
            `Subagents cannot reference themselves or their ancestors.`,
        )
      }
    }

    const syntheticTool = createSubagentTool(child)
    debug('reconciler', `Subagent tool added: ${child.name}`)
    agent.tools.push(syntheticTool)
    agent.pendingUpdates.push({ type: 'tool_added', tool: syntheticTool })
  }
}

// remove state from a child from an agent-like parent
function uncollectFromChild(agent: AgentLike, child: Instance): void {
  if (isToolInstance(child)) {
    debug('reconciler', `Tool removed: ${child.tool.name}`)
    const index = agent.tools.findIndex((t) => t.name === child.tool.name)
    if (index >= 0) {
      agent.tools.splice(index, 1)
      agent.pendingUpdates.push({
        type: 'tool_removed',
        toolName: child.tool.name,
      })
    }
  } else if (isSdkToolInstance(child)) {
    debug('reconciler', `SDK tool removed: ${child.tool.name}`)
    const index = agent.sdkTools.indexOf(child.tool)
    if (index >= 0) {
      agent.sdkTools.splice(index, 1)
      agent.pendingUpdates.push({
        type: 'sdk_tool_removed',
        toolName: child.tool.name,
      })
    }
  } else if (isSystemInstance(child)) {
    const index = agent.systemParts.findIndex(
      (p) => p.content === child.content && p.priority === child.priority,
    )
    if (index >= 0) {
      agent.systemParts.splice(index, 1)
    }
  } else if (isContextInstance(child)) {
    const index = agent.contextParts.findIndex(
      (p) => p.content === child.content && p.priority === child.priority,
    )
    if (index >= 0) {
      agent.contextParts.splice(index, 1)
    }
  } else if (isMessageInstance(child)) {
    const index = agent.messages.indexOf(child.message)
    if (index >= 0) {
      agent.messages.splice(index, 1)
    }
  } else if (isMCPServerInstance(child)) {
    debug('reconciler', `MCP server removed: ${child.config.name}`)
    const index = agent.mcpServers.findIndex(
      (s) => s.name === child.config.name,
    )
    if (index >= 0) {
      agent.mcpServers.splice(index, 1)
    }
  } else if (isToolsContainerInstance(child)) {
    for (const grandchild of child.children) {
      uncollectFromChild(agent, grandchild)
    }
  } else if (isSubagentInstance(child)) {
    debug('reconciler', `Subagent tool removed: ${child.name}`)
    const index = agent.tools.findIndex((t) => t.name === child.name)
    if (index >= 0) {
      agent.tools.splice(index, 1)
      agent.pendingUpdates.push({ type: 'tool_removed', toolName: child.name })
    }
  }
}

function findParentAgent(instance: Instance): AgentLike | null {
  let current = instance.parent
  while (current) {
    if (isAgentLike(current)) {
      return current
    }
    current = current.parent
  }
  return null
}

function rebuildSystemParts(agent: AgentInstance): void {
  agent.systemParts = []
  for (const child of agent.children) {
    if (isSystemInstance(child)) {
      agent.systemParts.push({
        content: child.content,
        priority: child.priority,
      })
    }
  }
}

function rebuildContextParts(agent: AgentInstance): void {
  agent.contextParts = []
  for (const child of agent.children) {
    if (isContextInstance(child)) {
      agent.contextParts.push({
        content: child.content,
        priority: child.priority,
      })
    }
  }
}

function isCircularReference(
  subagent: SubagentInstance,
  child: SubagentInstance,
): boolean {
  let current: Instance | null = subagent.parent

  while (current) {
    if (current === child) {
      return true
    }
    current = current.parent
  }

  return false
}

let _createSubagentTool: ((subagent: SubagentInstance) => InternalTool) | null =
  null

export function setSubagentToolFactory(
  factory: (subagent: SubagentInstance) => InternalTool,
): void {
  _createSubagentTool = factory
}

function createSubagentTool(subagent: SubagentInstance): InternalTool {
  if (!_createSubagentTool) {
    throw new Error(
      'Subagent tool factory not initialized. This is a framework error - ' +
        'runtime package should call setSubagentToolFactory() on initialization.',
    )
  }
  return _createSubagentTool(subagent)
}
