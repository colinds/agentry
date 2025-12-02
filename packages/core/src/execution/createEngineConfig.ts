import type Anthropic from '@anthropic-ai/sdk'
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta'
import type { AgentInstance } from '../instances/types.ts'
import type { AgentStore } from '../store.ts'
import { createAgentStore } from '../store.ts'
import type { ExecutionEngineConfig } from './ExecutionEngine.ts'

export interface EngineConfigOptions {
  agent: AgentInstance
  client: Anthropic
  store?: AgentStore
  overrideMessages?: BetaMessageParam[]
}

export interface EngineConfigResult {
  config: ExecutionEngineConfig
  store: AgentStore
}

/**
 * Build system prompt from agent's collected parts
 */
function buildSystemPrompt(agent: AgentInstance): string | undefined {
  const sortedSystemParts = [...agent.systemParts].sort(
    (a, b) => b.priority - a.priority,
  )
  const sortedContextParts = [...agent.contextParts].sort(
    (a, b) => b.priority - a.priority,
  )
  const allParts = [...sortedSystemParts, ...sortedContextParts]
  return allParts.length > 0
    ? allParts.map((p) => p.content).join('\n\n')
    : undefined
}

/**
 * Shared factory for ExecutionEngine configuration
 * Used by both root agents (AgentHandle) and subagents (renderSubagent)
 *
 * Unified defaults: maxTokens=4096, stream=true
 * These apply when agent.props doesn't specify a value
 */
export function createEngineConfig(
  options: EngineConfigOptions,
): EngineConfigResult {
  const { agent, client, overrideMessages } = options

  const store = options.store ?? createAgentStore()

  const system = buildSystemPrompt(agent)

  const initialMessages = overrideMessages ?? agent.messages

  if (initialMessages.length > 0 && store.getState().messages.length === 0) {
    store.setState({ messages: [...initialMessages] })
  }

  const config = {
    client,
    model: agent.props.model,
    maxTokens: agent.props.maxTokens ?? 4096,
    system,
    stream: agent.props.stream ?? false,
    maxIterations: agent.props.maxIterations ?? 20,
    compactionControl: agent.props.compactionControl,
    stopSequences: agent.props.stopSequences,
    temperature: agent.props.temperature,
    agentName: agent.props.name,
    agentInstance: agent,
    store,
  }

  return { config, store }
}
