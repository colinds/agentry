import { test, expect } from 'bun:test'
import { z } from 'zod'
import { run } from '../src/index.ts'
import { defineTool } from '@agentry/core/tools'
import {
  Agent,
  System,
  Tools,
  Tool,
  Message,
  AgentTool,
} from '@agentry/components'
import {
  createStepMockClient,
  mockText,
  mockToolUse,
} from '@agentry/core/test-utils'
import { TEST_MODEL } from '@agentry/shared'

test('root agent sees pre-loaded JSX messages', async () => {
  const { client, controller } = createStepMockClient([
    { content: [mockText('3+3 equals 6.')] },
  ])

  const runPromise = run(
    <Agent model={TEST_MODEL} maxTokens={100} stream={false}>
      <System>You continue conversations</System>
      {/* pre-loaded conversation history */}
      <Message role="user">What is 2+2?</Message>
      <Message role="assistant">2+2 equals 4.</Message>
      <Message role="user">And what is 3+3?</Message>
    </Agent>,
    { client },
  )

  // wait for API call to be queued
  await controller.waitForNextCall()

  // check what messages were sent to the API
  const call = controller.peekNextCall()
  expect(call).not.toBeNull()

  const messages = call!.params.messages
  expect(messages.length).toBe(3)
  expect(messages[0]).toEqual({ role: 'user', content: 'What is 2+2?' })
  expect(messages[1]).toEqual({ role: 'assistant', content: '2+2 equals 4.' })
  expect(messages[2]).toEqual({ role: 'user', content: 'And what is 3+3?' })

  await controller.nextTurn()
  const result = await runPromise

  expect(result.content).toBe('3+3 equals 6.')
})

test('run creates an agent and executes in batch mode', async () => {
  const { client, controller } = createStepMockClient([
    { content: [mockText('Hello, world!')] },
  ])

  const runPromise = run(
    <Agent model={TEST_MODEL} maxTokens={100} maxIterations={1} stream={false}>
      <System>You are a test assistant. Be very brief.</System>
      <Message role="user">Say hello in 3 words</Message>
    </Agent>,
    { client },
  )

  await controller.nextTurn()
  const result = await runPromise

  expect(result).toBeDefined()
  expect(result.content).toBe('Hello, world!')
  expect(result.usage.inputTokens).toBe(100)
  expect(result.usage.outputTokens).toBe(50)
  expect(result.stopReason).toBe('end_turn')
  expect(result.messages.length).toBeGreaterThanOrEqual(2)
})

test('run handles tools correctly', async () => {
  let toolCalled = false
  const testTool = defineTool({
    name: 'get_info',
    description: 'Get some information',
    parameters: z.object({
      query: z.string(),
    }),
    handler: async ({ query }) => {
      toolCalled = true
      return `Info about: ${query}`
    },
  })

  const { client, controller } = createStepMockClient([
    {
      content: [mockToolUse('get_info', { query: 'testing' })],
      stop_reason: 'tool_use',
    },
    { content: [mockText('I found info about testing.')] },
  ])

  const runPromise = run(
    <Agent model={TEST_MODEL} maxTokens={500} stream={false}>
      <System>You are a test assistant. Use the get_info tool.</System>
      <Tools>
        <Tool {...testTool} />
      </Tools>
      <Message role="user">Use the tool to get info about testing</Message>
    </Agent>,
    { client },
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
  const { client, controller } = createStepMockClient([
    { content: [mockText('Hi there!')] },
    { content: [mockText('One, two, three.')] },
  ])

  const agentPromise = run(
    <Agent model={TEST_MODEL} maxTokens={200} stream={false}>
      <System>You are a test assistant. Be very concise.</System>
    </Agent>,
    { mode: 'interactive', client },
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
  const { client, controller } = createStepMockClient([
    { content: [mockText('Hi there!')] },
  ])

  const agentPromise = run(
    <Agent model={TEST_MODEL} maxTokens={200} stream={false}>
      <System>You are a test assistant. Be very concise.</System>
    </Agent>,
    { mode: 'interactive', client },
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
  const { client, controller } = createStepMockClient([
    { content: [mockText('Hi there!')] },
    { content: [mockText('One, two, three.')] },
  ])

  const agentPromise = run(
    <Agent model={TEST_MODEL} maxTokens={200} stream={false}>
      <System>You are a test assistant. Be very concise.</System>
    </Agent>,
    { mode: 'interactive', client },
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
    parameters: z.object({}),
    handler: async () => {
      callCount++
      return `Counter is now ${callCount}`
    },
  })

  const { client, controller } = createStepMockClient([
    {
      content: [mockToolUse('increment', {}, 'tool_1')],
      stop_reason: 'tool_use',
    },
    {
      content: [mockToolUse('increment', {}, 'tool_2')],
      stop_reason: 'tool_use',
    },
    { content: [mockText('Done! Counter is 2.')] },
  ])

  const runPromise = run(
    <Agent model={TEST_MODEL} maxTokens={500} stream={false}>
      <Tools>
        <Tool {...counterTool} />
      </Tools>
      <Message role="user">Increment twice</Message>
    </Agent>,
    { client },
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
  const { client, controller } = createStepMockClient([
    { content: [mockToolUse('test', {})], stop_reason: 'tool_use' },
    { content: [mockToolUse('test', {})], stop_reason: 'tool_use' },
    { content: [mockToolUse('test', {})], stop_reason: 'tool_use' },
  ])

  const tool = defineTool({
    name: 'test',
    description: 'test',
    parameters: z.object({}),
    handler: async () => 'ok',
  })

  const runPromise = run(
    <Agent model={TEST_MODEL} maxTokens={100} maxIterations={3} stream={false}>
      <Tools>
        <Tool {...tool} />
      </Tools>
      <Message role="user">Test</Message>
    </Agent>,
    { client },
  )

  await controller.nextTurn()
  await controller.waitForNextCall()
  await controller.nextTurn()
  await controller.waitForNextCall()
  await controller.nextTurn()
  const result = await runPromise

  // should stop after maxIterations even if model keeps calling tools
  expect(result.stopReason).toBe('tool_use')
})

test('tool schemas in API requests are complete', async () => {
  const complexTool = defineTool({
    name: 'complex_operation',
    description: 'Perform a complex operation with nested data',
    parameters: z.object({
      operation: z
        .enum(['create', 'update', 'delete', 'query'])
        .describe('the operation to perform'),
      priority: z.number().int().min(1).max(10).describe('priority level'),
      description: z.string().optional().describe('optional description'),
      metadata: z
        .object({
          source: z.string().describe('source identifier'),
          tags: z.array(z.string()).describe('array of tags'),
          enabled: z.boolean().describe('whether enabled'),
        })
        .describe('metadata object'),
      config: z
        .object({
          timeout: z.number().describe('timeout in seconds'),
          retries: z.number().int().min(0).describe('number of retries'),
        })
        .optional()
        .describe('optional configuration'),
      items: z
        .array(
          z.object({
            id: z.string().describe('item id'),
            value: z.number().describe('item value'),
          }),
        )
        .describe('array of items'),
      status: z
        .union([
          z.literal('active'),
          z.literal('inactive'),
          z.literal('pending'),
        ])
        .describe('status value'),
    }),
    handler: async () => 'ok',
  })

  const { client, controller } = createStepMockClient([
    { content: [mockText('Done')] },
  ])

  const runPromise = run(
    <Agent model={TEST_MODEL} maxTokens={100} stream={false}>
      <System>You are a test assistant.</System>
      <Tools>
        <Tool {...complexTool} />
      </Tools>
      <Message role="user">Test</Message>
    </Agent>,
    { client },
  )

  await controller.waitForNextCall()

  const call = controller.peekNextCall()
  expect(call).not.toBeNull()
  expect(call!.params.tools).toBeDefined()
  expect(Array.isArray(call!.params.tools)).toBe(true)
  expect(call!.params.tools!.length).toBe(1)

  const toolDef = call!.params.tools![0] as {
    type: string
    name: string
    description: string
    input_schema: Record<string, unknown>
  }

  expect(toolDef.type).toBe('custom')
  expect(toolDef.name).toBe('complex_operation')
  expect(toolDef.description).toBe(
    'Perform a complex operation with nested data',
  )

  const inputSchema = toolDef.input_schema
  expect(inputSchema.type).toBe('object')
  expect(inputSchema.properties).toBeDefined()
  expect(inputSchema.required).toBeDefined()

  expect(Bun.deepEquals(complexTool.jsonSchema, inputSchema)).toBe(true)

  await controller.nextTurn()
  await runPromise
})

test('batch mode errors when agent has no messages', async () => {
  const { client } = createStepMockClient([])

  await expect(
    run(
      <Agent model={TEST_MODEL} maxTokens={100}>
        <System>You are helpful</System>
        {/* No <Message> components */}
      </Agent>,
      { client },
    ),
  ).rejects.toThrow('Agent has no messages. In batch mode')
})

test('interactive mode does NOT error when agent has no messages', async () => {
  const { client } = createStepMockClient([])

  const agent = await run(
    <Agent model={TEST_MODEL} maxTokens={100}>
      <System>You are helpful</System>
    </Agent>,
    { client, mode: 'interactive' },
  )

  // should not throw - agent is created successfully
  expect(agent).toBeDefined()
  agent.close()
})

test('subagent errors when it has no messages', async () => {
  const SubAgent = () => (
    <Agent model={TEST_MODEL} maxTokens={100} stream={false}>
      <System>I am a subagent</System>
      {/* No <Message> components - should trigger validation error */}
    </Agent>
  )

  const { client, controller } = createStepMockClient([
    {
      content: [mockToolUse('subagent', {})],
      stop_reason: 'tool_use',
    },
    // second response after tool error is returned
    { content: [mockText('The subagent tool failed.')] },
  ])

  const runPromise = run(
    <Agent model={TEST_MODEL} maxTokens={100} stream={false}>
      <System>You are helpful</System>
      <Tools>
        <AgentTool
          name="subagent"
          description="A subagent tool"
          parameters={z.object({})}
          agent={() => <SubAgent />}
        />
      </Tools>
      <Message role="user">Use the subagent</Message>
    </Agent>,
    { client },
  )

  await controller.nextTurn()
  await controller.nextTurn()

  const result = await runPromise

  // tool should have error result
  const toolMessages = result.messages.filter(
    (m) => m.role === 'user' && 'content' in m && Array.isArray(m.content),
  )
  const toolResults = toolMessages.flatMap((m) =>
    Array.isArray(m.content)
      ? m.content.filter((c) => c.type === 'tool_result')
      : [],
  )

  expect(toolResults.length).toBeGreaterThan(0)
  expect(toolResults[0]?.is_error).toBe(true)
  expect(toolResults[0]?.content).toContain('Subagent has no messages')
})
