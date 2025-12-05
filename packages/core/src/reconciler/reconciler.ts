import { createContext } from 'react'
import ReactReconciler from 'react-reconciler'
import {
  type Instance,
  type AgentInstance,
  type AgentLike,
  type RouteInstance,
  isAgentInstance,
  isSubagentInstance,
  isAgentLike,
  isToolsContainerInstance,
  isSystemInstance,
  isContextInstance,
  isToolInstance,
  isRouterInstance,
  isRouteInstance,
} from '../instances/index.ts'
import {
  createInstance,
  type ElementType,
  type ElementProps,
} from '../instances/index.ts'
import type { AgentProps, CompactionControl, Model } from '../types/index.ts'
import { debug } from '../debug.ts'
import { diffProps, disposeOnIdle } from './utils.ts'
import { collectChild, uncollectChild } from './collectors.ts'

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
  model?: Model
  thinking?: AgentProps['thinking']
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
      model: rootContainer.props.model,
      thinking: rootContainer.props.thinking,
    }
  },
  getChildHostContext(parentHostContext) {
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
  clearContainer() {},
})

function getEffectiveAgent(parent: Instance): AgentLike | null {
  if (isAgentLike(parent)) {
    return parent
  }
  if (isToolsContainerInstance(parent)) {
    return findParentAgent(parent)
  }
  return null
}

function addChildToArray(parent: Instance, child: Instance): void {
  if (isAgentLike(parent)) {
    parent.children.push(child)
  } else if (isToolsContainerInstance(parent)) {
    parent.children.push(child)
  } else if (isRouterInstance(parent)) {
    parent.children.push(child as RouteInstance)
  } else if (isRouteInstance(parent)) {
    parent.children.push(child)
  }
}

function insertChildInArray(
  parent: Instance,
  child: Instance,
  beforeChild: Instance,
): void {
  let children: Instance[]
  if (isAgentLike(parent)) {
    children = parent.children
  } else if (isToolsContainerInstance(parent)) {
    children = parent.children
  } else if (isRouterInstance(parent)) {
    children = parent.children
  } else if (isRouteInstance(parent)) {
    children = parent.children
  } else {
    return
  }

  const index = children.indexOf(beforeChild)
  if (index >= 0) {
    children.splice(index, 0, child)
  } else {
    children.push(child)
  }
}

function removeChildFromArray(parent: Instance, child: Instance): void {
  let children: Instance[]
  if (isAgentLike(parent)) {
    children = parent.children
  } else if (isToolsContainerInstance(parent)) {
    children = parent.children
  } else if (isRouterInstance(parent)) {
    children = parent.children
  } else if (isRouteInstance(parent)) {
    children = parent.children
  } else {
    return
  }

  const index = children.indexOf(child)
  if (index >= 0) {
    children.splice(index, 1)
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

function appendChild(parent: Instance, child: Instance): void {
  child.parent = parent
  addChildToArray(parent, child)

  const agent = getEffectiveAgent(parent)
  if (agent && isAgentInstance(agent)) {
    debug(
      'reconciler',
      `appendChild: Adding child to ${agent.props.name}, child type: ${child.type}`,
    )
    collectChild(agent, child)
  }
}

function insertBefore(
  parent: Instance,
  child: Instance,
  beforeChild: Instance,
): void {
  child.parent = parent
  insertChildInArray(parent, child, beforeChild)

  const agent = getEffectiveAgent(parent)
  if (agent && isAgentInstance(agent)) {
    debug(
      'reconciler',
      `insertBefore: Adding child to ${agent.props.name ?? 'unnamed agent'}, child type: ${child.type}`,
    )
    collectChild(agent, child)
  }
}

function removeChild(parent: Instance, child: Instance): void {
  child.parent = null
  removeChildFromArray(parent, child)

  const agent = getEffectiveAgent(parent)
  if (agent && isAgentInstance(agent)) {
    uncollectChild(agent, child)
  }

  disposeOnIdle(() => {
    if (isSubagentInstance(child)) {
      child.tools = []
      child.sdkTools = []
      child.systemParts = []
      child.mcpServers = []
      child.children = []
    }
  })
}

function rebuildSystemPrompt(agent: AgentInstance): void {
  const parts = agent.systemParts
  parts.length = 0

  for (const child of agent.children) {
    if (isSystemInstance(child) || isContextInstance(child)) {
      parts.push({
        content: child.content,
        cache: child.cache,
      })
    }
  }
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
      debug(
        'reconciler',
        `Model changed from ${instance.props.model} to ${updatePayload.model} - will take effect on next execution`,
      )
    }

    Object.assign(instance.props, updatePayload)
  } else if (isSystemInstance(instance)) {
    const payload = updatePayload as { children?: string }
    if (payload.children !== undefined) {
      instance.content = payload.children
    }
    const agent = findParentAgent(instance)
    if (agent && isAgentInstance(agent)) {
      rebuildSystemPrompt(agent)
    }
  } else if (isContextInstance(instance)) {
    const payload = updatePayload as { children?: string }
    if (payload.children !== undefined) {
      instance.content = payload.children
    }
    const agent = findParentAgent(instance)
    if (agent && isAgentInstance(agent)) {
      rebuildSystemPrompt(agent)
    }
  } else if (isToolInstance(instance)) {
    const payload = updatePayload as { tool?: typeof instance.tool }
    if (payload.tool !== undefined) {
      const agent = findParentAgent(instance)
      if (agent && isAgentLike(agent)) {
        const toolName = instance.tool.name
        const index = agent.tools.findIndex((t) => t.name === toolName)
        if (index >= 0) {
          agent.tools.splice(index, 1)
        }
        instance.tool = payload.tool
        agent.tools.push(payload.tool)
      }
    }
  }
}
