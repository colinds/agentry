export interface McpToolConfiguration {
  /** Set false to connect but register no tools. */
  enabled?: boolean
  /** Register only these tool names (server-side names, before namespacing). */
  allowed_tools?: string[]
}

/** A remote MCP server reached over streamable HTTP. */
export interface McpUrlServerConfig {
  type: 'url'
  name: string
  url: string
  authorization_token?: string
  tool_configuration?: McpToolConfiguration
}

/** A local MCP server launched as a subprocess and spoken to over stdio. */
export interface McpStdioServerConfig {
  type: 'stdio'
  name: string
  command: string
  args?: string[]
  env?: Record<string, string>
  tool_configuration?: McpToolConfiguration
}

export type MCPServerConfig = McpUrlServerConfig | McpStdioServerConfig
