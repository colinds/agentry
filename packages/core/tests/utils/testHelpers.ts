import { useExecutionState, useMessages } from '@agentry/components'
import {
  isAgentInstance,
  type AgentState,
  type BetaMessageParam,
} from '@agentry/core'
import type { AgentHandle } from '../../src/handles/index.ts'

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
