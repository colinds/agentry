import type React from 'react'
import { SubagentHandle } from '../handles'
import type { AgentResult, Model } from '../types'
import { createSubagentInstance } from '../instances/createInstance'
import type { ProviderName } from '../types/provider'
import type { Models } from '@earendil-works/pi-ai'

/**
 * Options for spawning an agent programmatically
 */
export interface RunAgentOptions {
  /** Override provider */
  provider?: ProviderName
  /** Override the pi model collection */
  models?: Models
  /** Override parent's model */
  model?: Model
  /** Override maxTokens (defaults to half parent's) */
  maxTokens?: number
  /** Override temperature */
  temperature?: number
  /** Custom abort signal (defaults to parent's) */
  signal?: AbortSignal
}

/**
 * Context for creating a spawn agent function
 */
interface RunAgentContext {
  models: Models
  provider?: ProviderName
  model?: Model
  signal?: AbortSignal
}

/**
 * Create a runAgent function bound to a specific execution context.
 * This function is attached to ToolContext and allows tool handlers to
 * programmatically spawn and execute agents on-demand.
 *
 * @param context - The execution context (clients, model, signal)
 * @returns A runAgent function that can execute React agent elements
 *
 * @example
 * ```tsx
 * const runSubagent = createRunAgent({
 *   clients: { anthropic: anthropicClient },
 *   model: 'claude-sonnet-4',
 *   signal: abortController.signal,
 * })
 *
 * // In a tool handler:
 * const result = await runAgent(
 *   <Agent name="researcher">
 *     <System>You are a research expert.</System>
 *     <Message role="user">Research: {input.topic}</Message>
 *   </Agent>
 * )
 * ```
 */
export function createRunAgent(context: RunAgentContext) {
  return async function runAgent(
    agentElement: React.ReactElement,
    options: RunAgentOptions = {},
  ): Promise<AgentResult> {
    const provider = options.provider ?? context.provider
    if (!provider) {
      throw new Error('Provider is required for runAgent.')
    }
    const models = options.models ?? context.models

    const elementProps = agentElement.props as {
      name?: string
      maxTokens?: number
      temperature?: number
    }
    const subagent = createSubagentInstance(
      {
        name: elementProps.name || `spawned_${Date.now()}`,
        agentNode: agentElement,
        provider,
        maxTokens: options.maxTokens ?? elementProps.maxTokens,
        temperature: options.temperature ?? elementProps.temperature,
        stream: false,
      },
      {
        provider,
        model: options.model || context.model,
      },
    )

    const handle = new SubagentHandle(subagent, {
      provider,
      models,
      signal: options.signal || context.signal,
    })

    try {
      return await handle.run()
    } finally {
      handle.close()
    }
  }
}
