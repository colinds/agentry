import type { ReactNode } from 'react';
import type { BetaRequestMCPServerToolConfiguration } from '@anthropic-ai/sdk/resources/beta';

export interface MCPProps {
  /** Name of the MCP server */
  name: string;
  /** URL of the MCP server (SSE endpoint) */
  url: string;
  /** Authorization token for the MCP server */
  authorization_token?: string;
  /** Tool configuration (allowed tools, enabled status) */
  tool_configuration?: BetaRequestMCPServerToolConfiguration;
}

/**
 * MCP component - connects to an MCP (Model Context Protocol) server
 *
 * Uses Anthropic's native MCP support - the server connection is handled
 * by Anthropic's API, not client-side.
 *
 * @example
 * ```tsx
 * <Agent model="claude-sonnet-4-5">
 *   <MCP name="filesystem" url="https://mcp.example.com/sse" />
 *   <MCP
 *     name="github"
 *     url="https://mcp.github.com/sse"
 *     authorization_token={process.env.GITHUB_TOKEN}
 *     tool_configuration={{ allowed_tools: ['search_code', 'get_file'] }}
 *   />
 * </Agent>
 * ```
 */
export function MCP(props: MCPProps): ReactNode {
  return (
    <mcp_server
      name={props.name}
      url={props.url}
      authorization_token={props.authorization_token}
      tool_configuration={props.tool_configuration}
      key={props.name}
    />
  );
}

