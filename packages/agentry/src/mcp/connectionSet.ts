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
   * A server whose config changed under the same name is reconnected — `<MCP>`
   * props are state-driven, so url, args and `allowed_tools` can all change.
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

    // Two servers with the same name would each be opened here (the `has` check
    // below runs before anything is stored) and the second would overwrite the
    // first, leaking it. A collision is an authoring error — their tools would
    // collide too — so reject it rather than silently picking a winner.
    const seen = new Set<string>()
    for (const server of declared) {
      if (seen.has(server.name)) {
        throw new Error(
          `[agentry] Duplicate MCP server name "${server.name}". Names must be unique — tools are namespaced by them.`,
        )
      }
      seen.add(server.name)
    }

    // In parallel: each spawns a subprocess or performs an HTTP handshake.
    const missing = declared.filter((server) => !this.entries.has(server.name))
    const opened = await Promise.allSettled(
      missing.map(async (server) => ({
        server,
        connection: await connectMcpServer(server),
      })),
    )

    // Register every connection that opened *before* raising anything. Under
    // `Promise.all` a single failure discarded the successful siblings without
    // ever storing them, so `closeAll()` could not reach them and their stdio
    // subprocesses outlived the run.
    for (const result of opened) {
      if (result.status !== 'fulfilled') continue
      const { server, connection } = result.value
      this.entries.set(server.name, {
        connection,
        fingerprint: fingerprint(server),
      })
    }

    // Tools are published for the servers that did connect, so a partially
    // available tree keeps working; the caller still sees the failure.
    for (const { connection } of this.entries.values()) {
      for (const tool of connection.tools) {
        tools.set(tool.name, tool)
      }
    }

    const failures = opened
      .filter((r) => r.status === 'rejected')
      .map((r) => (r as PromiseRejectedResult).reason)
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) {
      throw new AggregateError(
        failures,
        '[agentry] Multiple MCP servers failed to connect',
      )
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
 * Stable identity for a server config. Keys are sorted because these are JSX
 * props, where authoring order is arbitrary and would force spurious
 * reconnects.
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
