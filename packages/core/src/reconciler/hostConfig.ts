import type { HostConfig } from 'react-reconciler';
import {
  type Instance,
  type AgentInstance,
  type SubagentInstance,
  isAgentInstance,
  isSubagentInstance,
  isToolInstance,
  isSdkToolInstance,
  isSystemInstance,
  isContextInstance,
  isMessageInstance,
  isToolsContainerInstance,
} from '../instances/index.ts';
import { createInstance, type ElementType, type ElementProps } from '../instances/index.ts';
import type { InternalTool, CompactionControl, Model } from '../types/index.ts';
import { debug } from '../debug.ts';

// settings that propagate down the tree via HostContext
interface PropagatedSettings {
  stream?: boolean;
  temperature?: number;
  stopSequences?: string[];
  compactionControl?: CompactionControl;
  maxTokens?: number;
  maxIterations?: number;
  insideAgent?: boolean; // track if we're nested inside an agent
  model?: Model; // model to inherit for subagents
}

// the host config implementation
export const hostConfig: HostConfig<
  ElementType,
  ElementProps,
  AgentInstance,
  Instance,
  null,
  never,
  never,
  never,
  Instance,
  PropagatedSettings,
  never,
  ReturnType<typeof setTimeout>,
  -1,
  never
> = {
  // mode
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,

  // scheduling
  isPrimaryRenderer: false,
  warnsIfNotActing: false,
  noTimeout: -1 as const,

  // newer reconciler requirements - not used but required by interface
  NotPendingTransition: null as never,
  // @ts-expect-error - not implementing transition context
  HostTransitionContext: null,

  setCurrentUpdatePriority(_newPriority: number): void {
    // no-op for now
  },

  getCurrentUpdatePriority(): number {
    return 16; // DefaultEventPriority
  },

  resolveUpdatePriority(): number {
    return 16; // DefaultEventPriority
  },

  resetFormInstance(_form: unknown): void {
    // no-op
  },

  requestPostPaintCallback(_callback: (time: number) => void): void {
    // no-op
  },

  shouldAttemptEagerTransition(): boolean {
    return false;
  },

  trackSchedulerEvent(): void {
    // no-op
  },

  resolveEventType(): null | string {
    return null;
  },

  resolveEventTimeStamp(): number {
    return Date.now();
  },

  maySuspendCommit(_type: ElementType, _props: ElementProps): boolean {
    return false;
  },

  preloadInstance(_type: ElementType, _props: ElementProps): boolean {
    return false;
  },

  startSuspendingCommit(): void {
    // no-op
  },

  suspendInstance(_type: ElementType, _props: ElementProps): void {
    // no-op
  },

  waitForCommitToBeReady(): null {
    return null;
  },

  // instance creation
  createInstance(
    type: ElementType,
    props: ElementProps,
    rootContainer: AgentInstance,
    hostContext: PropagatedSettings,
    _internalHandle: unknown,
  ): Instance {
    return createInstance(type, props, rootContainer, hostContext);
  },

  createTextInstance(
    _text: string,
    _rootContainer: AgentInstance,
    _hostContext: PropagatedSettings,
    _internalHandle: unknown,
  ): null {
    // we don't support raw text nodes
    return null;
  },

  appendInitialChild(parentInstance: Instance, child: Instance): void {
    // guard against null children (from createTextInstance)
    if (child === null) return;
    appendChild(parentInstance, child);
  },

  finalizeInitialChildren(
    _instance: Instance,
    _type: ElementType,
    _props: ElementProps,
    _rootContainer: AgentInstance,
    _hostContext: PropagatedSettings,
  ): boolean {
    return false;
  },

  prepareUpdate(
    _instance: Instance,
    _type: ElementType,
    oldProps: ElementProps,
    newProps: ElementProps,
    _rootContainer: AgentInstance,
    _hostContext: PropagatedSettings,
  ): Partial<ElementProps> | null {
    // check if props changed
    const updatePayload: Partial<ElementProps> = {};
    let hasChanges = false;

    for (const key of Object.keys(newProps) as (keyof ElementProps)[]) {
      if (key === 'children') continue;
      if (oldProps[key] !== newProps[key]) {
        (updatePayload as Record<string, unknown>)[key] = newProps[key];
        hasChanges = true;
      }
    }

    return hasChanges ? updatePayload : null;
  },

  shouldSetTextContent(_type: ElementType, _props: ElementProps): boolean {
    return false;
  },

  getRootHostContext(rootContainer: AgentInstance): PropagatedSettings {
    // root agent's settings become the initial context
    return {
      stream: rootContainer.props.stream,
      temperature: rootContainer.props.temperature,
      stopSequences: rootContainer.props.stopSequences,
      compactionControl: rootContainer.props.compactionControl,
      maxTokens: rootContainer.props.maxTokens,
      maxIterations: rootContainer.props.maxIterations,
      insideAgent: false, // root level, not inside an agent yet
      model: rootContainer.props.model, // propagate model for subagents
    };
  },

  getChildHostContext(
    parentHostContext: PropagatedSettings,
    type: ElementType,
    _rootContainer: AgentInstance,
  ): PropagatedSettings {
    // when entering an agent element, mark that we're inside an agent
    if (type === 'agent') {
      return { ...parentHostContext, insideAgent: true };
    }
    // propagate parent's settings down the tree
    return parentHostContext;
  },

  getPublicInstance(instance: Instance): Instance {
    return instance;
  },

  prepareForCommit(_containerInfo: AgentInstance): Record<string, unknown> | null {
    return null;
  },

  resetAfterCommit(_containerInfo: AgentInstance): void {
    // no-op
  },

  preparePortalMount(_containerInfo: AgentInstance): void {
    // no-op
  },

  scheduleTimeout(
    fn: (...args: unknown[]) => unknown,
    delay?: number,
  ): ReturnType<typeof setTimeout> {
    return setTimeout(fn, delay);
  },

  cancelTimeout(id: ReturnType<typeof setTimeout>): void {
    clearTimeout(id);
  },

  getCurrentEventPriority(): number {
    return 16; // DefaultEventPriority
  },

  // @ts-expect-error - not implementing node -> fiber mapping
  getInstanceFromNode(_node: unknown): unknown {
    return undefined;
  },

  beforeActiveInstanceBlur(): void {
    // no-op
  },

  afterActiveInstanceBlur(): void {
    // no-op
  },

  prepareScopeUpdate(_scopeInstance: unknown, _instance: unknown): void {
    // no-op
  },

  getInstanceFromScope(_scopeInstance: unknown): Instance | null {
    return null;
  },

  detachDeletedInstance(_node: Instance): void {
    // no-op
  },

  // mutation methods
  appendChild(parentInstance: Instance, child: Instance): void {
    // guard against null children
    if (child === null) return;
    appendChild(parentInstance, child);
  },

  appendChildToContainer(container: AgentInstance, child: Instance): void {
    appendChild(container, child);
  },

  insertBefore(
    parentInstance: Instance,
    child: Instance,
    beforeChild: Instance,
  ): void {
    // guard against null children
    if (child === null) return;
    insertBefore(parentInstance, child, beforeChild);
  },

  insertInContainerBefore(
    container: AgentInstance,
    child: Instance,
    beforeChild: Instance,
  ): void {
    insertBefore(container, child, beforeChild);
  },

  removeChild(parentInstance: Instance, child: Instance): void {
    // guard against null children
    if (child === null) return;
    removeChild(parentInstance, child);
  },

  removeChildFromContainer(container: AgentInstance, child: Instance): void {
    removeChild(container, child);
  },

  resetTextContent(_instance: Instance): void {
    // no-op
  },

  commitTextUpdate(
    _textInstance: null,
    _oldText: string,
    _newText: string,
  ): void {
    // no-op
  },

  commitMount(
    _instance: Instance,
    _type: ElementType,
    _props: ElementProps,
    _internalInstanceHandle: unknown,
  ): void {
    // no-op
  },

  commitUpdate(
    instance: Instance,
    _type: ElementType,
    _prevProps: ElementProps,
    nextProps: ElementProps,
    _internalHandle: unknown,
  ): void {
    // compute what changed
    const updatePayload: Partial<ElementProps> = {};
    for (const key of Object.keys(nextProps) as (keyof ElementProps)[]) {
      if (key === 'children') continue;
      if (_prevProps[key] !== nextProps[key]) {
        (updatePayload as Record<string, unknown>)[key] = nextProps[key];
      }
    }
    if (Object.keys(updatePayload).length > 0) {
      commitUpdate(instance, updatePayload);
    }
  },

  hideInstance(_instance: Instance): void {
    // no-op
  },

  hideTextInstance(_textInstance: null): void {
    // no-op
  },

  unhideInstance(_instance: Instance, _props: ElementProps): void {
    // no-op
  },

  unhideTextInstance(_textInstance: null, _text: string): void {
    // no-op
  },

  clearContainer(_container: AgentInstance): void {
    // clear all children from container
    if (isAgentInstance(_container)) {
      _container.children = [];
      _container.systemParts = [];
      _container.tools = [];
      _container.sdkTools = [];
      _container.contextParts = [];
      _container.messages = [];
    }
  },
};

// helper functions for tree manipulation

function appendChild(parent: Instance, child: Instance): void {
  child.parent = parent;

  if (isAgentInstance(parent)) {
    parent.children.push(child);
    collectFromChild(parent, child);
  } else if (isSubagentInstance(parent)) {
    parent.children.push(child);
    collectFromChildForSubagent(parent, child);
  } else if (isToolsContainerInstance(parent)) {
    parent.children.push(child);
    // propagate to parent agent (could be AgentInstance or SubagentInstance)
    const agent = findParentAgent(parent);
    if (agent && isAgentInstance(agent)) {
      collectFromChild(agent, child);
    } else if (agent && isSubagentInstance(agent)) {
      collectFromChildForSubagent(agent, child);
    }
  }
}

function insertBefore(parent: Instance, child: Instance, beforeChild: Instance): void {
  child.parent = parent;

  if (isAgentInstance(parent)) {
    const index = parent.children.indexOf(beforeChild);
    if (index >= 0) {
      parent.children.splice(index, 0, child);
    } else {
      parent.children.push(child);
    }
    collectFromChild(parent, child);
  } else if (isSubagentInstance(parent)) {
    const index = parent.children.indexOf(beforeChild);
    if (index >= 0) {
      parent.children.splice(index, 0, child);
    } else {
      parent.children.push(child);
    }
    collectFromChildForSubagent(parent, child);
  } else if (isToolsContainerInstance(parent)) {
    const index = parent.children.indexOf(beforeChild);
    if (index >= 0) {
      parent.children.splice(index, 0, child);
    } else {
      parent.children.push(child);
    }
    const agent = findParentAgent(parent);
    if (agent && isAgentInstance(agent)) {
      collectFromChild(agent, child);
    } else if (agent && isSubagentInstance(agent)) {
      collectFromChildForSubagent(agent, child);
    }
  }
}

function removeChild(parent: Instance, child: Instance): void {
  child.parent = null;

  if (isAgentInstance(parent)) {
    const index = parent.children.indexOf(child);
    if (index >= 0) {
      parent.children.splice(index, 1);
    }
    uncollectFromChild(parent, child);
  } else if (isSubagentInstance(parent)) {
    const index = parent.children.indexOf(child);
    if (index >= 0) {
      parent.children.splice(index, 1);
    }
    uncollectFromChildForSubagent(parent, child);
  } else if (isToolsContainerInstance(parent)) {
    const index = parent.children.indexOf(child);
    if (index >= 0) {
      parent.children.splice(index, 1);
    }
    const agent = findParentAgent(parent);
    if (agent && isAgentInstance(agent)) {
      uncollectFromChild(agent, child);
    } else if (agent && isSubagentInstance(agent)) {
      uncollectFromChildForSubagent(agent, child);
    }
  }
}

function commitUpdate(instance: Instance, updatePayload: Partial<ElementProps>): void {
  // prevent infinite update loops
  if (isAgentInstance(instance) && instance._updating) {
    return;
  }

  if (isAgentInstance(instance)) {
    instance._updating = true;
    try {
      // update agent props
      Object.assign(instance.props, updatePayload);
    } finally {
      instance._updating = false;
    }
  } else if (isSystemInstance(instance)) {
    const payload = updatePayload as { children?: string; priority?: number };
    if (payload.children !== undefined) {
      instance.content = payload.children;
    }
    if (payload.priority !== undefined) {
      instance.priority = payload.priority;
    }
    // update parent agent's system parts
    const agent = findParentAgent(instance);
    if (agent && isAgentInstance(agent)) {
      rebuildSystemParts(agent);
    }
  } else if (isContextInstance(instance)) {
    const payload = updatePayload as { children?: string; priority?: number };
    if (payload.children !== undefined) {
      instance.content = payload.children;
    }
    if (payload.priority !== undefined) {
      instance.priority = payload.priority;
    }
    const agent = findParentAgent(instance);
    if (agent && isAgentInstance(agent)) {
      rebuildContextParts(agent);
    }
  } else if (isToolInstance(instance)) {
    const payload = updatePayload as { tool?: typeof instance.tool };
    if (payload.tool !== undefined) {
      const agent = findParentAgent(instance);
      if (agent && isAgentInstance(agent)) {
        // remove old tool, add new
        const oldIndex = agent.tools.findIndex((t) => t.name === instance.tool.name);
        if (oldIndex >= 0) {
          agent.tools.splice(oldIndex, 1);
        }
        instance.tool = payload.tool;
        agent.tools.push(payload.tool);
      }
    }
  }
}

// collect state from a child into the agent
function collectFromChild(agent: AgentInstance, child: Instance): void {
  if (isToolInstance(child)) {
    debug('reconciler', `Tool added: ${child.tool.name}`);
    agent.tools.push(child.tool);
  } else if (isSdkToolInstance(child)) {
    debug('reconciler', `SDK tool added: ${'name' in child.tool ? child.tool.name : child.tool.type}`);
    agent.sdkTools.push(child.tool);
  } else if (isSystemInstance(child)) {
    agent.systemParts.push({ content: child.content, priority: child.priority });
  } else if (isContextInstance(child)) {
    agent.contextParts.push({ content: child.content, priority: child.priority });
  } else if (isMessageInstance(child)) {
    agent.messages.push(child.message);
  } else if (isToolsContainerInstance(child)) {
    // collect from tools container children
    for (const grandchild of child.children) {
      collectFromChild(agent, grandchild);
    }
  } else if (isSubagentInstance(child)) {
    // Inherit model from parent agent (this overrides the host context default)
    // The parent agent's model is the correct one to inherit
    if (agent.props.model) {
      child.props.model = agent.props.model;
    }
    // auto-generate a tool from the subagent
    const syntheticTool = createSubagentTool(child, agent);
    debug('reconciler', `Subagent tool added: ${child.name}`);
    agent.tools.push(syntheticTool);
  }
}

// remove state from a child from the agent
function uncollectFromChild(agent: AgentInstance, child: Instance): void {
  if (isToolInstance(child)) {
    debug('reconciler', `Tool removed: ${child.tool.name}`);
    const index = agent.tools.findIndex((t) => t.name === child.tool.name);
    if (index >= 0) {
      agent.tools.splice(index, 1);
    }
  } else if (isSdkToolInstance(child)) {
    debug('reconciler', `SDK tool removed: ${'name' in child.tool ? child.tool.name : child.tool.type}`);
    const index = agent.sdkTools.indexOf(child.tool);
    if (index >= 0) {
      agent.sdkTools.splice(index, 1);
    }
  } else if (isSystemInstance(child)) {
    const index = agent.systemParts.findIndex(
      (p) => p.content === child.content && p.priority === child.priority,
    );
    if (index >= 0) {
      agent.systemParts.splice(index, 1);
    }
  } else if (isContextInstance(child)) {
    const index = agent.contextParts.findIndex(
      (p) => p.content === child.content && p.priority === child.priority,
    );
    if (index >= 0) {
      agent.contextParts.splice(index, 1);
    }
  } else if (isMessageInstance(child)) {
    const index = agent.messages.indexOf(child.message);
    if (index >= 0) {
      agent.messages.splice(index, 1);
    }
  } else if (isToolsContainerInstance(child)) {
    for (const grandchild of child.children) {
      uncollectFromChild(agent, grandchild);
    }
  } else if (isSubagentInstance(child)) {
    debug('reconciler', `Subagent tool removed: ${child.name}`);
    const index = agent.tools.findIndex((t) => t.name === child.name);
    if (index >= 0) {
      agent.tools.splice(index, 1);
    }
  }
}

// find the parent agent of an instance (could be AgentInstance or SubagentInstance)
function findParentAgent(instance: Instance): AgentInstance | SubagentInstance | null {
  let current = instance.parent;
  while (current) {
    if (isAgentInstance(current) || isSubagentInstance(current)) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

// rebuild system parts from children
function rebuildSystemParts(agent: AgentInstance): void {
  agent.systemParts = [];
  for (const child of agent.children) {
    if (isSystemInstance(child)) {
      agent.systemParts.push({ content: child.content, priority: child.priority });
    }
  }
}

// rebuild context parts from children
function rebuildContextParts(agent: AgentInstance): void {
  agent.contextParts = [];
  for (const child of agent.children) {
    if (isContextInstance(child)) {
      agent.contextParts.push({ content: child.content, priority: child.priority });
    }
  }
}

// collect state from a child into a subagent (similar to collectFromChild but for subagents)
function collectFromChildForSubagent(subagent: SubagentInstance, child: Instance): void {
  if (isToolInstance(child)) {
    subagent.tools.push(child.tool);
  } else if (isSdkToolInstance(child)) {
    subagent.sdkTools.push(child.tool);
  } else if (isSystemInstance(child)) {
    subagent.systemParts.push({ content: child.content, priority: child.priority });
  } else if (isContextInstance(child)) {
    subagent.contextParts.push({ content: child.content, priority: child.priority });
  } else if (isMessageInstance(child)) {
    subagent.messages.push(child.message);
  } else if (isToolsContainerInstance(child)) {
    for (const grandchild of child.children) {
      collectFromChildForSubagent(subagent, grandchild);
    }
  } else if (isSubagentInstance(child)) {
    // prevent circular reference
    if (isCircularReference(subagent, child)) {
      throw new Error(
        `Circular subagent reference detected: '${child.name}' is an ancestor of '${subagent.name}'. ` +
        `Subagents cannot reference themselves or their ancestors.`,
      );
    }
    const nestedTool = createSubagentTool(child, subagent);
    subagent.tools.push(nestedTool);
  }
}

// remove state from a child from a subagent
function uncollectFromChildForSubagent(subagent: SubagentInstance, child: Instance): void {
  if (isToolInstance(child)) {
    const index = subagent.tools.findIndex((t) => t.name === child.tool.name);
    if (index >= 0) {
      subagent.tools.splice(index, 1);
    }
  } else if (isSdkToolInstance(child)) {
    const index = subagent.sdkTools.indexOf(child.tool);
    if (index >= 0) {
      subagent.sdkTools.splice(index, 1);
    }
  } else if (isSystemInstance(child)) {
    const index = subagent.systemParts.findIndex(
      (p) => p.content === child.content && p.priority === child.priority,
    );
    if (index >= 0) {
      subagent.systemParts.splice(index, 1);
    }
  } else if (isContextInstance(child)) {
    const index = subagent.contextParts.findIndex(
      (p) => p.content === child.content && p.priority === child.priority,
    );
    if (index >= 0) {
      subagent.contextParts.splice(index, 1);
    }
  } else if (isMessageInstance(child)) {
    const index = subagent.messages.indexOf(child.message);
    if (index >= 0) {
      subagent.messages.splice(index, 1);
    }
  } else if (isToolsContainerInstance(child)) {
    for (const grandchild of child.children) {
      uncollectFromChildForSubagent(subagent, grandchild);
    }
  } else if (isSubagentInstance(child)) {
    const index = subagent.tools.findIndex((t) => t.name === child.name);
    if (index >= 0) {
      subagent.tools.splice(index, 1);
    }
  }
}

// check if child is an ancestor of subagent (circular reference)
function isCircularReference(subagent: SubagentInstance, child: SubagentInstance): boolean {
  const ancestorNames = new Set<string>();
  let current: Instance | null = subagent.parent;

  while (current) {
    if (isSubagentInstance(current) || isAgentInstance(current)) {
      if ('name' in current && current.name) {
        ancestorNames.add(current.name);
      }
    }
    current = current.parent;
  }

  return ancestorNames.has(child.name);
}

// reference to createSubagentTool - set by runtime package to avoid circular dependency
let _createSubagentTool: ((subagent: SubagentInstance, parent: AgentInstance | SubagentInstance) => InternalTool) | null = null;

export function setSubagentToolFactory(
  factory: (subagent: SubagentInstance, parent: AgentInstance | SubagentInstance) => InternalTool,
): void {
  _createSubagentTool = factory;
}

function createSubagentTool(
  subagent: SubagentInstance,
  parentAgent: AgentInstance | SubagentInstance,
): InternalTool {
  if (!_createSubagentTool) {
    throw new Error(
      'Subagent tool factory not initialized. This is a framework error - ' +
      'runtime package should call setSubagentToolFactory() on initialization.',
    );
  }
  return _createSubagentTool(subagent, parentAgent);
}
