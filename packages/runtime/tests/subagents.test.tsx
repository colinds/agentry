import { test, expect } from 'bun:test'
import { useState } from 'react'
import {
  render,
  createAgent,
  Agent,
  System,
  Tools,
  Message,
  useMessages,
  defineTool,
  Tool,
  type AgentResult,
} from '../src/index.ts'
import { createStepMockClient, mockText, mockToolUse } from '@agentry/core'
import { TEST_MODEL } from '@agentry/shared'
import { z } from 'zod'
import { getRegisteredTools } from './utils/testHelpers.ts'

test('subagent has isolated message context', async () => {
  const subagentMessageCountRef: { current: number } = { current: 0 }

  function IsolatedAgent() {
    const messages = useMessages()
    // eslint-disable-next-line react-hooks/immutability
    subagentMessageCountRef.current = messages.length

    return (
      <Agent name="isolated" stream={false} description="Has isolated messages">
        <System>You are isolated</System>
      </Agent>
    )
  }

  const { client, controller } = createStepMockClient([
    { content: [mockToolUse('isolated', {})], stop_reason: 'tool_use' },
    { content: [mockText('Parent continues')] },
  ])

  const runPromise = render(
    <Agent model={TEST_MODEL} stream={false}>
      <System>Parent system prompt</System>
      <Tools>
        <IsolatedAgent />
      </Tools>
      <Message role="user">Call the isolated agent</Message>
    </Agent>,
    { client },
  )

  await controller.nextTurn()
  await controller.waitForNextCall()
  await controller.nextTurn()

  await runPromise

  // subagent should only see its own messages, not parent's
  // at the time the subagent component renders, it should have minimal messages
  expect(subagentMessageCountRef.current).toBeLessThan(5)
})

test('onStepFinish callback fires for subagent calls', async () => {
  let stepFinishCalled = false
  const stepToolCalls: Array<{ id: string; name: string; input: unknown }> = []

  function SubAgent() {
    return (
      <Agent name="subagent" stream={false} description="Test subagent">
        <System>You are a subagent</System>
      </Agent>
    )
  }

  const { client, controller } = createStepMockClient([
    { content: [mockToolUse('subagent', {})], stop_reason: 'tool_use' },
    { content: [mockText('Done')] },
  ])

  const runPromise = render(
    <Agent
      model={TEST_MODEL}
      stream={false}
      onStepFinish={(result) => {
        stepFinishCalled = true
        stepToolCalls.push(...result.toolCalls)
      }}
    >
      <Tools>
        <SubAgent />
      </Tools>
      <Message role="user">Call subagent</Message>
    </Agent>,
    { client },
  )

  await controller.nextTurn()
  await controller.waitForNextCall()
  await controller.nextTurn()

  await runPromise

  expect(stepFinishCalled).toBe(true)
  expect(stepToolCalls.length).toBeGreaterThan(0)
  expect(stepToolCalls.some((call) => call.name === 'subagent')).toBe(true)
})

test('onComplete callback fires when agent finishes', async () => {
  let completeCalled = false
  let completeResult: AgentResult | null = null

  function CompletableAgent() {
    return (
      <Agent
        name="completable"
        description="Agent with onComplete"
        stream={false}
        onComplete={(result: AgentResult) => {
          completeCalled = true
          completeResult = result
        }}
      >
        <System>You complete tasks</System>
      </Agent>
    )
  }

  const { client, controller } = createStepMockClient([
    {
      content: [mockToolUse('completable', { task: 'test' })],
      stop_reason: 'tool_use',
    },
    { content: [mockText('Task completed by subagent')] }, // Subagent's response
    { content: [mockText('All done')] }, // Parent's final response
  ])

  const runPromise = render(
    <Agent model={TEST_MODEL} stream={false}>
      <Tools>
        <CompletableAgent />
      </Tools>
      <Message role="user">Run the completable agent</Message>
    </Agent>,
    { client },
  )

  await controller.nextTurn()
  await controller.waitForNextCall()
  await controller.nextTurn()
  await controller.waitForNextCall()
  await controller.nextTurn()

  await runPromise

  expect(completeCalled).toBe(true)
  expect(completeResult).not.toBeNull()
  expect(completeResult!.content).toBe('Task completed by subagent')
})

function HiddenAgent() {
  return (
    <Agent name="hidden" stream={false} description="Hidden agent">
      <System>I am hidden</System>
    </Agent>
  )
}

test('conditionally hidden subagents are not available as tools', async () => {
  function OptionalSubagentTest() {
    const showHidden = false
    return (
      <Agent model={TEST_MODEL} stream={false}>
        <Tools>{showHidden && <HiddenAgent />}</Tools>
        <Message role="user">Try to use hidden agent</Message>
      </Agent>
    )
  }

  const { client, controller } = createStepMockClient([
    { content: [mockText('I cannot help with that')] },
  ])

  const runPromise = render(<OptionalSubagentTest />, { client })

  await controller.nextTurn()

  const result = await runPromise
  expect(result.content).toBe('I cannot help with that')
})

function HelperAgent({ onMount }: { onMount: () => void }) {
  onMount()
  return (
    <Agent name="helper" stream={false} description="Helper agent">
      <System>I help with tasks</System>
    </Agent>
  )
}

test('tools can be mounted during execution via state change', async () => {
  const enablerCalledRef: { current: boolean } = { current: false }
  const helperCalledRef: { current: boolean } = { current: false }

  function MountingToolTest() {
    const [mounted, setMounted] = useState(false)

    const enabler = defineTool({
      name: 'enable_helper',
      description: 'Enable the helper tool',
      parameters: z.object({}),
      handler: async () => {
        // eslint-disable-next-line react-hooks/immutability
        enablerCalledRef.current = true
        setMounted(true)
        return 'Helper tool is now enabled'
      },
    })

    return (
      <Agent model={TEST_MODEL} stream={false} maxIterations={5}>
        <System>You manage tools</System>
        <Tools>
          <Tool {...enabler} />
          {mounted && (
            <HelperAgent
              onMount={() => {
                helperCalledRef.current = true
              }}
            />
          )}
        </Tools>
        <Message role="user">Enable helper then use it</Message>
      </Agent>
    )
  }

  const { client, controller } = createStepMockClient([
    { content: [mockToolUse('enable_helper', {})], stop_reason: 'tool_use' },
    { content: [mockToolUse('helper', {})], stop_reason: 'tool_use' },
    { content: [mockText('Task completed')] },
  ])

  const agent = createAgent(<MountingToolTest />, { client })

  try {
    // Start execution
    const runPromise = agent.run()

    // Resolve first turn - agent calls enable_helper
    await controller.nextTurn()

    // Wait for tool execution to complete (next call queued)
    await controller.waitForNextCall()

    // After tool execution, helper should be available (state update processed)
    const tools = getRegisteredTools(agent)
    expect(tools).toContain('enable_helper')
    expect(tools).toContain('helper')
    expect(enablerCalledRef.current).toBe(true)

    // Resolve second turn - agent calls helper
    await controller.nextTurn()

    // Wait for tool execution to complete
    await controller.waitForNextCall()

    // Helper should have been called
    expect(helperCalledRef.current).toBe(true)

    // Final turn
    await controller.nextTurn()

    const result = await runPromise
    expect(result.content).toBe('Task completed')

    // Final verification
    const finalTools = getRegisteredTools(agent)
    expect(finalTools).toContain('enable_helper')
    expect(finalTools).toContain('helper')
  } finally {
    agent.close()
  }
})

function ResearcherAgent({ onMount }: { onMount: () => void }) {
  onMount()
  return (
    <Agent name="researcher" stream={false} description="Research specialist">
      <System>You do research</System>
    </Agent>
  )
}

test('subagents can be mounted during execution via state change', async () => {
  const coordinatorCalledRef: { current: boolean } = { current: false }
  const researcherCalledRef: { current: boolean } = { current: false }

  function MountingSubagentTest() {
    const [hasResearcher, setHasResearcher] = useState(false)

    const coordinator = defineTool({
      name: 'start_research',
      description: 'Start research phase',
      parameters: z.object({}),
      handler: async () => {
        // eslint-disable-next-line react-hooks/immutability
        coordinatorCalledRef.current = true
        setHasResearcher(true)
        return 'Research phase activated'
      },
    })

    return (
      <Agent model={TEST_MODEL} stream={false} maxIterations={5}>
        <System>You coordinate work</System>
        <Tools>
          <Tool {...coordinator} />
          {hasResearcher && (
            <ResearcherAgent
              onMount={() => {
                researcherCalledRef.current = true
              }}
            />
          )}
        </Tools>
        <Message role="user">Coordinate the work</Message>
      </Agent>
    )
  }

  const { client, controller } = createStepMockClient([
    { content: [mockToolUse('start_research', {})], stop_reason: 'tool_use' },
    { content: [mockToolUse('researcher', {})], stop_reason: 'tool_use' },
    { content: [mockText('Work coordinated')] },
  ])

  const agent = createAgent(<MountingSubagentTest />, { client })

  try {
    const runPromise = agent.run()

    // Turn 1: Call start_research
    await controller.nextTurn()

    // Wait for tool execution to complete
    await controller.waitForNextCall()

    // After tool execution, researcher should be available (state update processed)
    const tools = getRegisteredTools(agent)
    expect(tools).toContain('start_research')
    expect(tools).toContain('researcher')
    expect(coordinatorCalledRef.current).toBe(true)
    expect(researcherCalledRef.current).toBe(true)

    // Turn 2: Call researcher
    await controller.nextTurn()

    // Wait for tool execution to complete
    await controller.waitForNextCall()

    const tools2 = getRegisteredTools(agent)
    expect(tools2).toContain('start_research')
    expect(tools2).toContain('researcher')
    expect(researcherCalledRef.current).toBe(true)

    // Turn 3: Final response
    await controller.nextTurn()

    const result = await runPromise
    expect(result.content).toBe('Work coordinated')

    const finalTools = getRegisteredTools(agent)
    expect(finalTools).toContain('start_research')
    expect(finalTools).toContain('researcher')
  } finally {
    agent.close()
  }
})

test('subagent sees pre-loaded JSX messages', async () => {
  function PreloadedAgent() {
    return (
      <Agent
        name="preloaded"
        stream={false}
        description="Agent with pre-loaded messages"
      >
        <System>You continue conversations</System>
        {/* these JSX messages should be visible to the subagent */}
        <Message role="user">What is 2+2?</Message>
        <Message role="assistant">2+2 equals 4.</Message>
        <Message role="user">And what is 3+3?</Message>
      </Agent>
    )
  }

  const { client, controller } = createStepMockClient([
    // parent calls the subagent
    {
      content: [mockToolUse('preloaded', { task: 'continue' })],
      stop_reason: 'tool_use',
    },
    // subagent responds (should see JSX messages + task)
    { content: [mockText('3+3 equals 6.')] },
    // parent finishes
    { content: [mockText('Done')] },
  ])

  const runPromise = render(
    <Agent model={TEST_MODEL} stream={false}>
      <System>You delegate tasks</System>
      <Tools>
        <PreloadedAgent />
      </Tools>
      <Message role="user">Call preloaded agent</Message>
    </Agent>,
    { client },
  )

  // parent turn - calls preloaded
  await controller.nextTurn()
  await controller.waitForNextCall()

  // peek at the subagent's API call before resolving
  const subagentCall = controller.peekNextCall()
  expect(subagentCall).not.toBeNull()

  const messages = subagentCall!.params.messages

  // should have 4 messages: 3 JSX + 1 task from parent
  expect(messages.length).toBe(4)
  expect(messages[0]).toEqual({ role: 'user', content: 'What is 2+2?' })
  expect(messages[1]).toEqual({ role: 'assistant', content: '2+2 equals 4.' })
  expect(messages[2]).toEqual({ role: 'user', content: 'And what is 3+3?' })
  expect(messages[3]!.role).toBe('user')
  expect(messages[3]!.content).toContain('continue') // the task from parent

  // finish execution
  await controller.nextTurn()
  await controller.waitForNextCall()
  await controller.nextTurn()

  await runPromise
})

test('useMessages works inside subagent children', async () => {
  // tracks messages seen by hook inside subagent's children
  const subagentMessagesRef: { current: string[] } = { current: [] }

  // component rendered inside subagent that uses useMessages
  function SubagentBody() {
    const messages = useMessages()
    // eslint-disable-next-line react-hooks/immutability
    subagentMessagesRef.current = messages.map((m) => {
      if (typeof m.content === 'string') return m.content
      return JSON.stringify(m.content)
    })
    return null
  }

  function SubagentWithHook() {
    return (
      <Agent
        name="hooked"
        stream={false}
        description="Agent with hook in children"
      >
        <System>You use hooks</System>
        <Message role="user">Pre-loaded message</Message>
        {/* SubagentBody uses useMessages - should see subagent's messages */}
        <SubagentBody />
      </Agent>
    )
  }

  const { client, controller } = createStepMockClient([
    // parent calls subagent
    {
      content: [mockToolUse('hooked', { task: 'test hooks' })],
      stop_reason: 'tool_use',
    },
    // subagent responds
    { content: [mockText('Hook test complete')] },
    // parent finishes
    { content: [mockText('Done')] },
  ])

  const runPromise = render(
    <Agent model={TEST_MODEL} stream={false}>
      <System>Parent</System>
      <Tools>
        <SubagentWithHook />
      </Tools>
      <Message role="user">Call the hooked agent</Message>
    </Agent>,
    { client },
  )

  // parent turn
  await controller.nextTurn()
  await controller.waitForNextCall()

  // subagent turn
  await controller.nextTurn()
  await controller.waitForNextCall()

  // finish
  await controller.nextTurn()
  await runPromise

  // SubagentBody should have seen the subagent's messages (JSX + task)
  // NOT the parent's messages
  expect(subagentMessagesRef.current.length).toBeGreaterThan(0)
  expect(subagentMessagesRef.current).toContain('Pre-loaded message')
  expect(subagentMessagesRef.current.some((m) => m.includes('test hooks'))).toBe(
    true,
  )
  // should NOT contain parent messages
  expect(
    subagentMessagesRef.current.some((m) => m.includes('Call the hooked agent')),
  ).toBe(false)
})

test('tools can be unmounted during execution via state change', async () => {
  const temporaryCalledRef: { current: boolean } = { current: false }
  const disablerCalledRef: { current: boolean } = { current: false }

  function UnmountingToolTest() {
    const [enabled, setEnabled] = useState(true)

    const disabler = defineTool({
      name: 'disable_tool',
      description: 'Disable the temporary tool',
      parameters: z.object({}),
      handler: async () => {
        // eslint-disable-next-line react-hooks/immutability
        disablerCalledRef.current = true
        setEnabled(false)
        return 'Tool disabled'
      },
    })

    const temporary = defineTool({
      name: 'temporary',
      description: 'Temporary tool that will be disabled',
      parameters: z.object({}),
      handler: async () => {
        // eslint-disable-next-line react-hooks/immutability
        temporaryCalledRef.current = true
        return 'This runs'
      },
    })

    return (
      <Agent model={TEST_MODEL} stream={false} maxIterations={5}>
        <System>Manage tool lifecycle</System>
        <Tools>
          <Tool {...disabler} />
          {enabled && <Tool {...temporary} />}
        </Tools>
        <Message role="user">
          First use temporary, then disable it, then respond
        </Message>
      </Agent>
    )
  }

  const { client, controller } = createStepMockClient([
    { content: [mockToolUse('temporary', {})], stop_reason: 'tool_use' },
    { content: [mockToolUse('disable_tool', {})], stop_reason: 'tool_use' },
    { content: [mockText('Done')] },
  ])

  const agent = createAgent(<UnmountingToolTest />, { client })

  try {
    const runPromise = agent.run()

    // Turn 1: Call temporary tool (should be available)
    await controller.nextTurn()

    // Wait for tool execution to complete
    await controller.waitForNextCall()

    const tools = getRegisteredTools(agent)
    expect(tools).toContain('temporary')
    expect(tools).toContain('disable_tool')
    expect(temporaryCalledRef.current).toBe(true)

    // Turn 2: Call disable_tool (should remove temporary)
    await controller.nextTurn()

    // Wait for tool execution to complete
    await controller.waitForNextCall()

    const tools2 = getRegisteredTools(agent)
    expect(tools2).toContain('disable_tool')
    expect(tools2).not.toContain('temporary')
    expect(disablerCalledRef.current).toBe(true)

    // Turn 3: Final response
    await controller.nextTurn()

    const result = await runPromise
    expect(result.content).toBe('Done')

    const finalTools = getRegisteredTools(agent)
    expect(finalTools).toContain('disable_tool')
    expect(finalTools).not.toContain('temporary')
  } finally {
    agent.close()
  }
})
