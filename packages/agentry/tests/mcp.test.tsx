import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { connectMcpServer, mcpToolName } from '../src/mcp'
import type { MCPServerConfig } from '../src/mcp'
import { useState } from 'react'
import {
  run,
  createAgent,
  Type,
  Agent,
  System,
  Tools,
  Tool,
  Message,
  MCP,
} from '../src'
import { createStepMockModels, fauxText, fauxToolCall } from './utils'
import { ANTHROPIC_TEST_MODEL } from './constants'
import type { ToolContext } from '../src/types'

const SERVER: MCPServerConfig = {
  type: 'stdio',
  name: 'test',
  command: 'bun',
  args: [join(import.meta.dir, 'fixtures', 'mcp-server.ts')],
}

const toolContext = {} as ToolContext

describe('MCP client bridge', () => {
  test('discovers a real server’s tools and namespaces them', async () => {
    const connection = await connectMcpServer(SERVER)
    try {
      const names = connection.tools.map((t) => t.name).sort()
      expect(names).toEqual([
        'test__add',
        'test__always_fails',
        'test__echo',
      ])
    } finally {
      await connection.close()
    }
  })

  test('passes the server JSON Schema through untouched', async () => {
    const connection = await connectMcpServer(SERVER)
    try {
      const add = connection.tools.find((t) => t.name === 'test__add')!
      expect(add.description).toBe('Add two numbers together')
      expect(add.jsonSchema).toMatchObject({
        type: 'object',
        properties: {
          a: { type: 'number' },
          b: { type: 'number' },
        },
        required: ['a', 'b'],
      })
    } finally {
      await connection.close()
    }
  })

  test('proxies tools/call and returns the text result', async () => {
    const connection = await connectMcpServer(SERVER)
    try {
      const add = connection.tools.find((t) => t.name === 'test__add')!
      expect(await add.handler({ a: 17, b: 23 }, toolContext)).toBe('40')

      const echo = connection.tools.find((t) => t.name === 'test__echo')!
      expect(await echo.handler({ message: 'hello mcp' }, toolContext)).toBe(
        'hello mcp',
      )
    } finally {
      await connection.close()
    }
  })

  test('surfaces server-side tool errors as recoverable strings', async () => {
    const connection = await connectMcpServer(SERVER)
    try {
      const failing = connection.tools.find(
        (t) => t.name === 'test__always_fails',
      )!
      const result = await failing.handler({}, toolContext)
      expect(String(result)).toContain('Error from MCP tool "always_fails"')
      expect(String(result)).toContain('deliberate failure')
    } finally {
      await connection.close()
    }
  })

  test('allowed_tools filters what gets registered', async () => {
    const connection = await connectMcpServer({
      ...SERVER,
      tool_configuration: { allowed_tools: ['add'] },
    })
    try {
      expect(connection.tools.map((t) => t.name)).toEqual(['test__add'])
    } finally {
      await connection.close()
    }
  })

  test('enabled: false connects but registers nothing', async () => {
    const connection = await connectMcpServer({
      ...SERVER,
      tool_configuration: { enabled: false },
    })
    try {
      expect(connection.tools).toEqual([])
    } finally {
      await connection.close()
    }
  })

  test('a failed connection names the server', async () => {
    await expect(
      connectMcpServer({
        type: 'stdio',
        name: 'broken',
        command: 'definitely-not-a-real-command-xyz',
      }),
    ).rejects.toThrow(/MCP server "broken"/)
  })

  test('a tool honours the calling turn’s abort signal', async () => {
    // Must come off the ToolContext: a connect-time signal would be stale,
    // since connections outlive the turn that opened them.
    const connection = await connectMcpServer(SERVER)
    try {
      const add = connection.tools.find((t) => t.name === 'test__add')!
      const aborted = AbortSignal.abort()

      await expect(
        add.handler({ a: 1, b: 2 }, { signal: aborted } as ToolContext),
      ).rejects.toThrow(/Aborted/)

      // Still usable with a live signal — the check is per call, not sticky.
      expect(
        await add.handler({ a: 1, b: 2 }, {
          signal: new AbortController().signal,
        } as ToolContext),
      ).toBe('3')
    } finally {
      await connection.close()
    }
  })

  test('mcpToolName namespaces by server', () => {
    expect(mcpToolName('fs', 'read_file')).toBe('fs__read_file')
  })
})

describe('<MCP> in an agent', () => {
  test('server tools reach the model and execute end to end', async () => {
    const { models, controller } = createStepMockModels([
      { content: [fauxToolCall('test__add', { a: 2, b: 3 })] },
      { content: [fauxText('The answer is 5')] },
    ])

    const runPromise = run(
      <Agent
        provider="anthropic"
        model={ANTHROPIC_TEST_MODEL}
        maxTokens={100}
        stream={false}
      >
        <System>You can use MCP tools.</System>
        <MCP {...SERVER} />
        <Message role="user">What is 2 + 3?</Message>
      </Agent>,
      { models },
    )

    // The MCP server is connected before the first call, so its tools are
    // already on the request.
    await controller.waitForNextCall()
    const toolNames = controller
      .peekNextCall()!
      .context.tools!.map((t) => t.name)
    expect(toolNames).toContain('test__add')
    expect(toolNames).toContain('test__echo')

    await controller.nextTurn()
    await controller.waitForNextCall()

    // The tool result came back from the real MCP subprocess.
    const replayed = controller.peekNextCall()!.context.messages
    const toolResult = replayed.find((m) => m.role === 'toolResult')
    expect(toolResult).toBeDefined()

    await controller.nextTurn()
    const result = await runPromise
    expect(result.content).toBe('The answer is 5')
  })
})

describe('MCP connection lifecycle', () => {
  test('a server leaving the tree is disconnected and its tools withdrawn', async () => {
    // A <Condition> deactivating removes the server from the tree. The engine
    // must drop the connection and stop offering its tools, or the model keeps
    // seeing tools that can no longer be executed.
    const { models, controller } = createStepMockModels([
      { content: [fauxToolCall('toggle', {})] },
      { content: [fauxText('done')] },
    ])

    function App() {
      const [mcpOn, setMcpOn] = useState(true)
      return (
        <Agent
          provider="anthropic"
          model={ANTHROPIC_TEST_MODEL}
          maxTokens={100}
          stream={false}
        >
          <System>Test</System>
          <Tools>
            <Tool
              name="toggle"
              description="Turn the MCP server off"
              parameters={Type.Object({})}
              handler={() => {
                setMcpOn(false)
                return 'off'
              }}
            />
          </Tools>
          {mcpOn ? <MCP {...SERVER} /> : null}
          <Message role="user">Toggle it</Message>
        </Agent>
      )
    }

    const runPromise = run(<App />, { models })

    await controller.waitForNextCall()
    expect(
      controller.peekNextCall()!.context.tools!.map((t) => t.name),
    ).toContain('test__add')

    await controller.nextTurn()

    await controller.waitForNextCall()
    const names = controller.peekNextCall()!.context.tools!.map((t) => t.name)
    expect(names).not.toContain('test__add')
    expect(names).toContain('toggle')

    await controller.nextTurn()
    await runPromise
  })

  test('a server whose config changes under the same name is reconnected', async () => {
    // Keying connections on name alone would keep serving the old server's
    // tools after the config that produced them changed.
    const { models, controller } = createStepMockModels([
      { content: [fauxToolCall('restrict', {})] },
      { content: [fauxText('done')] },
    ])

    function App() {
      const [restricted, setRestricted] = useState(false)
      return (
        <Agent
          provider="anthropic"
          model={ANTHROPIC_TEST_MODEL}
          maxTokens={100}
          stream={false}
        >
          <System>Test</System>
          <Tools>
            <Tool
              name="restrict"
              description="Narrow the server to one tool"
              parameters={Type.Object({})}
              handler={() => {
                setRestricted(true)
                return 'restricted'
              }}
            />
          </Tools>
          <MCP
            {...SERVER}
            tool_configuration={
              restricted ? { allowed_tools: ['add'] } : undefined
            }
          />
          <Message role="user">Go</Message>
        </Agent>
      )
    }

    const runPromise = run(<App />, { models })

    await controller.waitForNextCall()
    const before = controller.peekNextCall()!.context.tools!.map((t) => t.name)
    expect(before).toContain('test__add')
    expect(before).toContain('test__echo')

    await controller.nextTurn()

    await controller.waitForNextCall()
    const after = controller.peekNextCall()!.context.tools!.map((t) => t.name)
    expect(after).toContain('test__add')
    // allowed_tools is applied at connect time, so this needs a real reconnect
    expect(after).not.toContain('test__echo')

    await controller.nextTurn()
    await runPromise
  })

  /** The handle's cross-run state, for asserting on connection lifetime. */
  function sessionOf(handle: object) {
    return (
      handle as unknown as {
        session: {
          mcpConnections: {
            size: number
            entries: Map<string, { connection: object }>
          }
        }
      }
    ).session
  }

  test('connections are reused across runs, not rebuilt per message', async () => {
    // A fresh engine is built per run. When it owned the connection set, every
    // sendMessage reconnected each server and orphaned the previous ones.
    const { models, controller } = createStepMockModels([
      { content: [fauxText('a')] },
      { content: [fauxText('b')] },
      { content: [fauxText('c')] },
    ])

    const handle = createAgent(
      <Agent
        provider="anthropic"
        model={ANTHROPIC_TEST_MODEL}
        maxTokens={100}
        stream={false}
      >
        <System>Test</System>
        <MCP {...SERVER} />
        <Message role="user">Hi</Message>
      </Agent>,
      { models },
    )

    const seen = new Set<object>()
    for (let i = 0; i < 3; i++) {
      const runPromise = handle.run()
      await controller.nextTurn()
      await runPromise

      const session = sessionOf(handle)
      expect(session.mcpConnections.size).toBe(1)
      seen.add(session.mcpConnections.entries.get('test')!.connection)
    }

    // A reconnect would add a second identity even with the count still at 1
    expect(seen.size).toBe(1)

    handle.close()
    await new Promise((r) => setTimeout(r, 50))
    expect(sessionOf(handle).mcpConnections.size).toBe(0)
  })

  test('closing the handle tears down connections', async () => {
    const { models, controller } = createStepMockModels([
      { content: [fauxText('ok')] },
    ])

    const handle = createAgent(
      <Agent
        provider="anthropic"
        model={ANTHROPIC_TEST_MODEL}
        maxTokens={100}
        stream={false}
      >
        <System>Test</System>
        <MCP {...SERVER} />
        <Message role="user">Hi</Message>
      </Agent>,
      { models },
    )

    const runPromise = handle.run()
    await controller.nextTurn()
    await runPromise

    // Reach the live set so this asserts teardown actually happened rather
    // than merely that close() did not throw.
    const connections = sessionOf(handle).mcpConnections
    expect(connections.size).toBe(1)

    handle.close()
    // close() fires teardown without awaiting it; give the microtask a turn.
    await new Promise((r) => setTimeout(r, 50))

    expect(connections.size).toBe(0)
  })
})
