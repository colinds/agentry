import { useExecutionState, useMessages } from '@agentry/components'
import { type AgentState, type BetaMessageParam } from '@agentry/core/types'
import {
  isAgentInstance,
  isRouterInstance,
  type Instance,
} from '@agentry/core/instances/types'
import type { AgentHandle } from '@agentry/core/handles'

/**
 * Helper to create a component that watches execution state
 * Returns captured state snapshots for assertions
 */
export function createStateWatcher() {
  const states: AgentState[] = []

  const Component = () => {
    const state = useExecutionState()
    states.push({ ...state })
    return null
  }

  return {
    states,
    Component,
  }
}

/**
 * Helper to create a component that collects message snapshots
 * Returns message history snapshots for assertions
 */
export function createMessageCollector() {
  const snapshots: BetaMessageParam[][] = []

  const Component = () => {
    const messages = useMessages()
    snapshots.push([...messages])
    return null
  }

  return {
    snapshots,
    Component,
  }
}

/**
 * Helper to capture a single value from a hook
 * Useful for capturing values inside subagents or at specific execution points
 */
export function createValueCapture<T>() {
  let capturedValue: T | undefined

  const capture = (value: T) => {
    capturedValue = value
  }

  return {
    capture,
    get value() {
      return capturedValue
    },
  }
}

/**
 * Test-only helper to access the internal tools list from an AgentHandle
 * This allows us to verify that tools are properly registered/removed
 *
 * Note: This accesses protected properties and should only be used in tests
 */
export function getRegisteredTools(handle: AgentHandle): string[] {
  const containerInfo = handle.__getContainerInfo()
  if (!containerInfo || !containerInfo.container) {
    return []
  }

  const container = containerInfo.container

  const agent = container.children[0]
  if (!agent || !isAgentInstance(agent)) {
    return []
  }

  return agent.tools.map((tool) => tool.name)
}

/**
 * Test-only helper to get all tools (including SDK tools) from an AgentHandle
 */
export function getAllRegisteredTools(handle: AgentHandle): {
  tools: string[]
  sdkTools: string[]
} {
  const containerInfo = handle.__getContainerInfo()
  if (!containerInfo || !containerInfo.container) {
    return { tools: [], sdkTools: [] }
  }

  const container = containerInfo.container
  const agent = container.children[0]
  if (!agent || !isAgentInstance(agent)) {
    return { tools: [], sdkTools: [] }
  }

  return {
    tools: agent.tools.map((tool) => tool.name),
    sdkTools: agent.sdkTools.map((tool) => {
      if ('name' in tool && typeof tool.name === 'string') {
        return tool.name
      }
      return 'unknown'
    }),
  }
}

/**
 * Test-only helper to verify router instances have routes collected
 * This ensures the reconciler properly adds Route children to RouterInstance.children
 */
export function verifyRouterHasRoutes(handle: AgentHandle): boolean {
  const containerInfo = handle.__getContainerInfo()
  if (!containerInfo || !containerInfo.container) {
    return false
  }

  const container = containerInfo.container
  if (!isAgentInstance(container)) {
    return false
  }

  function findRouters(instance: Instance): Instance[] {
    const routers: Instance[] = []
    if (isRouterInstance(instance)) {
      routers.push(instance)
    }
    if ('children' in instance && Array.isArray(instance.children)) {
      for (const child of instance.children) {
        routers.push(...findRouters(child))
      }
    }
    return routers
  }

  const routers = findRouters(container)

  if (routers.length === 0) {
    return false
  }

  const allHaveRoutes = routers.every((router) => {
    if (isRouterInstance(router)) {
      return router.children.length > 0
    }
    return false
  })

  return allHaveRoutes
}
