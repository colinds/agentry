/**
 * MCP (Model Context Protocol) Server Example
 *
 * This example demonstrates how to connect to MCP servers using Anthropic's
 * native MCP support. MCP servers provide tools that Claude can use during
 * conversations - the server connection is handled server-side by Anthropic.
 *
 * This example uses Cloudflare's public demo MCP server.
 */

import { createAI, Agent, System, Message } from 'agentry'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { MCP as AnthropicMCP } from 'agentry/anthropic'
import { MCP as OpenAIMCP } from 'agentry/openai'
import { MODEL, OPENAI_MODEL } from './constants'

const EXAMPLE_PROVIDER =
  process.env.EXAMPLE_PROVIDER === 'openai' ? 'openai' : 'anthropic'
const MCP = EXAMPLE_PROVIDER === 'openai' ? OpenAIMCP : AnthropicMCP
const EXAMPLE_MODEL = EXAMPLE_PROVIDER === 'openai' ? OPENAI_MODEL : MODEL
const ai =
  EXAMPLE_PROVIDER === 'openai'
    ? createAI({ providers: { openai: { client: new OpenAI() } } })
    : createAI({
        providers: { anthropic: { client: new Anthropic() } },
      })

const MCP_SERVER_URL = 'https://demo-day.mcp.cloudflare.com/sse'

console.log('Using MCP server:', MCP_SERVER_URL)
console.log(`Provider: ${EXAMPLE_PROVIDER}`)

const mcpAgent = (
  <Agent provider={EXAMPLE_PROVIDER} model={EXAMPLE_MODEL} maxTokens={4096}>
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
  </Agent>
)

const result = await ai.run(mcpAgent)

console.log('\nResult:', result.content)
console.log('\nUsage:', result.usage)
