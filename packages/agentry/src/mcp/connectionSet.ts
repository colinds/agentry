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
/** A live connection plus the config it was opened with. */
interface Entry {
  connection: McpConnection
  fingerprint: string
}

export class McpConnectionSet {
  private entries = new Map<string, Entry>()

  /**
   * Brings connections in line with the declared servers, and writes the
   * resulting tools into `tools`.
   *
   * A server that has left the tree is disconnected *and* has its tools
   * withdrawn. The reconciler removes the `<MCP>` element itself, but the tools
   * derived from it were written into the shared map and nothing else takes
   * them out.
   *
   * A server whose config changed under the same name is reconnected. Props are
   * state-driven like any other, so a `<MCP>` can switch url, args, or
   * `allowed_tools` mid-run; keying on name alone would keep serving the old
   * server's tools forever.
   */
  async sync(
    declared: readonly MCPServerConfig[],
    tools: Map<string, InternalTool>,
  ): Promise<void> {
    const wanted = new Map(
      declared.map((server) => [server.name, fingerprint(server)]),
    )

    for (const [name, entry] of this.entries) {
      const desired = wanted.get(name)
      if (desired === entry.fingerprint) continue

      this.entries.delete(name)
      for (const tool of entry.connection.tools) {
        tools.delete(tool.name)
      }
      await entry.connection.close().catch(() => {})
      debug(
        'mcp',
        desired === undefined
          ? `Disconnected from "${name}" (no longer in tree)`
          : `Disconnected from "${name}" (config changed)`,
      )
    }

    // Connect in parallel: each of these spawns a subprocess or performs an
    // HTTP handshake, so doing them in sequence made startup scale with the
    // number of servers.
    const missing = declared.filter((server) => !this.entries.has(server.name))
    const opened = await Promise.all(
      missing.map(async (server) => ({
        server,
        connection: await connectMcpServer(server),
      })),
    )
    for (const { server, connection } of opened) {
      this.entries.set(server.name, {
        connection,
        fingerprint: fingerprint(server),
      })
    }

    for (const { connection } of this.entries.values()) {
      for (const tool of connection.tools) {
        tools.set(tool.name, tool)
      }
    }
  }

  /** Closes every live connection. Safe to call more than once. */
  async closeAll(): Promise<void> {
    const entries = [...this.entries.values()]
    this.entries.clear()
    await Promise.all(entries.map((e) => e.connection.close().catch(() => {})))
  }

  get size(): number {
    return this.entries.size
  }
}

/**
 * Stable identity for a server config, so a changed one is noticed.
 *
 * Keys are sorted because these come from JSX props, where authoring order is
 * arbitrary and would otherwise force a spurious reconnect.
 */
function fingerprint(server: MCPServerConfig): string {
  return JSON.stringify(server, (_key, value: unknown) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
            a.localeCompare(b),
          ),
        )
      : value,
  )
}
