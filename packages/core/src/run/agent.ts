import Anthropic from '@anthropic-ai/sdk'
import type { ReactNode } from 'react'
import { AgentHandle } from '../handles/index.ts'

export interface RunOptions {
  /** anthropic client instance */
  client?: Anthropic
  /** execution mode */
  mode?: 'batch' | 'interactive'
}

/**
 * run an agent element and return a handle or result
 *
 * @example batch mode (default) - runs to completion
 * ```ts
 * const result = await run(
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
 * const agent = await run(
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
export async function run(
  element: ReactNode,
  options?: RunOptions & { mode?: 'batch' },
): Promise<import('../types/index.ts').AgentResult>
export async function run(
  element: ReactNode,
  options: RunOptions & { mode: 'interactive' },
): Promise<AgentHandle>
export async function run(
  element: ReactNode,
  options: RunOptions = {},
): Promise<import('../types/index.ts').AgentResult | AgentHandle> {
  const { mode = 'batch', client } = options

  const handle = new AgentHandle(element, client, mode)

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
