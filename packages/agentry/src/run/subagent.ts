import Anthropic from '@anthropic-ai/sdk'
import { SubagentHandle } from '../handles'
import type { AgentResult } from '../types'
import type { SubagentInstance } from '../instances'

export interface RunSubagentOptions {
  /** anthropic client instance */
  client: Anthropic
  /** abort signal for cancellation */
  signal?: AbortSignal
}

/**
 * internal function to run a subagent
 *
 * called from synthetic tool handlers created by the reconciler
 * not intended for direct use - use <Agent> nesting in JSX instead
 */
export async function runSubagent(
  subagent: SubagentInstance,
  options: RunSubagentOptions,
): Promise<AgentResult> {
  const handle = new SubagentHandle(subagent, options)

  try {
    return await handle.run()
  } finally {
    handle.close()
  }
}
