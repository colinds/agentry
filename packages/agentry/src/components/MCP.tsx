import type { ReactNode } from 'react'
import type { MCPServerConfig } from '../mcp/types'

export type MCPProps = MCPServerConfig

/**
 * MCP component — connects to an MCP server and registers its tools.
 *
 * pi deliberately ships no MCP support, so agentry acts as the MCP *client*:
 * it connects, lists the server's tools, and exposes each as an ordinary tool
 * whose handler proxies `tools/call`. That makes MCP work identically on every
 * provider pi supports, rather than only on those with a native connector.
 *
 * Tool names are namespaced as `<server>__<tool>` so two servers can expose
 * the same tool name without colliding.
 *
 * @example a local server over stdio
 * ```tsx
 * <Agent provider="anthropic" model="claude-haiku-4-5">
 *   <MCP
 *     type="stdio"
 *     name="fs"
 *     command="bunx"
 *     args={['@modelcontextprotocol/server-filesystem', '/tmp']}
 *   />
 *   <Message role="user">List the files in /tmp</Message>
 * </Agent>
 * ```
 *
 * @example a remote server over streamable HTTP
 * ```tsx
 * <MCP type="url" name="docs" url="https://example.com/mcp" />
 * ```
 *
 * @example registering only some of the server's tools
 * ```tsx
 * <MCP
 *   type="stdio"
 *   name="fs"
 *   command="bunx"
 *   args={['@modelcontextprotocol/server-filesystem', '/tmp']}
 *   tool_configuration={{ allowed_tools: ['read_file', 'list_directory'] }}
 * />
 * ```
 */
export function MCP(props: MCPProps): ReactNode {
  return <mcp_server {...props} key={props.name} />
}
