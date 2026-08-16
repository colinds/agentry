import type { Models } from '@earendil-works/pi-ai'
import type { AgentInstance } from '../instances/types'
import type { AgentStore } from '../store'
import { createAgentStore } from '../store'
import type { ExecutionEngineConfig } from './ExecutionEngine'
import type { AgentSession } from './session'

interface EngineConfigOptions {
  agent: AgentInstance
  models: Models
  store?: AgentStore
  sessionId?: string
  /** Cross-run state owned by the calling handle. */
  session?: AgentSession
}

interface EngineConfigResult {
  config: ExecutionEngineConfig
  store: AgentStore
}

/**
 * Joins the collected `<System>` parts into a single prompt.
 *
 * Per-part cache control is gone: pi owns prompt caching via `cacheRetention`
 * plus a per-run `sessionId`, so agentry no longer emits cache breakpoints.
 */
export function buildSystemPrompt(agent: AgentInstance): string | undefined {
  if (agent.systemParts.length === 0) {
    return undefined
  }

  return agent.systemParts.map((part) => part.content).join('\n\n')
}

/**
 * Shared factory for ExecutionEngine configuration
 * Used by both root agents (AgentHandle) and subagents (renderSubagent)
 *
 * Unified defaults: maxTokens=4096
 * These apply when agent.props doesn't specify a value
 */
export function createEngineConfig(
  options: EngineConfigOptions,
): EngineConfigResult {
  const { agent, models } = options

  const store = options.store ?? createAgentStore()

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

  const config: ExecutionEngineConfig = {
    models,
    provider,
    model,
    maxTokens: agent.props.maxTokens ?? 4096,
    stream: agent.props.stream ?? false,
    maxIterations: agent.props.maxIterations ?? 20,
    compactionControl: agent.props.compactionControl,
    temperature: agent.props.temperature,
    agentName: agent.props.name,
    reasoning: agent.props.thinking,
    sessionId: options.sessionId,
    session: options.session,
    retry: agent.props.retry,
    cacheRetention: agent.props.cacheRetention,
    timeoutMs: agent.props.timeoutMs,
    headers: agent.props.headers,
    samplingParams: agent.props.samplingParams,
    agentInstance: agent,
    store,
  }

  return { config, store }
}
