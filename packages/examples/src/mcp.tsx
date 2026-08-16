/**
 * MCP example — agentry connects to an MCP server as a client and exposes its
 * tools to the model.
 *
 * pi ships no MCP support by design, so agentry does the bridging: connect,
 * list the server's tools, and proxy each `tools/call`. The upside over a
 * provider-native connector is that this works on every provider pi supports.
 *
 * Run: bun run example:mcp
 */
import { run, Agent, System, Message, MCP } from 'agentry'
import { MODEL } from './constants'

const result = await run(
  <Agent provider="anthropic" model={MODEL} maxTokens={1024}>
    <System>
      You have access to filesystem tools from an MCP server. Use them to answer
      the question. Be concise.
    </System>

    {/* Any stdio MCP server works; tools arrive as `<name>__<tool>`. */}
    <MCP
      type="stdio"
      name="fs"
      command="bunx"
      args={['-y', '@modelcontextprotocol/server-filesystem', '/tmp']}
    />

    <Message role="user">
      List the entries in /tmp, then tell me how many there are.
    </Message>
  </Agent>,
)

console.log('\nResult:', result.content)
console.log('Usage:', result.usage)
