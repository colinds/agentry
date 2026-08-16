import { test, expect, beforeEach } from 'bun:test'
import { Type } from 'typebox'
import { run } from '../src'
import { toolResultText } from '../src/types/messages'
import { defineTool } from '../src/tools'
import { Agent, System, Context, Tools, Tool, Message, AgentTool } from '../src'
import { createStepMockModels, fauxText, fauxToolCall } from './utils'
import { ANTHROPIC_TEST_MODEL } from '../src/constants'

test('root agent sees pre-loaded JSX messages', async () => {
  const { models, controller } = createStepMockModels([
    { content: [fauxText('3+3 equals 6.')] },
  ])

  const runPromise = run(
    <Agent
      provider="anthropic"
      model={ANTHROPIC_TEST_MODEL}
      maxTokens={100}
      stream={false}
    >
      <System>You continue conversations</System>
      {/* pre-loaded conversation history */}
      <Message role="user">What is 2+2?</Message>
      <Message role="assistant">2+2 equals 4.</Message>
      <Message role="user">And what is 3+3?</Message>
    </Agent>,
    { models },
  )

  // wait for API call to be queued
  await controller.waitForNextCall()

  // check what messages were sent to the API
  const call = controller.peekNextCall()
  expect(call).not.toBeNull()

  const messages = call!.context.messages
  expect(messages.length).toBe(3)
  expect(messages[0]).toMatchObject({ role: 'user', content: 'What is 2+2?' })
  expect(messages[1]).toMatchObject({
    role: 'assistant',
    content: [{ type: 'text', text: '2+2 equals 4.' }],
  })
  expect(messages[2]).toMatchObject({ role: 'user', content: 'And what is 3+3?' })

  await controller.nextTurn()
  const result = await runPromise

  expect(result.content).toBe('3+3 equals 6.')
})

test('run creates an agent and executes in batch mode', async () => {
  const { models, controller } = createStepMockModels([
    { content: [fauxText('Hello, world!')] },
  ])

  const runPromise = run(
    <Agent
      provider="anthropic"
      model={ANTHROPIC_TEST_MODEL}
      maxTokens={100}
      maxIterations={1}
      stream={false}
    >
      <System>You are a test assistant. Be very brief.</System>
      <Message role="user">Say hello in 3 words</Message>
    </Agent>,
    { models },
  )

  await controller.nextTurn()
  const result = await runPromise

  expect(result).toBeDefined()
  expect(result.content).toBe('Hello, world!')
  // pi derives usage from the actual exchange rather than fixed mock values
  expect(result.usage.inputTokens).toBeGreaterThan(0)
  expect(result.usage.outputTokens).toBeGreaterThan(0)
  expect(result.usage.costUSD).toBeGreaterThanOrEqual(0)
  expect(result.stopReason).toBe('stop')
  expect(result.messages.length).toBeGreaterThanOrEqual(2)
})

test('run handles tools correctly', async () => {
  let toolCalled = false
  const testTool = defineTool({
    name: 'get_info',
    description: 'Get some information',
    parameters: Type.Object({
      query: Type.String(),
    }),
    handler: async ({ query }) => {
      toolCalled = true
      return `Info about: ${query}`
    },
  })

  const { models, controller } = createStepMockModels([
    {
      content: [fauxToolCall('get_info', { query: 'testing' })],
    },
    { content: [fauxText('I found info about testing.')] },
  ])

  const runPromise = run(
    <Agent
      provider="anthropic"
      model={ANTHROPIC_TEST_MODEL}
      maxTokens={500}
      stream={false}
    >
      <System>You are a test assistant. Use the get_info tool.</System>
      <Tools>
        <Tool {...testTool} />
      </Tools>
      <Message role="user">Use the tool to get info about testing</Message>
    </Agent>,
    { models },
  )

  await controller.nextTurn()
  await controller.waitForNextCall()
  await controller.nextTurn()
  const result = await runPromise

  expect(toolCalled).toBe(true)
  expect(result.content).toBe('I found info about testing.')
  expect(result.messages.length).toBeGreaterThan(2)
})

test('interactive mode allows multiple turns', async () => {
  const { models, controller } = createStepMockModels([
    { content: [fauxText('Hi there!')] },
    { content: [fauxText('One, two, three.')] },
  ])

  const agentPromise = run(
    <Agent
      provider="anthropic"
      model={ANTHROPIC_TEST_MODEL}
      maxTokens={200}
      stream={false}
    >
      <System>You are a test assistant. Be very concise.</System>
    </Agent>,
    { mode: 'interactive', models },
  )

  const agent = await agentPromise

  try {
    const sendPromise1 = agent.sendMessage('Say hi')
    await controller.nextTurn()
    const result1 = await sendPromise1
    expect(result1.content).toBe('Hi there!')

    expect(agent.messages.length).toBeGreaterThanOrEqual(2)

    // send second message
    const sendPromise2 = agent.sendMessage('Count to three')
    await controller.nextTurn()
    const result2 = await sendPromise2
    expect(result2.content).toBe('One, two, three.')

    // messages should have accumulated
    expect(agent.messages.length).toBeGreaterThanOrEqual(4)
  } finally {
    agent.close()
  }
})

test('stream() accepts message parameter for first turn', async () => {
  const { models, controller } = createStepMockModels([
    { content: [fauxText('Hi there!')] },
  ])

  const agentPromise = run(
    <Agent
      provider="anthropic"
      model={ANTHROPIC_TEST_MODEL}
      maxTokens={200}
      stream={false}
    >
      <System>You are a test assistant. Be very concise.</System>
    </Agent>,
    { mode: 'interactive', models },
  )

  const agent = await agentPromise

  try {
    const streamPromise = (async () => {
      for await (const _event of agent.stream('Say hi')) {
        void _event
      }
    })()
    await controller.nextTurn()
    await streamPromise

    expect(agent.messages.length).toBeGreaterThanOrEqual(2)
    expect(agent.messages[0]).toMatchObject({ role: 'user', content: 'Say hi' })
  } finally {
    agent.close()
  }
})

test('stream() works with message for subsequent turns', async () => {
  const { models, controller } = createStepMockModels([
    { content: [fauxText('Hi there!')] },
    { content: [fauxText('One, two, three.')] },
  ])

  const agentPromise = run(
    <Agent
      provider="anthropic"
      model={ANTHROPIC_TEST_MODEL}
      maxTokens={200}
      stream={false}
    >
      <System>You are a test assistant. Be very concise.</System>
    </Agent>,
    { mode: 'interactive', models },
  )

  const agent = await agentPromise

  try {
    const streamPromise1 = (async () => {
      for await (const _event of agent.stream('Say hi')) {
        void _event
      }
    })()
    await controller.nextTurn()
    await streamPromise1

    const streamPromise2 = (async () => {
      for await (const _event of agent.stream('Count to three')) {
        void _event
      }
    })()
    await controller.nextTurn()
    await streamPromise2

    expect(agent.messages.length).toBeGreaterThanOrEqual(4)
    expect(agent.messages[0]).toMatchObject({ role: 'user', content: 'Say hi' })
    expect(agent.messages[2]).toMatchObject({
      role: 'user',
      content: 'Count to three',
    })
  } finally {
    agent.close()
  }
})

test('handles multiple tool calls in sequence', async () => {
  let callCount = 0
  const counterTool = defineTool({
    name: 'increment',
    description: 'Increment the counter',
    parameters: Type.Object({}),
    handler: async () => {
      callCount++
      return `Counter is now ${callCount}`
    },
  })

  const { models, controller } = createStepMockModels([
    {
      content: [fauxToolCall('increment', {}, { id: 'tool_1' })],
    },
    {
      content: [fauxToolCall('increment', {}, { id: 'tool_2' })],
    },
    { content: [fauxText('Done! Counter is 2.')] },
  ])

  const runPromise = run(
    <Agent
      provider="anthropic"
      model={ANTHROPIC_TEST_MODEL}
      maxTokens={500}
      stream={false}
    >
      <Tools>
        <Tool {...counterTool} />
      </Tools>
      <Message role="user">Increment twice</Message>
    </Agent>,
    { models },
  )

  await controller.nextTurn()
  await controller.waitForNextCall()
  await controller.nextTurn()
  await controller.waitForNextCall()
  await controller.nextTurn()
  const result = await runPromise

  expect(callCount).toBe(2)
  expect(result.content).toBe('Done! Counter is 2.')
})

test('respects maxIterations limit', async () => {
  const { models, controller } = createStepMockModels([
    { content: [fauxToolCall('test', {})] },
    { content: [fauxToolCall('test', {})] },
    { content: [fauxToolCall('test', {})] },
  ])

  const tool = defineTool({
    name: 'test',
    description: 'test',
    parameters: Type.Object({}),
    handler: async () => 'ok',
  })

  const runPromise = run(
    <Agent
      provider="anthropic"
      model={ANTHROPIC_TEST_MODEL}
      maxTokens={100}
      maxIterations={3}
      stream={false}
    >
      <Tools>
        <Tool {...tool} />
      </Tools>
      <Message role="user">Test</Message>
    </Agent>,
    { models },
  )

  await controller.nextTurn()
  await controller.waitForNextCall()
  await controller.nextTurn()
  await controller.waitForNextCall()
  await controller.nextTurn()
  const result = await runPromise

  // should stop after maxIterations even if model keeps calling tools
  expect(result.stopReason).toBe('toolUse')
})

test('tool schemas in API requests are complete', async () => {
  const complexTool = defineTool({
    name: 'complex_operation',
    description: 'Perform a complex operation with nested data',
    parameters: Type.Object({
      operation: Type.Union(
        [
          Type.Literal('create'),
          Type.Literal('update'),
          Type.Literal('delete'),
          Type.Literal('query'),
        ],
        { description: 'the operation to perform' },
      ),
      priority: Type.Number({
        description: 'priority level',
        minimum: 1,
        maximum: 10,
      }),
      description: Type.Optional(
        Type.String({ description: 'optional description' }),
      ),
      metadata: Type.Object(
        {
          source: Type.String({ description: 'source identifier' }),
          tags: Type.Array(Type.String(), { description: 'array of tags' }),
          enabled: Type.Boolean({ description: 'whether enabled' }),
        },
        { description: 'metadata object' },
      ),
      config: Type.Optional(
        Type.Object(
          {
            timeout: Type.Number({ description: 'timeout in seconds' }),
            retries: Type.Number({
              description: 'number of retries',
              minimum: 0,
            }),
          },
          { description: 'optional configuration' },
        ),
      ),
      items: Type.Array(
        Type.Object({
          id: Type.String({ description: 'item id' }),
          value: Type.Number({ description: 'item value' }),
        }),
        { description: 'array of items' },
      ),
      status: Type.Union(
        [
          Type.Literal('active'),
          Type.Literal('inactive'),
          Type.Literal('pending'),
        ],
        { description: 'status value' },
      ),
    }),
    handler: async () => 'ok',
  })

  const { models, controller } = createStepMockModels([
    { content: [fauxText('Done')] },
  ])

  const runPromise = run(
    <Agent
      provider="anthropic"
      model={ANTHROPIC_TEST_MODEL}
      maxTokens={100}
      stream={false}
    >
      <System>You are a test assistant.</System>
      <Tools>
        <Tool {...complexTool} />
      </Tools>
      <Message role="user">Test</Message>
    </Agent>,
    { models },
  )

  await controller.waitForNextCall()

  const call = controller.peekNextCall()
  expect(call).not.toBeNull()
  expect(call!.context.tools).toBeDefined()
  expect(Array.isArray(call!.context.tools)).toBe(true)
  expect(call!.context.tools!.length).toBe(1)

  const toolDef = call!.context.tools![0]!

  expect(toolDef.name).toBe('complex_operation')
  expect(toolDef.description).toBe(
    'Perform a complex operation with nested data',
  )

  const inputSchema = toolDef.parameters as unknown as Record<string, unknown>
  expect(inputSchema.type).toBe('object')
  expect(inputSchema.properties).toBeDefined()
  expect(inputSchema.required).toBeDefined()

  expect(Bun.deepEquals(complexTool.jsonSchema, inputSchema)).toBe(true)

  await controller.nextTurn()
  await runPromise
})

test('batch mode errors when agent has no messages', async () => {
  const { models } = createStepMockModels([])

  await expect(
    run(
      <Agent provider="anthropic" model={ANTHROPIC_TEST_MODEL} maxTokens={100}>
        <System>You are helpful</System>
        {/* No <Message> components */}
      </Agent>,
      { models },
    ),
  ).rejects.toThrow('Agent has no messages. In batch mode')
})

test('interactive mode does NOT error when agent has no messages', async () => {
  const { models } = createStepMockModels([])

  const agent = await run(
    <Agent provider="anthropic" model={ANTHROPIC_TEST_MODEL} maxTokens={100}>
      <System>You are helpful</System>
    </Agent>,
    { models, mode: 'interactive' },
  )

  // should not throw - agent is created successfully
  expect(agent).toBeDefined()
  agent.close()
})

test('subagent errors when it has no messages', async () => {
  const SubAgent = () => (
    <Agent
      provider="anthropic"
      model={ANTHROPIC_TEST_MODEL}
      maxTokens={100}
      stream={false}
    >
      <System>I am a subagent</System>
      {/* No <Message> components - should trigger validation error */}
    </Agent>
  )

  const { models, controller } = createStepMockModels([
    {
      content: [fauxToolCall('subagent', {})],
    },
    // second response after tool error is returned
    { content: [fauxText('The subagent tool failed.')] },
  ])

  const runPromise = run(
    <Agent
      provider="anthropic"
      model={ANTHROPIC_TEST_MODEL}
      maxTokens={100}
      stream={false}
    >
      <System>You are helpful</System>
      <Tools>
        <AgentTool
          name="subagent"
          description="A subagent tool"
          parameters={Type.Object({})}
          agent={() => <SubAgent />}
        />
      </Tools>
      <Message role="user">Use the subagent</Message>
    </Agent>,
    { models },
  )

  await controller.nextTurn()
  await controller.nextTurn()

  const result = await runPromise

  // tool results are first-class messages under pi
  const toolResults = result.messages.filter((m) => m.role === 'toolResult')

  expect(toolResults.length).toBeGreaterThan(0)
  const first = toolResults[0]!
  expect(first.isError).toBe(true)
  expect(toolResultText(first)).toContain('Subagent has no messages')
})

test('system parts are joined into a single prompt in order', async () => {
  const { models, controller } = createStepMockModels([
    { content: [fauxText('ok')] },
  ])

  const runPromise = run(
    <Agent
      provider="anthropic"
      model={ANTHROPIC_TEST_MODEL}
      maxTokens={100}
      stream={false}
    >
      <System>First instruction</System>
      <Context>Some context</Context>
      <System>Second instruction</System>
      <Message role="user">Hi</Message>
    </Agent>,
    { models },
  )

  await controller.waitForNextCall()
  const call = controller.peekNextCall()

  // pi takes a single system string; caching is the provider's concern now
  expect(call!.context.systemPrompt).toBe(
    'First instruction\n\nSome context\n\nSecond instruction',
  )

  await controller.nextTurn()
  await runPromise
})

test('a single system part produces just that string', async () => {
  const { models, controller } = createStepMockModels([
    { content: [fauxText('ok')] },
  ])

  const runPromise = run(
    <Agent
      provider="anthropic"
      model={ANTHROPIC_TEST_MODEL}
      maxTokens={100}
      stream={false}
    >
      <System>Only instruction</System>
      <Message role="user">Hi</Message>
    </Agent>,
    { models },
  )

  await controller.waitForNextCall()
  expect(controller.peekNextCall()!.context.systemPrompt).toBe(
    'Only instruction',
  )

  await controller.nextTurn()
  await runPromise
})

test('strict tool requests constrained sampling', async () => {
  const strictTool = defineTool({
    name: 'strict_tool',
    description: 'A strict tool',
    parameters: Type.Object({ q: Type.String() }),
    strict: true,
    handler: async () => 'ok',
  })

  const { models, controller } = createStepMockModels([
    { content: [fauxText('ok')] },
  ])

  const runPromise = run(
    <Agent
      provider="anthropic"
      model={ANTHROPIC_TEST_MODEL}
      maxTokens={100}
      stream={false}
    >
      <System>Test</System>
      <Tools>
        <Tool {...strictTool} />
      </Tools>
      <Message role="user">Hi</Message>
    </Agent>,
    { models },
  )

  await controller.waitForNextCall()
  const tool = controller.peekNextCall()!.context.tools![0]!

  // 'prefer' degrades to a normal tool call where the provider lacks grammar support
  expect(tool.constrainedSampling).toEqual({
    type: 'json_schema',
    strict: 'prefer',
  })
  expect(
    (tool.parameters as unknown as Record<string, unknown>)
      .additionalProperties,
  ).toBe(false)

  await controller.nextTurn()
  await runPromise
})

test('thinking prop is passed through as a reasoning level', async () => {
  const { models, controller } = createStepMockModels([
    { content: [fauxText('ok')] },
  ])

  const runPromise = run(
    <Agent
      provider="anthropic"
      model={ANTHROPIC_TEST_MODEL}
      maxTokens={100}
      stream={false}
      thinking="high"
    >
      <System>Test</System>
      <Message role="user">Hi</Message>
    </Agent>,
    { models },
  )

  await controller.waitForNextCall()
  expect(controller.peekNextCall()!.options?.reasoning).toBe('high')

  await controller.nextTurn()
  await runPromise
})

test('provider prop omission throws correct error', async () => {
  const { models } = createStepMockModels([])

  await expect(
    run(
      // @ts-expect-error intentionally missing provider to test runtime error
      <Agent model={ANTHROPIC_TEST_MODEL} stream={false}>
        <Message role="user">Hello</Message>
      </Agent>,
      { models },
    ),
  ).rejects.toThrow('Provider is required on the rendered agent.')
})


test('non-streaming: onMessage fires text and message_complete events', async () => {
  const eventTypes: string[] = []

  const { models, controller } = createStepMockModels([
    { content: [fauxText('Hello from Anthropic')] },
  ])

  const runPromise = run(
    <Agent
      provider="anthropic"
      model={ANTHROPIC_TEST_MODEL}
      stream={false}
      onMessage={(event) => {
        eventTypes.push(event.type)
      }}
    >
      <Message role="user">Hello</Message>
    </Agent>,
    { models },
  )

  await controller.nextTurn()
  const result = await runPromise

  expect(result.content).toBe('Hello from Anthropic')
  expect(eventTypes).toContain('text')
  expect(eventTypes).toContain('message_complete')
  expect(eventTypes[eventTypes.length - 1]).toBe('message_complete')
})

test('non-streaming: multiple text blocks accumulate correctly', async () => {
  const events: Array<{ type: string; text?: string; accumulated?: string }> =
    []

  const { models, controller } = createStepMockModels([
    { content: [fauxText('Hello '), fauxText('world')] },
  ])

  const runPromise = run(
    <Agent
      provider="anthropic"
      model={ANTHROPIC_TEST_MODEL}
      stream={false}
      onMessage={(event) => {
        if (event.type === 'text') {
          events.push({
            type: 'text',
            text: event.text,
            accumulated: event.accumulated,
          })
        }
      }}
    >
      <Message role="user">Hello</Message>
    </Agent>,
    { models },
  )

  await controller.nextTurn()
  await runPromise

  expect(events).toHaveLength(2)
  expect(events[0]!.accumulated).toBe('Hello ')
  expect(events[1]!.accumulated).toBe('Hello world')
})

test('non-streaming: thinking events fire', async () => {
  const events: Array<{ type: string; text?: string }> = []

  const { models, controller } = createStepMockModels([
    {
      content: [
        {
          type: 'thinking',
          thinking: 'Let me think...',
          citations: null,
        } as never,
        fauxText('Answer'),
      ],
    },
  ])

  const runPromise = run(
    <Agent
      provider="anthropic"
      model={ANTHROPIC_TEST_MODEL}
      stream={false}
      onMessage={(event) => {
        events.push({
          type: event.type,
          text: 'text' in event ? event.text : undefined,
        })
      }}
    >
      <Message role="user">Think about this</Message>
    </Agent>,
    { models },
  )

  await controller.nextTurn()
  await runPromise

  const types = events.map((e) => e.type)
  expect(types).toEqual(['thinking', 'text', 'message_complete'])
  expect(events[0]!.text).toBe('Let me think...')
})

test('non-streaming: event order is content-blocks then message_complete', async () => {
  const eventTypes: string[] = []

  const { models, controller } = createStepMockModels([
    {
      content: [fauxText('Hi'), fauxToolCall('search', { q: 'test' })],
    },
    { content: [fauxText('Done')] },
  ])

  const runPromise = run(
    <Agent
      provider="anthropic"
      model={ANTHROPIC_TEST_MODEL}
      stream={false}
      onMessage={(event) => {
        eventTypes.push(event.type)
      }}
    >
      <Tools>
        <Tool
          name="search"
          description="search"
          parameters={Type.Object({ q: Type.String() })}
          handler={async () => 'result'}
        />
      </Tools>
      <Message role="user">Search</Message>
    </Agent>,
    { models },
  )

  await controller.nextTurn()
  await controller.waitForNextCall()
  await controller.nextTurn()
  await runPromise

  // First turn: text, tool_use_start, message_complete
  // Then tool_result event from engine
  // Second turn: text, message_complete
  expect(eventTypes[0]).toBe('text')
  expect(eventTypes[1]).toBe('tool_use_start')
  expect(eventTypes[2]).toBe('message_complete')
})

test('streaming: text and message_complete events fire', async () => {
  const eventTypes: string[] = []
  let lastAccumulated = ''

  const { models, controller } = createStepMockModels([
    { content: [fauxText('Streamed text')] },
  ])

  const runPromise = run(
    <Agent
      provider="anthropic"
      model={ANTHROPIC_TEST_MODEL}
      stream={true}
      onMessage={(event) => {
        eventTypes.push(event.type)
        if (event.type === 'text') lastAccumulated = event.accumulated
      }}
    >
      <Message role="user">Hello</Message>
    </Agent>,
    { models },
  )

  await controller.nextTurn()
  await runPromise

  expect(eventTypes).toContain('text')
  expect(eventTypes).toContain('message_complete')
  expect(eventTypes[eventTypes.length - 1]).toBe('message_complete')
  expect(lastAccumulated).toBe('Streamed text')
})

test('async onStepFinish is awaited before next iteration', async () => {
  const order: string[] = []

  const { models, controller } = createStepMockModels([
    {
      content: [fauxToolCall('myTool', { x: 1 })],
    },
    { content: [fauxText('Done')] },
  ])

  const runPromise = run(
    <Agent
      provider="anthropic"
      model={ANTHROPIC_TEST_MODEL}
      stream={false}
      onStepFinish={async () => {
        order.push('stepFinish:start')
        await new Promise((r) => setTimeout(r, 10))
        order.push('stepFinish:end')
      }}
    >
      <Tools>
        <Tool
          name="myTool"
          description="test"
          parameters={Type.Object({ x: Type.Number() })}
          handler={async () => {
            order.push('tool:executed')
            return 'ok'
          }}
        />
      </Tools>
      <Message role="user">Go</Message>
    </Agent>,
    { models },
  )

  await controller.nextTurn()
  await controller.waitForNextCall()
  await controller.nextTurn()
  await runPromise

  // The async onStepFinish should complete before the next API call
  const toolIdx = order.indexOf('tool:executed')
  const stepStartIdx = order.indexOf('stepFinish:start')
  const stepEndIdx = order.indexOf('stepFinish:end')
  expect(stepStartIdx).toBeGreaterThan(toolIdx)
  expect(stepEndIdx).toBeGreaterThan(stepStartIdx)
})

test('thinking blocks with signatures survive in replayed history', async () => {
  const { models, controller } = createStepMockModels([
    {
      content: [
        { type: 'thinking', thinking: 'reasoning...', thinkingSignature: 'sig-1' },
        fauxToolCall('echo', { msg: 'hello' }),
      ],
    },
    { content: [fauxText('Done')] },
  ])

  const runPromise = run(
    <Agent provider="anthropic" model={ANTHROPIC_TEST_MODEL} stream={false}>
      <Tools>
        <Tool
          name="echo"
          description="Echo a message"
          parameters={Type.Object({ msg: Type.String() })}
          handler={async ({ msg }) => msg}
        />
      </Tools>
      <Message role="user">Use the echo tool</Message>
    </Agent>,
    { models },
  )

  await controller.nextTurn()
  await controller.waitForNextCall()

  // Second turn replays the assistant turn; the thinking block and its
  // signature are preserved rather than dropped as they were pre-pi.
  const replayed = controller.peekNextCall()!.context.messages
  const assistant = replayed.find((m) => m.role === 'assistant')!
  const thinking = assistant.content.find((b) => b.type === 'thinking')

  expect(thinking).toBeDefined()
  expect(thinking && 'thinkingSignature' in thinking && thinking.thinkingSignature).toBe('sig-1')

  await controller.nextTurn()
  await runPromise
})
