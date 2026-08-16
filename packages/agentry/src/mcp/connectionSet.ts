import type { InternalTool } from '../types/tools'
import { debug } from '../debug'
import { connectMcpServer, type McpConnection } from './client'
import type { MCPServerConfig } from './types'

/**
 * The live MCP connections for one agent run.
 *
 * Connections are long-lived and reconciled per turn against whatever `<MCP>`
 * elements are currently in the tree, so this owns both the sockets and the
 * tools derived from them — the two have to move together, since a tool whose
 * server has gone is worse than no tool at all.
 */
export class McpConnectionSet {
  private connections = new Map<string, McpConnection>()

  /**
   * Brings connections in line with the declared servers, and writes the
   * resulting tools into `tools`.
   *
   * A server that has left the tree is disconnected *and* has its tools
   * withdrawn. The reconciler removes the `<MCP>` element itself, but the tools
   * derived from it were written into the shared map and nothing else takes
   * them out.
   */
  async sync(
    declared: readonly MCPServerConfig[],
    tools: Map<string, InternalTool>,
    signal: AbortSignal,
  ): Promise<void> {
    const declaredNames = new Set(declared.map((server) => server.name))

    for (const [name, connection] of this.connections) {
      if (declaredNames.has(name)) continue

      this.connections.delete(name)
      for (const tool of connection.tools) {
        tools.delete(tool.name)
      }
      await connection.close().catch(() => {})
      debug('mcp', `Disconnected from "${name}" (no longer in tree)`)
    }

    for (const server of declared) {
      if (this.connections.has(server.name)) continue
      this.connections.set(server.name, await connectMcpServer(server, signal))
    }

    for (const connection of this.connections.values()) {
      for (const tool of connection.tools) {
        tools.set(tool.name, tool)
      }
    }
  }

  /** Closes every live connection. Safe to call more than once. */
  async closeAll(): Promise<void> {
    const connections = [...this.connections.values()]
    this.connections.clear()
    await Promise.all(connections.map((c) => c.close().catch(() => {})))
  }

  get size(): number {
    return this.connections.size
  }
}
