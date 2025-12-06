import { test, expect } from 'bun:test'
import { z } from 'zod'
import { run } from '../src'
import { defineTool } from '../src/tools'
import {
  Agent,
  Tools,
  Tool,
  Message,
  useExecutionState,
  useMessages,
  useAgentState,
} from '../src'
import { createStepMockClient, mockText, mockToolUse } from './utils'
import { TEST_MODEL } from '../src/constants'
import { createStateWatcher, createMessageCollector } from './utils/testHelpers'

test('useExecutionState tracks status transitions', async () => {
  const states: string[] = []

  function StateTracker() {
    const state = useExecutionState()
    states.push(state.status)
    return null
  }

  const { client, controller } = createStepMockClient([
    { content: [mockText('Done')], stop_reason: 'end_turn' },
  ])

  const runPromise = run(
    <Agent model={TEST_MODEL} stream={false} maxIterations={5}>
      <StateTracker />
      <Message role="user">Test</Message>
    </Agent>,
    { client },
  )

  await controller.nextTurn()
  const result = await runPromise

  expect(states.length).toBeGreaterThan(0)
  expect(states[0]).toBe('idle')
  expect(states[states.length - 1]).toBe('completed')
  expect(result.stopReason).toBe('end_turn')
  expect(result.content).toBe('Done')
})

test('useExecutionState with createStateWatcher helper', async () => {
  const watcher = createStateWatcher()

  const { client, controller } = createStepMockClient([
    { content: [mockText('Response')], stop_reason: 'end_turn' },
  ])

  const runPromise = run(
    <Agent model={TEST_MODEL} stream={false} maxIterations={5}>
      <watcher.Component />
      <Message role="user">Test</Message>
    </Agent>,
    { client },
  )

  await controller.nextTurn()
  const result = await runPromise

  expect(watcher.states.length).toBeGreaterThan(0)
  expect(watcher.states[0]?.status).toBe('idle')
  expect(watcher.states[watcher.states.length - 1]?.status).toBe('completed')
  expect(result.stopReason).toBe('end_turn')
})

test('useMessages accumulates conversation history', async () => {
  const messageSnapshots: number[] = []

  function MessageTracker() {
    const messages = useMessages()
    messageSnapshots.push(messages.length)
    return null
  }

  const { client, controller } = createStepMockClient([
    { content: [mockText('Hello back!')] },
  ])

  const runPromise = run(
    <Agent model={TEST_MODEL} stream={false}>
      <MessageTracker />
      <Message role="user">Hello</Message>
    </Agent>,
    { client },
  )

  await controller.nextTurn()
  await runPromise

  expect(messageSnapshots.length).toBeGreaterThan(0)
  expect(messageSnapshots[messageSnapshots.length - 1]).toBeGreaterThanOrEqual(
    2,
  )
})

test('useMessages with createMessageCollector helper', async () => {
  const collector = createMessageCollector()

  const { client, controller } = createStepMockClient([
    { content: [mockText('Response')] },
  ])

  const runPromise = run(
    <Agent model={TEST_MODEL} stream={false}>
      <collector.Component />
      <Message role="user">Test message</Message>
    </Agent>,
    { client },
  )

  await controller.nextTurn()
  await runPromise

  expect(collector.snapshots.length).toBeGreaterThan(0)
  const finalSnapshot = collector.snapshots[collector.snapshots.length - 1]
  expect(finalSnapshot).toBeDefined()
  expect(finalSnapshot?.length).toBeGreaterThanOrEqual(2)

  const userMessage = finalSnapshot?.find((m) => m.role === 'user')
  expect(userMessage).toBeDefined()
  expect(userMessage?.content).toBe('Test message')
})

test('useAgentState provides full state access', async () => {
  const capturedStateRef: { current: ReturnType<typeof useAgentState> | null } =
    { current: null }

  function FullStateTracker() {
    const state = useAgentState()
    // eslint-disable-next-line react-hooks/immutability
    capturedStateRef.current = state
    return null
  }

  const { client, controller } = createStepMockClient([
    { content: [mockText('Done')] },
  ])

  const runPromise = run(
    <Agent model={TEST_MODEL} stream={false}>
      <FullStateTracker />
      <Message role="user">Test</Message>
    </Agent>,
    { client },
  )

  await controller.nextTurn()
  await runPromise

  expect(capturedStateRef.current).toBeDefined()
  expect(capturedStateRef.current?.executionState).toBeDefined()
  expect(capturedStateRef.current?.messages).toBeDefined()
  expect(Array.isArray(capturedStateRef.current?.messages)).toBe(true)
})

test('hooks throw error when used outside AgentProvider', () => {
  function InvalidComponent() {
    try {
      useExecutionState()
      // eslint-disable-next-line react-hooks/error-boundaries
      return <div>Should not reach here</div>
    } catch (error: unknown) {
      const err = error as Error
      expect(err.message).toContain(
        'Agent hooks must be used within an AgentProvider',
      )
      throw error
    }
  }

  expect(() => {
    InvalidComponent()
  }).toThrow('Agent hooks must be used within an AgentProvider')
})

test('multiple components can subscribe to same state', async () => {
  const watcher1 = createStateWatcher()
  const watcher2 = createStateWatcher()

  const { client, controller } = createStepMockClient([
    { content: [mockText('Done')] },
  ])

  const runPromise = run(
    <Agent model={TEST_MODEL} stream={false}>
      <watcher1.Component />
      <watcher2.Component />
      <Message role="user">Test</Message>
    </Agent>,
    { client },
  )

  await controller.nextTurn()
  await runPromise

  expect(watcher1.states.length).toBeGreaterThan(0)
  expect(watcher2.states.length).toBeGreaterThan(0)

  expect(watcher1.states.length).toBe(watcher2.states.length)
  for (let i = 0; i < watcher1.states.length; i++) {
    expect(watcher1.states[i]?.status).toBe(watcher2.states[i]?.status)
  }
})

test('state updates during tool execution', async () => {
  const states: string[] = []
  let toolCalled = false

  function StateTracker() {
    const state = useExecutionState()
    states.push(state.status)
    return null
  }

  const testTool = defineTool({
    name: 'test_tool',
    description: 'A test tool',
    parameters: z.object({}),
    handler: async () => {
      toolCalled = true
      return 'Tool executed'
    },
  })

  const { client, controller } = createStepMockClient([
    { content: [mockToolUse('test_tool', {})], stop_reason: 'tool_use' },
    { content: [mockText('Done')], stop_reason: 'end_turn' },
  ])

  const runPromise = run(
    <Agent model={TEST_MODEL} stream={false} maxIterations={5}>
      <StateTracker />
      <Tools>
        <Tool {...testTool} />
      </Tools>
      <Message role="user">Use the tool</Message>
    </Agent>,
    { client },
  )

  await controller.nextTurn()
  await controller.waitForNextCall()
  await controller.nextTurn()
  const result = await runPromise

  expect(toolCalled).toBe(true)
  expect(states.length).toBeGreaterThan(0)
  expect(states[0]).toBe('idle')
  expect(states[states.length - 1]).toBe('completed')
  expect(result.stopReason).toBe('end_turn')
  expect(result.content).toBe('Done')
})
