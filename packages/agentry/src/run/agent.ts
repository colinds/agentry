import type { ReactNode } from 'react'
import { AgentHandle } from '../handles'
import type { AgentResult } from '../types'
import type { ProvidersConfig } from '../providers/types'

export interface RunOptions {
  /** per-provider client and options */
  providers?: ProvidersConfig
  /** execution mode */
  mode?: 'batch' | 'interactive'
}

export interface CreateAgentOptions {
  /** per-provider client and options */
  providers?: ProvidersConfig
}

/**
 * run an agent element and return a handle or result
 *
 * @example batch mode (default) - runs to completion
 * ```ts
 * const result = await run(
 *   <Agent provider="anthropic" model="claude-sonnet-4-5">
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
 *   <Agent provider="anthropic" model="claude-sonnet-4-5">
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
): Promise<AgentResult>
export async function run(
  element: ReactNode,
  options: RunOptions & { mode: 'interactive' },
): Promise<AgentHandle>
export async function run(
  element: ReactNode,
  options: RunOptions = {},
): Promise<AgentResult | AgentHandle> {
  const { mode = 'batch' } = options

  const handle = new AgentHandle(
    element,
    { providers: options.providers },
    mode,
  )

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
  options?: CreateAgentOptions,
): AgentHandle {
  return new AgentHandle(element, { providers: options?.providers })
}
