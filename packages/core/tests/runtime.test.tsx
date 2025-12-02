import { test, expect } from 'bun:test'
import { z } from 'zod'
import { render, defineTool } from '../src/index.ts'
import { Agent, System, Tools, Tool, Message } from '@agentry/components'
import { createStepMockClient, mockText, mockToolUse } from '@agentry/core'
import { TEST_MODEL } from '@agentry/shared'

test('root agent sees pre-loaded JSX messages', async () => {
  const { client, controller } = createStepMockClient([
    { content: [mockText('3+3 equals 6.')] },
  ])

  const runPromise = render(
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

test('render creates an agent and executes in batch mode', async () => {
  const { client, controller } = createStepMockClient([
    { content: [mockText('Hello, world!')] },
  ])

  const runPromise = render(
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

test('render handles tools correctly', async () => {
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

  const runPromise = render(
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

  const agentPromise = render(
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

  const agentPromise = render(
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

  const agentPromise = render(
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

test('stream() throws error when called without message on first turn', async () => {
  const { client } = createStepMockClient([])

  const agentPromise = render(
    <Agent model={TEST_MODEL} maxTokens={200} stream={false}>
      <System>You are a test assistant. Be very concise.</System>
    </Agent>,
    { mode: 'interactive', client },
  )

  const agent = await agentPromise

  try {
    let errorThrown = false
    try {
      for await (const event of agent.stream()) {
        void event
        // should not reach here
      }
    } catch (error: unknown) {
      errorThrown = true
      const err = error as Error
      expect(err.message).toContain('stream() requires a message parameter')
    }
    expect(errorThrown).toBe(true)
  } finally {
    agent.close()
  }
})

test('stream() throws error when called without message on subsequent turns', async () => {
  const { client, controller } = createStepMockClient([
    { content: [mockText('Hi there!')] },
  ])

  const agentPromise = render(
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

    let errorThrown = false
    try {
      for await (const _event of agent.stream()) {
        void _event
      }
    } catch (error: unknown) {
      errorThrown = true
      const err = error as Error
      expect(err.message).toContain('stream() requires a message parameter')
    }
    expect(errorThrown).toBe(true)
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

  const runPromise = render(
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
  ])

  const tool = defineTool({
    name: 'test',
    description: 'test',
    parameters: z.object({}),
    handler: async () => 'ok',
  })

  const runPromise = render(
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
