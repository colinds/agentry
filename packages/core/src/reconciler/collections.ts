import type { Instance, AgentLike } from '../instances/index.ts'
import {
  isToolInstance,
  isSdkToolInstance,
  isSystemInstance,
  isContextInstance,
  isMessageInstance,
  isMCPServerInstance,
  isToolsContainerInstance,
  isSubagentInstance,
  isAgentInstance,
} from '../instances/index.ts'
import { debug } from '../debug.ts'
import { isCircularReference } from './utils.ts'
import { createSubagentTool } from '../tools/subagentTool.ts'

export interface ChildCollectionHandler {
  add(agent: AgentLike, child: Instance): void
  remove(agent: AgentLike, child: Instance): void
}

function createArrayHandler<TItem, TChild extends Instance>(options: {
  getArray: (agent: AgentLike) => TItem[]
  extractItem: (child: TChild) => TItem
  matchItem: (item: TItem, child: TChild) => boolean
  typeGuard: (child: Instance) => child is TChild
  onAdd?: (child: TChild) => string
  onRemove?: (child: TChild) => string
}): ChildCollectionHandler {
  return {
    add(agent, child) {
      if (!options.typeGuard(child)) return

      const item = options.extractItem(child)
      const array = options.getArray(agent)

      if (options.onAdd) {
        debug('reconciler', options.onAdd(child))
      }

      array.push(item)
    },
    remove(agent, child) {
      if (!options.typeGuard(child)) return

      const array = options.getArray(agent)
      const index = array.findIndex((item) => options.matchItem(item, child))

      if (index >= 0) {
        const item = array[index]!
        if (options.onRemove) {
          debug('reconciler', options.onRemove(child))
        }

        array.splice(index, 1)
      }
    },
  }
}

function createToolsContainerHandler(
  collectFromChild: (agent: AgentLike, child: Instance) => void,
  uncollectFromChild: (agent: AgentLike, child: Instance) => void,
): ChildCollectionHandler {
  return {
    add(agent, child) {
      if (!isToolsContainerInstance(child)) return
      for (const grandchild of child.children) {
        collectFromChild(agent, grandchild)
      }
    },
    remove(agent, child) {
      if (!isToolsContainerInstance(child)) return
      for (const grandchild of child.children) {
        uncollectFromChild(agent, grandchild)
      }
    },
  }
}

function createSubagentHandler(): ChildCollectionHandler {
  return {
    add(agent, subagent) {
      if (!isSubagentInstance(subagent)) return

      if (isAgentInstance(agent) && agent.props.model) {
        subagent.props.model = agent.props.model
      }

      if (isSubagentInstance(agent)) {
        if (isCircularReference(agent, subagent)) {
          throw new Error(
            `Circular subagent reference detected: '${subagent.name}' is an ancestor of '${agent.name}'. ` +
              `Subagents cannot reference themselves or their ancestors.`,
          )
        }
      }

      const tool = createSubagentTool(subagent)
      debug('reconciler', `Subagent tool added: ${tool.name}`)
      agent.tools.push(tool)
    },
    remove(agent, child) {
      if (!isSubagentInstance(child)) return
      debug('reconciler', `Subagent tool removed: ${child.name}`)
      const index = agent.tools.findIndex((t) => t.name === child.name)
      if (index >= 0) {
        agent.tools.splice(index, 1)
      }
    },
  }
}

export function getHandlerRegistry(
  collectFromChild: (agent: AgentLike, child: Instance) => void,
  uncollectFromChild: (agent: AgentLike, child: Instance) => void,
): Map<Instance['type'], ChildCollectionHandler> {
  function createHandlerRegistry(): Map<
    Instance['type'],
    ChildCollectionHandler
  > {
    const toolHandler = createArrayHandler({
      getArray: (agent) => agent.tools,
      extractItem: (child) => child.tool,
      matchItem: (tool, child) => tool.name === child.tool.name,
      typeGuard: isToolInstance,
      onAdd: (child) => `Tool added: ${child.tool.name}`,
      onRemove: (child) => `Tool removed: ${child.tool.name}`,
    })

    const sdkToolHandler = createArrayHandler({
      getArray: (agent) => agent.sdkTools,
      extractItem: (child) => child.tool,
      matchItem: (tool, child) => tool === child.tool,
      typeGuard: isSdkToolInstance,
      onAdd: (child) => `SDK tool added: ${child.tool.name}`,
      onRemove: (child) => `SDK tool removed: ${child.tool.name}`,
    })

    const systemHandler = createArrayHandler({
      getArray: (agent) => agent.systemParts,
      extractItem: (child) => ({
        content: child.content,
        priority: child.priority,
      }),
      matchItem: (part, child) =>
        part.content === child.content && part.priority === child.priority,
      typeGuard: isSystemInstance,
    })

    const contextHandler = createArrayHandler({
      getArray: (agent) => agent.contextParts,
      extractItem: (child) => ({
        content: child.content,
        priority: child.priority,
      }),
      matchItem: (part, child) =>
        part.content === child.content && part.priority === child.priority,
      typeGuard: isContextInstance,
    })

    const messageHandler = createArrayHandler({
      getArray: (agent) => agent.messages,
      extractItem: (child) => child.message,
      matchItem: (message, child) => message === child.message,
      typeGuard: isMessageInstance,
    })

    const mcpServerHandler = createArrayHandler({
      getArray: (agent) => agent.mcpServers,
      extractItem: (child) => child.config,
      matchItem: (config, child) => config.name === child.config.name,
      typeGuard: isMCPServerInstance,
      onAdd: (child) => `MCP server added: ${child.config.name}`,
      onRemove: (child) => `MCP server removed: ${child.config.name}`,
    })

    const toolsContainerHandler = createToolsContainerHandler(
      collectFromChild,
      uncollectFromChild,
    )

    const subagentHandler = createSubagentHandler()

    return new Map<Instance['type'], ChildCollectionHandler>([
      ['tool', toolHandler],
      ['sdk_tool', sdkToolHandler],
      ['system', systemHandler],
      ['context', contextHandler],
      ['message', messageHandler],
      ['mcp_server', mcpServerHandler],
      ['tools_container', toolsContainerHandler],
      ['subagent', subagentHandler],
    ])
  }

  return createHandlerRegistry()
}
