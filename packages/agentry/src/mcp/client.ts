import type { InternalTool, ToolResult } from '../types/tools'
import type { JsonObject, JsonValue } from '../types/json'
import { debug } from '../debug'
import type { MCPServerConfig } from './types'

interface McpClientLike {
  connect(transport: unknown): Promise<void>
  listTools(): Promise<{
    tools: Array<{
      name: string
      description?: string
      inputSchema?: Record<string, JsonValue>
    }>
  }>
  callTool(params: { name: string; arguments?: JsonObject }): Promise<{
    content?: Array<{ type: string; text?: string }>
    isError?: boolean
  }>
  close(): Promise<void>
}

export interface McpConnection {
  name: string
  tools: InternalTool[]
  close(): Promise<void>
}

/**
 * pi models only client-executed tools, so MCP is bridged here rather than
 * handed to the provider: connect, list the server's tools, and expose each as
 * an ordinary agentry tool whose handler proxies `tools/call`.
 *
 * MCP `inputSchema` is already JSON Schema, which is also what TypeBox schemas
 * are at runtime, so it passes straight through with no conversion.
 */
export async function connectMcpServer(
  config: MCPServerConfig,
  signal?: AbortSignal,
): Promise<McpConnection> {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')

  const client = new Client({
    name: 'agentry',
    version: '0.2.0',
  }) as unknown as McpClientLike

  const transport = await createTransport(config)

  try {
    await client.connect(transport)
  } catch (error) {
    throw new Error(
      `[agentry] Failed to connect to MCP server "${config.name}": ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    )
  }

  const listed = await client.listTools()
  const allowed = config.tool_configuration?.allowed_tools
  const enabled = config.tool_configuration?.enabled !== false

  const tools: InternalTool[] = enabled
    ? listed.tools
        .filter((tool) => !allowed || allowed.includes(tool.name))
        .map((tool) => toInternalTool({ client, config, tool, signal }))
    : []

  debug(
    'mcp',
    `Connected to "${config.name}": ${tools.length}/${listed.tools.length} tools registered`,
    { tools: tools.map((t) => t.name) },
  )

  return {
    name: config.name,
    tools,
    close: () => client.close(),
  }
}

/**
 * Namespaced so two servers exposing a tool of the same name cannot collide.
 */
export function mcpToolName(serverName: string, toolName: string): string {
  return `${serverName}__${toolName}`
}

function toInternalTool(options: {
  client: McpClientLike
  config: MCPServerConfig
  tool: {
    name: string
    description?: string
    inputSchema?: Record<string, JsonValue>
  }
  signal?: AbortSignal
}): InternalTool {
  const { client, config, tool, signal } = options
  const schema: Record<string, JsonValue> = tool.inputSchema ?? {
    type: 'object',
    properties: {},
  }

  return {
    name: mcpToolName(config.name, tool.name),
    description: tool.description ?? `MCP tool "${tool.name}"`,
    parameters: schema as never,
    jsonSchema: schema,
    handler: async (input): Promise<ToolResult> => {
      if (signal?.aborted) {
        const error = new Error('Aborted')
        error.name = 'AbortError'
        throw error
      }

      const result = await client.callTool({
        name: tool.name,
        arguments: (input ?? {}) as JsonObject,
      })

      const text = (result.content ?? [])
        .filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join('\n')

      // Tool errors are returned as strings so the model can recover.
      if (result.isError) {
        return `Error from MCP tool "${tool.name}": ${text || 'unknown error'}`
      }

      return text || `MCP tool "${tool.name}" returned no text content.`
    },
  }
}

async function createTransport(config: MCPServerConfig): Promise<unknown> {
  if (config.type === 'stdio') {
    const { StdioClientTransport } =
      await import('@modelcontextprotocol/sdk/client/stdio.js')
    return new StdioClientTransport({
      command: config.command,
      args: config.args ?? [],
      ...(config.env ? { env: config.env } : {}),
    })
  }

  const { StreamableHTTPClientTransport } =
    await import('@modelcontextprotocol/sdk/client/streamableHttp.js')

  const options = config.authorization_token
    ? {
        requestInit: {
          headers: { Authorization: `Bearer ${config.authorization_token}` },
        },
      }
    : undefined

  return new StreamableHTTPClientTransport(new URL(config.url), options)
}
