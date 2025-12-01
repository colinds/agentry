import type Anthropic from '@anthropic-ai/sdk'
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta'
import type { SubagentInstance, AgentResult } from '@agentry/core'
import { SubagentHandle } from './handles/index.ts'

export interface RenderSubagentOptions {
  client: Anthropic
  signal?: AbortSignal
  initialMessages?: BetaMessageParam[]
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
