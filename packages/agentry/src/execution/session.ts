import { McpConnectionSet } from '../mcp'
import type { ResourceSnapshot } from './resourceDiff'

/**
 * State that has to survive across runs of the same handle.
 *
 * A handle builds a fresh `ExecutionEngine` for every `run()` / `sendMessage()`,
 * so anything the engine owns is discarded when that call returns. For most of
 * the engine's state that is correct — iteration counts and the last message are
 * genuinely per-run. These two are not:
 *
 * - MCP connections are processes and sockets. Recreating them per message
 *   reconnects every server on every turn of conversation and orphans the
 *   previous set, so an interactive agent leaks one server process per message
 *   and `close()` only ever reaps the last.
 * - The narrated resource baseline is what tells the model a tool appeared or
 *   disappeared. Resetting it per run silently re-baselines, so a tool set that
 *   changed at the end of one message is never announced in the next.
 */
export class AgentSession {
  readonly mcpConnections = new McpConnectionSet()

  /** Last resource set narrated to the model, for turn-boundary diffing. */
  lastNarratedResources: ResourceSnapshot | null = null

  /** Releases everything held across runs. Safe to call more than once. */
  async close(): Promise<void> {
    await this.mcpConnections.closeAll()
  }
}
