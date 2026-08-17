import type { Instance, AgentInstance } from '../instances'
import type { InternalTool } from '../types'
import {
  isToolInstance,
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
 * Registers a tool under its name.
 *
 * Two tools sharing a name is a bug — the model would see an ambiguous schema —
 * but throwing here happens inside React's commit phase, where the error
 * surfaces as an unrelated downstream failure. So this warns and keeps the last
 * registration; the engine rejects duplicates at the turn boundary, where the
 * error is legible.
 */
/**
 * Drops one outstanding duplicate registration for `name`.
 * Returns true when one was outstanding, meaning the tool must survive.
 */
function releaseDuplicate(agent: AgentInstance, name: string): boolean {
  const outstanding = agent.duplicateToolNames.get(name)
  if (!outstanding) return false
  if (outstanding <= 1) agent.duplicateToolNames.delete(name)
  else agent.duplicateToolNames.set(name, outstanding - 1)
  return true
}

function registerTool(agent: AgentInstance, tool: InternalTool): void {
  const existing = agent.tools.get(tool.name)
  if (existing && existing !== tool) {
    // Counted, not a flag: a tool relocated between containers registers before
    // the old position is uncollected, and a one-way Set left the name marked
    // duplicate forever — aborting every later turn, and every later
    // sendMessage, with a duplicate that no longer exists.
    agent.duplicateToolNames.set(
      tool.name,
      (agent.duplicateToolNames.get(tool.name) ?? 0) + 1,
    )
  }
  agent.tools.set(tool.name, tool)
  debug('reconciler', `Tool added: ${tool.name}`)
}

/**
 * Collect a child instance into the parent agent's arrays
 * This populates tools, systemParts, messages, etc.
 */
export function collectChild(
  agent: AgentInstance,
  child: Instance,
  options: CollectOptions = {},
): void {
  // prevent direct nesting of agents
  if (isAgentInstance(child) && agent.parent !== null) {
    throw new Error(
      'Cannot nest <Agent> inside another <Agent>. Use <AgentTool> to create subagents.',
    )
  }
  if (isToolInstance(child)) {
    registerTool(agent, child.tool)
  } else if (isSystemInstance(child)) {
    agent.systemParts.push({ content: child.content })
  } else if (isContextInstance(child)) {
    agent.systemParts.push({ content: child.content })
  } else if (isMessageInstance(child)) {
    // Messages are appended to a transcript, not rebuilt from the tree, so a
    // re-collect must not push them again. The engine skips them at the top
    // level; without threading that through, a <Message> inside a <Condition>
    // was re-pushed every time ANY condition in the tree changed.
    if (options.skipMessages) return
    // Write directly to store instead of agent.messages
    agent.store.getState().actions.pushMessage(child.message)
  } else if (isMCPServerInstance(child)) {
    agent.mcpServers.push(child.config)
    debug('reconciler', `MCP server added: ${child.config.name}`)
  } else if (isAgentToolInstance(child)) {
    registerTool(agent, createAgentSyntheticTool(child))
  } else if (isToolsContainerInstance(child)) {
    // recursively collect each child (they'll go through the guard)
    for (const grandchild of child.children) {
      if (isAgentInstance(grandchild)) {
        throw new Error(
          'Cannot place <Agent> directly inside <Tools>. Use <AgentTool> instead to create subagents as tools.',
        )
      }
      collectChild(agent, grandchild, options)
    }
  } else if (isConditionInstance(child)) {
    // only collect children if condition is active
    if (child.isActive) {
      for (const conditionChild of child.children) {
        collectChild(agent, conditionChild, options)
      }
    }
  }
}

/**
 * Remove a child instance from the parent agent's arrays
 */
export interface CollectOptions {
  /** Set when re-collecting an existing tree, so messages are not re-pushed. */
  skipMessages?: boolean
}

/**
 * Rebuilds `agent.systemParts` from the tree.
 *
 * Must mirror `collectChild`'s traversal exactly — recursing into `<Tools>` and
 * into active `<Condition>`s — or an update-driven rebuild silently drops every
 * nested `<System>`/`<Context>` that the original collection pass had included.
 * Order matters too: it has to match collect order, or the prompt reorders
 * between a rebuild and a condition-driven recollect.
 */
export function rebuildSystemParts(agent: AgentInstance): void {
  agent.systemParts.length = 0
  collectSystemPartsFrom(agent, agent.children)
}

function collectSystemPartsFrom(
  agent: AgentInstance,
  children: readonly Instance[],
): void {
  for (const child of children) {
    if (isSystemInstance(child) || isContextInstance(child)) {
      agent.systemParts.push({ content: child.content })
    } else if (isToolsContainerInstance(child)) {
      collectSystemPartsFrom(agent, child.children)
    } else if (isConditionInstance(child) && child.isActive) {
      collectSystemPartsFrom(agent, child.children)
    }
  }
}

export function uncollectChild(agent: AgentInstance, child: Instance): void {
  if (isToolInstance(child)) {
    if (releaseDuplicate(agent, child.tool.name)) {
      // Another registration is still live under this name — the map entry
      // belongs to it, so leave it in place.
      return
    }
    if (agent.tools.delete(child.tool.name)) {
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
  } else if (isMCPServerInstance(child)) {
    const index = agent.mcpServers.findIndex(
      (server) => server.name === child.config.name,
    )
    if (index >= 0) {
      agent.mcpServers.splice(index, 1)
      debug('reconciler', `MCP server removed: ${child.config.name}`)
    }
  } else if (isAgentToolInstance(child)) {
    if (agent.tools.delete(child.name)) {
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
