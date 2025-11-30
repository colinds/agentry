import Anthropic from '@anthropic-ai/sdk';
import type { ReactNode } from 'react';
import { AgentHandle } from './AgentHandle.ts';
import type { AgentResult } from '@agentry/core';

export interface RenderOptions {
  /** anthropic client instance */
  client?: Anthropic;
  /** execution mode */
  mode?: 'batch' | 'interactive';
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
 * for await (const event of agent.stream()) {
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
): Promise<AgentResult>;
export async function render(
  element: ReactNode,
  options: RenderOptions & { mode: 'interactive' },
): Promise<AgentHandle>;
export async function render(
  element: ReactNode,
  options: RenderOptions = {},
): Promise<AgentResult | AgentHandle> {
  const { client, mode = 'batch' } = options;

  const handle = new AgentHandle(element, client);

  if (mode === 'interactive') {
    return handle;
  }

  // batch mode - run to completion
  try {
    return await handle.run();
  } finally {
    handle.close();
  }
}

/**
 * create an agent handle without running it
 *
 * useful when you want to configure the agent before sending messages
 */
export function createAgent(element: ReactNode, options?: { client?: Anthropic }): AgentHandle {
  return new AgentHandle(element, options?.client);
}
