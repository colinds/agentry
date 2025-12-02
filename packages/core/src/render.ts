import Anthropic from '@anthropic-ai/sdk'
import type { ReactNode } from 'react'
import { AgentHandle, SubagentHandle } from './handles/index.ts'
import type { AgentResult } from './types/index.ts'
import type { SubagentInstance } from './instances/index.ts'

export interface RenderOptions {
  /** anthropic client instance */
  client?: Anthropic
  /** execution mode */
  mode?: 'batch' | 'interactive'
}

/**
 * render an agent element and return a handle or result
 *
 * @example batch mode (default) - runs to completion
 * ```ts
 * const result = await render(
 *   <Agent model="claude-sonnet-4-5">
 *     <System>You are a helpful assistant</System>
 *     <Message role="user">Hello!</Message>
 *   </Agent>
 * );
 * console.log(result.content);
 * ```
 *
 * @example interactive mode - returns handle for ongoing interaction
 * ```ts
 * const agent = await render(
 *   <Agent model="claude-sonnet-4-5">
 *     <System>You are a helpful assistant</System>
 *     <Tools><WebSearch /></Tools>
 *   </Agent>,
 *   { mode: 'interactive' }
 * );
 *
 * const result = await agent.sendMessage('What is the weather?');
 * console.log(result.content);
 *
 * // stream the response
 * for await (const event of agent.stream('What is the weather?')) {
 *   if (event.type === 'text') {
 *     process.stdout.write(event.text);
 *   }
 * }
 *
 * agent.close();
 * ```
 */
export async function render(
  element: ReactNode,
  options?: RenderOptions & { mode?: 'batch' },
): Promise<AgentResult>
export async function render(
  element: ReactNode,
  options: RenderOptions & { mode: 'interactive' },
): Promise<AgentHandle>
export async function render(
  element: ReactNode,
  options: RenderOptions = {},
): Promise<AgentResult | AgentHandle> {
  const { mode = 'batch' } = options

  const handle = createAgent(element, options)

  if (mode === 'interactive') {
    return handle
  }

  try {
    return await handle.run()
  } finally {
    handle.close()
  }
}

/**
 * create an agent handle without running it
 *
 * useful when you want to configure the agent before sending messages
 */
export function createAgent(
  element: ReactNode,
  options?: { client?: Anthropic },
): AgentHandle {
  return new AgentHandle(element, options?.client)
}

export interface RenderSubagentOptions {
  /** anthropic client instance */
  client: Anthropic
  /** abort signal for cancellation */
  signal?: AbortSignal
}

/**
 * internal function to render a subagent
 *
 * called from synthetic tool handlers created by the reconciler
 * not intended for direct use - use <Agent> nesting in JSX instead
 */
export async function renderSubagent(
  subagent: SubagentInstance,
  options: RenderSubagentOptions,
): Promise<AgentResult> {
  const handle = new SubagentHandle(subagent, options)

  try {
    return await handle.run()
  } finally {
    handle.close()
  }
}
