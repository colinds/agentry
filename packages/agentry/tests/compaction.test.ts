import { test, expect } from 'bun:test'
import { ExecutionEngine } from '../src/execution'
import { createAgentStore } from '../src/store'
import { createStepMockClient, mockText } from './utils'
import { ANTHROPIC_TEST_MODEL } from '../src/constants'
import { AgentStatus, type AgentMessageParam } from '../src/types'
import { InstanceType, type AgentInstance } from '../src/instances'

test('compactionControl compacts messages when threshold is exceeded', async () => {
  const { client, controller } = createStepMockClient([
    { content: [mockText('Summary result')] },
  ])

  const store = createAgentStore()
  const originalMessages: AgentMessageParam[] = [
    {
      role: 'user',
      content: [{ type: 'text', text: 'First message' }],
    },
    {
      role: 'assistant',
      content: [{ type: 'text', text: 'Second message' }],
    },
  ]

  store.setState(() => ({
    executionState: { status: AgentStatus.Idle },
    messages: originalMessages,
  }))

  const agentInstance: AgentInstance = {
    type: InstanceType.Agent,
    props: {
      provider: 'anthropic',
      model: ANTHROPIC_TEST_MODEL,
      maxTokens: 100,
    },
    client,
    engine: null,
    systemParts: [],
    tools: [],
    builtInTools: [],
    mcpServers: [],
    children: [],
    parent: null,
    store,
  }

  const engine = new ExecutionEngine({
    provider: 'anthropic',
    client,
    model: ANTHROPIC_TEST_MODEL,
    maxTokens: 100,
    store,
    agentInstance,
    compactionControl: {
      enabled: true,
      contextTokenThreshold: 10,
      model: ANTHROPIC_TEST_MODEL,
      summaryPrompt: 'Please summarize the conversation so far',
    },
  })

  const engineWithInternals = engine as unknown as {
    lastMessage: unknown
    checkAndCompact: () => Promise<boolean>
  }

  engineWithInternals.lastMessage = {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    content: [],
    model: ANTHROPIC_TEST_MODEL,
    stop_reason: 'end_turn',
    stop_sequence: null,
    container: null,
    context_management: null,
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation: null,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      server_tool_use: null,
      service_tier: null,
    },
  }

  const compactPromise = engineWithInternals.checkAndCompact()

  await controller.waitForNextCall()

  const call = controller.peekNextCall()
  expect(call).not.toBeNull()
  const params = call!.params
  const lastMessage = params.messages[params.messages.length - 1]
  expect(lastMessage).toMatchObject({
    role: 'user',
    content: 'Please summarize the conversation so far',
  })

  await controller.nextTurn()
  const didCompact = await compactPromise

  expect(didCompact).toBe(true)

  const state = store.getState()
  expect(state.messages).toHaveLength(1)
  const onlyMessage = state.messages[0]!
  expect(onlyMessage.role).toBe('user')
  expect(onlyMessage.content as unknown[]).toEqual([
    expect.objectContaining({ type: 'text', text: 'Summary result' }),
  ])
})

test('compactionControl does nothing when under threshold', async () => {
  const { client, controller } = createStepMockClient([
    { content: [mockText('Should not be used')] },
  ])

  const store = createAgentStore()
  const originalMessages: AgentMessageParam[] = [
    {
      role: 'user',
      content: [{ type: 'text', text: 'Short exchange' }],
    },
    {
      role: 'assistant',
      content: [{ type: 'text', text: 'Still short' }],
    },
  ]

  store.setState(() => ({
    executionState: { status: AgentStatus.Idle },
    messages: originalMessages,
  }))

  const agentInstance: AgentInstance = {
    type: InstanceType.Agent,
    props: {
      provider: 'anthropic',
      model: ANTHROPIC_TEST_MODEL,
      maxTokens: 100,
    },
    client,
    engine: null,
    systemParts: [],
    tools: [],
    builtInTools: [],
    mcpServers: [],
    children: [],
    parent: null,
    store,
  }

  const engine = new ExecutionEngine({
    provider: 'anthropic',
    client,
    model: ANTHROPIC_TEST_MODEL,
    maxTokens: 100,
    store,
    agentInstance,
    compactionControl: {
      enabled: true,
      contextTokenThreshold: 1_000_000,
      model: ANTHROPIC_TEST_MODEL,
      summaryPrompt: 'Please summarize the conversation so far',
    },
  })

  const engineWithInternals = engine as unknown as {
    lastMessage: unknown
    checkAndCompact: () => Promise<boolean>
  }

  engineWithInternals.lastMessage = {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    content: [],
    model: ANTHROPIC_TEST_MODEL,
    stop_reason: 'end_turn',
    stop_sequence: null,
    container: null,
    context_management: null,
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation: null,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      server_tool_use: null,
      service_tier: null,
    },
  }

  const didCompact = await engineWithInternals.checkAndCompact()

  expect(didCompact).toBe(false)
  expect(controller.getPendingCallCount()).toBe(0)
  expect(store.getState().messages).toEqual(originalMessages)
})
