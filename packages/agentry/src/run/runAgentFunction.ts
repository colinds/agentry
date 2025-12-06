import Anthropic from '@anthropic-ai/sdk'
import type React from 'react'
import { SubagentHandle } from '../handles'
import type { AgentResult, Model } from '../types'
import { createSubagentInstance } from '../instances/createInstance'

/**
 * Options for spawning an agent programmatically
 */
export interface RunAgentOptions {
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
export interface RunAgentContext {
  client: Anthropic
  model?: Model
  signal?: AbortSignal
}

/**
 * Create a runAgent function bound to a specific execution context.
 * This function is attached to ToolContext and allows tool handlers to
 * programmatically spawn and execute agents on-demand.
 *
 * @param context - The execution context (client, model, signal)
 * @returns A runAgent function that can execute React agent elements
 *
 * @example
 * ```tsx
 * const runSubagent = createRunAgent({
 *   client: anthropicClient,
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
    const elementProps = agentElement.props as {
      name?: string
      maxTokens?: number
      temperature?: number
    }
    const subagent = createSubagentInstance(
      {
        name: elementProps.name || `spawned_${Date.now()}`,
        agentNode: agentElement,
        maxTokens: options.maxTokens ?? elementProps.maxTokens,
        temperature: options.temperature ?? elementProps.temperature,
        stream: false,
      },
      {
        model: options.model || context.model,
      },
    )

    const handle = new SubagentHandle(subagent, {
      client: context.client,
      signal: options.signal || context.signal,
    })

    try {
      const result = await handle.run()
      return result
    } finally {
      handle.close()
    }
  }
}
