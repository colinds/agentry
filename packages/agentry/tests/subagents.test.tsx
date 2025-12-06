import { test, expect } from 'bun:test'
import { useState } from 'react'
import { run, createAgent } from '../src'
import { defineTool } from '../src/tools'
import type { AgentResult } from '../src/types'
import {
  Agent,
  System,
  Tool,
  AgentTool,
  Tools,
  Message,
  useMessages,
} from '../src'
import { createStepMockClient, mockText, mockToolUse } from '../src/test-utils'
import { TEST_MODEL } from '../src/constants'
import { z } from 'zod'
import { getRegisteredTools } from './utils/testHelpers'

test('subagent has isolated message context', async () => {
  const subagentMessageCountRef: { current: number } = { current: 0 }

  function IsolatedAgent() {
    const messages = useMessages()
    // eslint-disable-next-line react-hooks/immutability
    subagentMessageCountRef.current = messages.length

    return (
      <Agent
        name="isolated"
        stream={false}
        description="Has isolated messages"
        model={TEST_MODEL}
      >
        <System>You are isolated</System>
        <Message role="user">Perform isolated task</Message>
      </Agent>
    )
  }

  const { client, controller } = createStepMockClient([
    { content: [mockToolUse('isolated', {})], stop_reason: 'tool_use' },
    { content: [mockText('Isolated task done')] }, // subagent response
    { content: [mockText('Parent continues')] },
  ])

  const runPromise = run(
    <Agent model={TEST_MODEL} stream={false}>
      <System>Parent system prompt</System>
      <Tools>
        <AgentTool
          name="isolated"
          description="Has isolated messages"
          parameters={z.object({})}
          agent={() => <IsolatedAgent />}
        />
      </Tools>
      <Message role="user">Call the isolated agent</Message>
    </Agent>,
    { client },
  )

  await controller.nextTurn()
  await controller.waitForNextCall()
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
        <Message role="user">Complete the task</Message>
      </Agent>
    )
  }

  const { client, controller } = createStepMockClient([
    { content: [mockToolUse('subagent', {})], stop_reason: 'tool_use' },
    { content: [mockText('Task completed')] }, // subagent response
    { content: [mockText('Done')] },
  ])

  const runPromise = run(
    <Agent
      model={TEST_MODEL}
      stream={false}
      onStepFinish={(result) => {
        stepFinishCalled = true
        stepToolCalls.push(...result.toolCalls)
      }}
    >
      <Tools>
        <AgentTool
          name="subagent"
          description="Test subagent"
          parameters={z.object({})}
          agent={() => <SubAgent />}
        />
      </Tools>
      <Message role="user">Call subagent</Message>
    </Agent>,
    { client },
  )

  await controller.nextTurn()
  await controller.waitForNextCall()
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
        <Message role="user">Complete this task</Message>
      </Agent>
    )
  }

  const { client, controller } = createStepMockClient([
    {
      content: [mockToolUse('completable', {})],
      stop_reason: 'tool_use',
    },
    { content: [mockText('Task completed by subagent')] },
    { content: [mockText('All done')] },
  ])

  const runPromise = run(
    <Agent model={TEST_MODEL} stream={false}>
      <Tools>
        <AgentTool
          name="completable"
          description="Agent with onComplete"
          parameters={z.object({})}
          agent={() => <CompletableAgent />}
        />
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
        <Tools>
          {showHidden && (
            <AgentTool
              name="hidden"
              description="Hidden agent"
              parameters={z.object({})}
              agent={() => <HiddenAgent />}
            />
          )}
        </Tools>
        <Message role="user">Try to use hidden agent</Message>
      </Agent>
    )
  }

  const { client, controller } = createStepMockClient([
    { content: [mockText('I cannot help with that')] },
  ])

  const runPromise = run(<OptionalSubagentTest />, { client })

  await controller.nextTurn()

  const result = await runPromise
  expect(result.content).toBe('I cannot help with that')
})

function HelperAgent({
  onMount,
  task,
}: {
  onMount: () => void
  task?: string
}) {
  onMount()
  return (
    <Agent name="helper" stream={false} description="Helper agent">
      <System>I help with tasks</System>
      <Message role="user">{task || 'Help me'}</Message>
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
            <AgentTool
              name="helper"
              description="Helper agent"
              parameters={z.object({
                task: z.string().optional(),
              })}
              agent={(input) => (
                <HelperAgent
                  task={input.task}
                  onMount={() => {
                    helperCalledRef.current = true
                  }}
                />
              )}
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
    { content: [mockText('Helper task completed')], stop_reason: 'end_turn' },
    { content: [mockText('Task completed')], stop_reason: 'end_turn' },
  ])

  const agent = createAgent(<MountingToolTest />, { client })

  try {
    // Start execution
    const runPromise = agent.run()

    // Resolve first turn - agent calls enable_helper
    await controller.nextTurn()

    await controller.waitForNextCall()

    // After tool execution, helper should be available (state update processed)
    const tools = getRegisteredTools(agent)
    expect(tools).toContain('enable_helper')
    expect(tools).toContain('helper')
    expect(enablerCalledRef.current).toBe(true)

    await controller.nextTurn()
    await controller.waitForNextCall()

    expect(helperCalledRef.current).toBe(true)

    await controller.waitForNextCall()
    await controller.nextTurn()
    await controller.waitForNextCall()
    await controller.nextTurn()

    const result = await runPromise
    expect(result.content).toBe('Task completed')
    const finalTools = getRegisteredTools(agent)
    expect(finalTools).toContain('enable_helper')
    expect(finalTools).toContain('helper')
  } finally {
    agent.close()
  }
})

function ResearcherAgent({
  onMount,
  task,
}: {
  onMount: () => void
  task?: string
}) {
  onMount()
  return (
    <Agent name="researcher" stream={false} description="Research specialist">
      <System>You do research</System>
      <Message role="user">{task || 'Do research'}</Message>
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
            <AgentTool
              name="researcher"
              description="Research specialist"
              parameters={z.object({
                task: z.string().optional(),
              })}
              agent={(input) => (
                <ResearcherAgent
                  task={input.task}
                  onMount={() => {
                    researcherCalledRef.current = true
                  }}
                />
              )}
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
    { content: [mockText('Research completed')], stop_reason: 'end_turn' },
    { content: [mockText('Work coordinated')], stop_reason: 'end_turn' },
  ])

  const agent = createAgent(<MountingSubagentTest />, { client })

  try {
    const runPromise = agent.run()

    await controller.nextTurn()
    await controller.waitForNextCall()

    const tools = getRegisteredTools(agent)
    expect(tools).toContain('start_research')
    expect(tools).toContain('researcher')
    expect(coordinatorCalledRef.current).toBe(true)

    await controller.nextTurn()
    await controller.waitForNextCall()

    const tools2 = getRegisteredTools(agent)
    expect(tools2).toContain('start_research')
    expect(tools2).toContain('researcher')
    expect(researcherCalledRef.current).toBe(true)

    await controller.waitForNextCall()
    await controller.nextTurn()
    await controller.waitForNextCall()
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
  function PreloadedAgent({ task }: { task: string }) {
    return (
      <Agent name="preloaded" stream={false}>
        <System>You continue conversations</System>
        {/* these JSX messages should be visible to the subagent */}
        <Message role="user">What is 2+2?</Message>
        <Message role="assistant">2+2 equals 4.</Message>
        <Message role="user">And what is 3+3?</Message>
        <Message role="user">{task}</Message>
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

  const runPromise = run(
    <Agent model={TEST_MODEL} stream={false}>
      <System>You delegate tasks</System>
      <Tools>
        <AgentTool
          name="preloaded"
          description="Agent with pre-loaded messages"
          parameters={z.object({
            task: z.string(),
          })}
          agent={(input) => <PreloadedAgent task={input.task} />}
        />
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

  function SubagentWithHook({ task }: { task: string }) {
    return (
      <Agent name="hooked" stream={false}>
        <System>You use hooks</System>
        <Message role="user">Pre-loaded message</Message>
        <Message role="user">{task}</Message>
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

  const runPromise = run(
    <Agent model={TEST_MODEL} stream={false}>
      <System>Parent</System>
      <Tools>
        <AgentTool
          name="hooked"
          description="Agent with hook in children"
          parameters={z.object({
            task: z.string(),
          })}
          agent={(input) => <SubagentWithHook task={input.task} />}
        />
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

  // NOT the parent's messages
  expect(subagentMessagesRef.current.length).toBeGreaterThan(0)
  expect(subagentMessagesRef.current).toContain('Pre-loaded message')
  expect(
    subagentMessagesRef.current.some((m) => m.includes('test hooks')),
  ).toBe(true)
  // should NOT contain parent messages
  expect(
    subagentMessagesRef.current.some((m) =>
      m.includes('Call the hooked agent'),
    ),
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

    await controller.nextTurn()
    await controller.waitForNextCall()

    const tools = getRegisteredTools(agent)
    expect(tools).toContain('temporary')
    expect(tools).toContain('disable_tool')
    expect(temporaryCalledRef.current).toBe(true)

    await controller.nextTurn()
    await controller.waitForNextCall()

    const tools2 = getRegisteredTools(agent)
    expect(tools2).toContain('disable_tool')
    expect(tools2).not.toContain('temporary')
    expect(disablerCalledRef.current).toBe(true)

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
