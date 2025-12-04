import type { Instance, AgentInstance } from '../instances/index.ts'
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
} from '../instances/index.ts'
import { debug } from '../debug.ts'
import { createAgentSyntheticTool } from '../tools/agentSyntheticTool.ts'

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
    })
  } else if (isContextInstance(child)) {
    agent.systemParts.push({
      content: child.content,
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
    // Handle tools container - process its children for collection
    // (children are already in the tree, we just need to collect them)
    for (const grandchild of child.children) {
      // Process grandchild for collection without adding to tree again
      if (isToolInstance(grandchild)) {
        agent.tools.push(grandchild.tool)
        debug('reconciler', `Tool added: ${grandchild.tool.name}`)
      } else if (isSdkToolInstance(grandchild)) {
        agent.sdkTools.push(grandchild.tool)
        debug('reconciler', `SDK tool added: ${grandchild.tool.name}`)
      } else if (isMCPServerInstance(grandchild)) {
        agent.mcpServers.push(grandchild.config)
        debug('reconciler', `MCP server added: ${grandchild.config.name}`)
      } else if (isAgentToolInstance(grandchild)) {
        const tool = createAgentSyntheticTool(grandchild)
        agent.tools.push(tool)
        debug('reconciler', `Agent tool added: ${tool.name}`)
      } else if (isAgentInstance(grandchild)) {
        throw new Error(
          'Cannot place <Agent> directly inside <Tools>. Use <AgentTool> instead to create subagents as tools.',
        )
      } else {
        throw new Error(`Unknown child of <Tools/>: ${grandchild.type}`)
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
    // Remove all grandchildren from agent arrays
    for (const grandchild of child.children) {
      if (isToolInstance(grandchild)) {
        const index = agent.tools.findIndex(
          (t) => t.name === grandchild.tool.name,
        )
        if (index >= 0) {
          agent.tools.splice(index, 1)
          debug('reconciler', `Tool removed: ${grandchild.tool.name}`)
        }
      } else if (isSdkToolInstance(grandchild)) {
        const index = agent.sdkTools.findIndex((t) => t === grandchild.tool)
        if (index >= 0) {
          agent.sdkTools.splice(index, 1)
          debug('reconciler', `SDK tool removed: ${grandchild.tool.name}`)
        }
      } else if (isMCPServerInstance(grandchild)) {
        const index = agent.mcpServers.findIndex(
          (s) => s.name === grandchild.config.name,
        )
        if (index >= 0) {
          agent.mcpServers.splice(index, 1)
          debug('reconciler', `MCP server removed: ${grandchild.config.name}`)
        }
      } else if (isAgentToolInstance(grandchild)) {
        const index = agent.tools.findIndex((t) => t.name === grandchild.name)
        if (index >= 0) {
          agent.tools.splice(index, 1)
          debug('reconciler', `Agent tool removed: ${grandchild.name}`)
        }
      }
    }
  }
}
