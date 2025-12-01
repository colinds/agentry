/**
 * MCP (Model Context Protocol) Server Example
 *
 * This example demonstrates how to connect to MCP servers using Anthropic's
 * native MCP support. MCP servers provide tools that Claude can use during
 * conversations - the server connection is handled server-side by Anthropic.
 *
 * This example uses Cloudflare's public demo MCP server.
 */

import { render, Agent, System, Message, MCP } from '@agentry/runtime'
import { MODEL } from '@agentry/shared'

const MCP_SERVER_URL = 'https://demo-day.mcp.cloudflare.com/sse'

console.log('Using MCP server:', MCP_SERVER_URL)

const result = await render(
  <Agent model={MODEL} maxTokens={4096}>
    <System>
      You are a helpful assistant with access to external tools via MCP servers.
      Use the available tools to help answer the user's questions.
    </System>

    {/* Connect to Cloudflare's demo MCP server */}
    <MCP name="cloudflare-demo" url={MCP_SERVER_URL} />

    {/* You can connect to multiple MCP servers with different configurations */}
    {/* 
    <MCP 
      name="another-server"
      url="https://another-server.example.com/sse"
      authorization_token={process.env.AUTH_TOKEN}
      tool_configuration={{ 
        allowed_tools: ['tool_1', 'tool_2'],
        enabled: true 
      }}
    />
    */}

    <Message role="user">
      What tools do you have available? Please list them and demonstrate one.
    </Message>
  </Agent>,
)

console.log('\nResult:', result.content)
console.log('\nUsage:', result.usage)
