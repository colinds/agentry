import { McpConnectionSet } from '../mcp'
import type { ResourceSnapshot } from './resourceDiff'

/**
 * State that outlives a single run of a handle.
 *
 * The handle builds a fresh `ExecutionEngine` per run, so engine-owned state is
 * discarded when the run returns. That is right for iteration counts and the
 * last message; it is wrong for MCP connections, which are processes, and for
 * the narration baseline, which is what tells the model its tools changed.
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
