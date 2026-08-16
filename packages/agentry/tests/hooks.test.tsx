import { test, expect } from 'bun:test'
import { Type } from 'typebox'
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
import { createStepMockModels, fauxText, fauxToolCall } from './utils'
import { AgentStatus } from '../src/types'
import { ANTHROPIC_TEST_MODEL } from '../src/constants'
import { createStateWatcher, createMessageCollector } from './utils/testHelpers'

test('useExecutionState tracks status transitions', async () => {
  const states: string[] = []

  function StateTracker() {
    const state = useExecutionState()
    states.push(state.status)
    return null
  }

  const { models, controller } = createStepMockModels([
    { content: [fauxText('Done')] },
  ])

  const runPromise = run(
    <Agent
      provider="anthropic"
      model={ANTHROPIC_TEST_MODEL}
      stream={false}
      maxIterations={5}
    >
      <StateTracker />
      <Message role="user">Test</Message>
    </Agent>,
    { models },
  )

  await controller.nextTurn()
  const result = await runPromise

  expect(states.length).toBeGreaterThan(0)
  expect(states[0]).toBe('idle')
  expect(states[states.length - 1]).toBe('completed')
  expect(result.stopReason).toBe('stop')
  expect(result.content).toBe('Done')
})

test('useExecutionState with createStateWatcher helper', async () => {
  const watcher = createStateWatcher()

  const { models, controller } = createStepMockModels([
    { content: [fauxText('Response')] },
  ])

  const runPromise = run(
    <Agent
      provider="anthropic"
      model={ANTHROPIC_TEST_MODEL}
      stream={false}
      maxIterations={5}
    >
      <watcher.Component />
      <Message role="user">Test</Message>
    </Agent>,
    { models },
  )

  await controller.nextTurn()
  const result = await runPromise

  expect(watcher.states.length).toBeGreaterThan(0)
  expect(watcher.states[0]?.status).toBe(AgentStatus.Idle)
  expect(watcher.states[watcher.states.length - 1]?.status).toBe(
    AgentStatus.Completed,
  )
  expect(result.stopReason).toBe('stop')
})

test('useMessages accumulates conversation history', async () => {
  const messageSnapshots: number[] = []

  function MessageTracker() {
    const messages = useMessages()
    messageSnapshots.push(messages.length)
    return null
  }

  const { models, controller } = createStepMockModels([
    { content: [fauxText('Hello back!')] },
  ])

  const runPromise = run(
    <Agent provider="anthropic" model={ANTHROPIC_TEST_MODEL} stream={false}>
      <MessageTracker />
      <Message role="user">Hello</Message>
    </Agent>,
    { models },
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

  const { models, controller } = createStepMockModels([
    { content: [fauxText('Response')] },
  ])

  const runPromise = run(
    <Agent provider="anthropic" model={ANTHROPIC_TEST_MODEL} stream={false}>
      <collector.Component />
      <Message role="user">Test message</Message>
    </Agent>,
    { models },
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
    capturedStateRef.current = state
    return null
  }

  const { models, controller } = createStepMockModels([
    { content: [fauxText('Done')] },
  ])

  const runPromise = run(
    <Agent provider="anthropic" model={ANTHROPIC_TEST_MODEL} stream={false}>
      <FullStateTracker />
      <Message role="user">Test</Message>
    </Agent>,
    { models },
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

  const { models, controller } = createStepMockModels([
    { content: [fauxText('Done')] },
  ])

  const runPromise = run(
    <Agent provider="anthropic" model={ANTHROPIC_TEST_MODEL} stream={false}>
      <watcher1.Component />
      <watcher2.Component />
      <Message role="user">Test</Message>
    </Agent>,
    { models },
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
    parameters: Type.Object({}),
    handler: async () => {
      toolCalled = true
      return 'Tool executed'
    },
  })

  const { models, controller } = createStepMockModels([
    { content: [fauxToolCall('test_tool', {})] },
    { content: [fauxText('Done')] },
  ])

  const runPromise = run(
    <Agent
      provider="anthropic"
      model={ANTHROPIC_TEST_MODEL}
      stream={false}
      maxIterations={5}
    >
      <StateTracker />
      <Tools>
        <Tool {...testTool} />
      </Tools>
      <Message role="user">Use the tool</Message>
    </Agent>,
    { models },
  )

  await controller.nextTurn()
  await controller.waitForNextCall()
  await controller.nextTurn()
  const result = await runPromise

  expect(toolCalled).toBe(true)
  expect(states.length).toBeGreaterThan(0)
  expect(states[0]).toBe('idle')
  expect(states[states.length - 1]).toBe('completed')
  expect(result.stopReason).toBe('stop')
  expect(result.content).toBe('Done')
})
