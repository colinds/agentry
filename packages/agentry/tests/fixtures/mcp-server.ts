#!/usr/bin/env bun
/**
 * Minimal stdio MCP server used by the MCP integration test.
 *
 * Kept dependency-free (beyond the MCP SDK agentry already ships with) so the
 * test exercises a real client/server handshake without reaching the network.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

const server = new Server(
  { name: 'agentry-test-server', version: '1.0.0' },
  { capabilities: { tools: {} } },
)

// Set MCP_FIXTURE_FAIL_LIST=1 to make tools/list reject after a successful
// handshake — the shape that used to leave this process running forever.
server.setRequestHandler(ListToolsRequestSchema, async () => {
  if (process.env.MCP_FIXTURE_FAIL_LIST === '1') {
    throw new Error('deliberate tools/list failure')
  }
  return listToolsResult()
})

function listToolsResult() {
  return ({
  tools: [
    {
      name: 'add',
      description: 'Add two numbers together',
      inputSchema: {
        type: 'object',
        properties: {
          a: { type: 'number', description: 'first number' },
          b: { type: 'number', description: 'second number' },
        },
        required: ['a', 'b'],
      },
    },
    {
      name: 'echo',
      description: 'Echo a message back',
      inputSchema: {
        type: 'object',
        properties: { message: { type: 'string' } },
        required: ['message'],
      },
    },
    {
      name: 'always_fails',
      description: 'Always returns an error result',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
})
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  if (name === 'add') {
    const a = Number((args as { a: number }).a)
    const b = Number((args as { b: number }).b)
    return { content: [{ type: 'text', text: String(a + b) }] }
  }

  if (name === 'echo') {
    return {
      content: [{ type: 'text', text: (args as { message: string }).message }],
    }
  }

  if (name === 'always_fails') {
    return {
      content: [{ type: 'text', text: 'deliberate failure' }],
      isError: true,
    }
  }

  throw new Error(`Unknown tool: ${name}`)
})

await server.connect(new StdioServerTransport())
