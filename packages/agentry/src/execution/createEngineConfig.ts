import type { AgentInstance } from '../instances/types'
import type { AgentStore } from '../store'
import { createAgentStore } from '../store'
import type { ExecutionEngineConfig } from './ExecutionEngine'
import type {
  ProviderClientMap,
  ProviderAdapter,
  SystemBlock,
} from '../providers/types'
import type { ProviderName } from '../types/provider'

export interface EngineConfigOptions {
  agent: AgentInstance
  clients: Partial<ProviderClientMap>
  adapters: Record<string, ProviderAdapter<ProviderName>>
  store?: AgentStore
}

export interface EngineConfigResult {
  config: ExecutionEngineConfig
  store: AgentStore
}

export function buildSystemPrompt(
  agent: AgentInstance,
): string | SystemBlock[] | undefined {
  if (agent.systemParts.length === 0) {
    return undefined
  }

  if (agent.systemParts.length === 1 && !agent.systemParts[0]?.cache) {
    return agent.systemParts[0]!.content
  }

  return agent.systemParts.map((part) => {
    const block: SystemBlock = {
      type: 'text',
      text: part.content,
    }
    if (part.cache === 'ephemeral') {
      block.cache_control = { type: 'ephemeral' }
    }
    return block
  })
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
  const { agent, clients, adapters } = options

  const store = options.store ?? createAgentStore()

  const system = buildSystemPrompt(agent)
  const provider = agent.props.provider
  if (!provider) {
    throw new Error('Provider is required on agent props.')
  }
  const model = agent.props.model
  if (!model) {
    throw new Error(
      'model is required on the agent. Set it via the model prop on <Agent>.',
    )
  }
  const client = (agent.client ??
    clients[provider]) as ExecutionEngineConfig['client']
  if (!client) {
    throw new Error(`No client configured for provider "${provider}"`)
  }

  const config = {
    provider,
    clients,
    adapters,
    client,
    model,
    maxTokens: agent.props.maxTokens ?? 4096,
    system,
    stream: agent.props.stream ?? false,
    maxIterations: agent.props.maxIterations ?? 20,
    compactionControl: agent.props.compactionControl,
    stopSequences: agent.props.stopSequences,
    temperature: agent.props.temperature,
    agentName: agent.props.name,
    thinking: agent.props.thinking,
    betas: agent.props.betas,
    agentInstance: agent,
    store,
  }

  return { config, store }
}
