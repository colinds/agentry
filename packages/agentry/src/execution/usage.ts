import type { Usage } from '@earendil-works/pi-ai'

/**
 * Running total for a whole run.
 *
 * pi reports usage per assistant message, so reading only the last one
 * under-reports a tool loop by roughly the number of turns it took.
 */
export type RunUsage = Pick<
  Usage,
  'input' | 'output' | 'cacheRead' | 'cacheWrite' | 'totalTokens' | 'cost'
> & { reasoning: number }

export function emptyRunUsage(): RunUsage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    reasoning: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  }
}

/** Adds one turn's usage into the running total, in place. */
export function addUsage(total: RunUsage, turn: Usage): void {
  total.input += turn.input
  total.output += turn.output
  total.cacheRead += turn.cacheRead
  total.cacheWrite += turn.cacheWrite
  total.reasoning += turn.reasoning ?? 0
  total.totalTokens += turn.totalTokens
  total.cost.input += turn.cost.input
  total.cost.output += turn.cost.output
  total.cost.cacheRead += turn.cost.cacheRead
  total.cost.cacheWrite += turn.cost.cacheWrite
  total.cost.total += turn.cost.total
}
