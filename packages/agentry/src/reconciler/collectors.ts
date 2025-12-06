import type { Instance, AgentInstance } from '../instances'
import {
  isToolInstance,
  isSdkToolInstance,
  isSystemInstance,
  isContextInstance,
  isMessageInstance,
  isMCPServerInstance,
  isToolsContainerInstance,
  isAgentToolInstance,
  isAgentInstance,
  isConditionInstance,
} from '../instances'
import { debug } from '../debug'
import { createAgentSyntheticTool } from '../tools/agentSyntheticTool'

/**
 * Collect a child instance into the parent agent's arrays
 * This populates tools, systemParts, messages, etc.
 */
export function collectChild(agent: AgentInstance, child: Instance): void {
  // prevent direct nesting of agents
  if (isAgentInstance(child) && agent.parent !== null) {
    throw new Error(
      'Cannot nest <Agent> inside another <Agent>. Use <AgentTool> to create subagents.',
    )
  }
  if (isToolInstance(child)) {
    agent.tools.push(child.tool)
    debug('reconciler', `Tool added: ${child.tool.name}`)
  } else if (isSystemInstance(child)) {
    agent.systemParts.push({
      content: child.content,
      cache: child.cache,
    })
  } else if (isContextInstance(child)) {
    agent.systemParts.push({
      content: child.content,
      cache: child.cache,
    })
  } else if (isMessageInstance(child)) {
    // Write directly to store instead of agent.messages
    agent.store.getState().actions.pushMessage(child.message)
  } else if (isSdkToolInstance(child)) {
    agent.sdkTools.push(child.tool)
    debug('reconciler', `SDK tool added: ${child.tool.name}`)
  } else if (isMCPServerInstance(child)) {
    agent.mcpServers.push(child.config)
    debug('reconciler', `MCP server added: ${child.config.name}`)
  } else if (isAgentToolInstance(child)) {
    const tool = createAgentSyntheticTool(child)
    agent.tools.push(tool)
    debug('reconciler', `Agent tool added: ${tool.name}`)
  } else if (isToolsContainerInstance(child)) {
    // recursively collect each child (they'll go through the guard)
    for (const grandchild of child.children) {
      if (isAgentInstance(grandchild)) {
        throw new Error(
          'Cannot place <Agent> directly inside <Tools>. Use <AgentTool> instead to create subagents as tools.',
        )
      }
      collectChild(agent, grandchild)
    }
  } else if (isConditionInstance(child)) {
    // only collect children if condition is active
    if (child.isActive) {
      for (const conditionChild of child.children) {
        collectChild(agent, conditionChild)
      }
    }
  }
}

/**
 * Remove a child instance from the parent agent's arrays
 */
export function uncollectChild(agent: AgentInstance, child: Instance): void {
  if (isToolInstance(child)) {
    const index = agent.tools.findIndex((t) => t.name === child.tool.name)
    if (index >= 0) {
      agent.tools.splice(index, 1)
      debug('reconciler', `Tool removed: ${child.tool.name}`)
    }
  } else if (isSystemInstance(child)) {
    const index = agent.systemParts.findIndex(
      (p) => p.content === child.content,
    )
    if (index >= 0) {
      agent.systemParts.splice(index, 1)
    }
  } else if (isContextInstance(child)) {
    const index = agent.systemParts.findIndex(
      (p) => p.content === child.content,
    )
    if (index >= 0) {
      agent.systemParts.splice(index, 1)
    }
  } else if (isMessageInstance(child)) {
    // Remove from store
    agent.store.getState().actions.removeMessage(child.message)
  } else if (isSdkToolInstance(child)) {
    const index = agent.sdkTools.findIndex((t) => t === child.tool)
    if (index >= 0) {
      agent.sdkTools.splice(index, 1)
      debug('reconciler', `SDK tool removed: ${child.tool.name}`)
    }
  } else if (isMCPServerInstance(child)) {
    const index = agent.mcpServers.findIndex(
      (s) => s.name === child.config.name,
    )
    if (index >= 0) {
      agent.mcpServers.splice(index, 1)
      debug('reconciler', `MCP server removed: ${child.config.name}`)
    }
  } else if (isAgentToolInstance(child)) {
    const index = agent.tools.findIndex((t) => t.name === child.name)
    if (index >= 0) {
      agent.tools.splice(index, 1)
      debug('reconciler', `Agent tool removed: ${child.name}`)
    }
  } else if (isToolsContainerInstance(child)) {
    // recursively uncollect each child
    for (const grandchild of child.children) {
      uncollectChild(agent, grandchild)
    }
  } else if (isConditionInstance(child)) {
    // uncollect all children regardless of active state
    // (called when condition is being removed from tree)
    for (const conditionChild of child.children) {
      uncollectChild(agent, conditionChild)
    }
  }
}
