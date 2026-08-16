import { test, expect } from 'bun:test'
import { ExecutionEngine } from '../src/execution'
import { createAgentStore } from '../src/store'
import { assistantSeedMessage, userMessage } from '../src/types/messages'
import { createStepMockModels, fauxText } from './utils'
import { ANTHROPIC_TEST_MODEL } from './constants'
import { AgentStatus, type AgentMessageParam } from '../src/types'
import { InstanceType, type AgentInstance } from '../src/instances'

test('compactionControl compacts messages when threshold is exceeded', async () => {
  const { models, controller } = createStepMockModels([
    { content: [fauxText('Summary result')] },
  ])

  const store = createAgentStore()
  const originalMessages: AgentMessageParam[] = [
    userMessage([{ type: 'text', text: 'First message' }]),
    assistantSeedMessage([{ type: 'text', text: 'Second message' }]),
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
    systemParts: [],
    tools: new Map(),
    duplicateToolNames: new Set(),
    mcpServers: [],
    children: [],
    parent: null,
    store,
  }

  const engine = new ExecutionEngine({
    provider: 'anthropic',
    models,
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
    ...assistantSeedMessage([]),
    usage: {
      input: 100,
      output: 50,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 150,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  }

  const compactPromise = engineWithInternals.checkAndCompact()

  await controller.waitForNextCall()

  const call = controller.peekNextCall()
  expect(call).not.toBeNull()
  const sent = call!.context.messages
  const lastMessage = sent[sent.length - 1]
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
  const { models, controller } = createStepMockModels([
    { content: [fauxText('Should not be used')] },
  ])

  const store = createAgentStore()
  const originalMessages: AgentMessageParam[] = [
    userMessage([{ type: 'text', text: 'Short exchange' }]),
    assistantSeedMessage([{ type: 'text', text: 'Still short' }]),
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
    systemParts: [],
    tools: new Map(),
    duplicateToolNames: new Set(),
    mcpServers: [],
    children: [],
    parent: null,
    store,
  }

  const engine = new ExecutionEngine({
    provider: 'anthropic',
    models,
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
    ...assistantSeedMessage([]),
    usage: {
      input: 100,
      output: 50,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 150,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  }

  const didCompact = await engineWithInternals.checkAndCompact()

  expect(didCompact).toBe(false)
  expect(controller.getPendingCallCount()).toBe(0)
  expect(store.getState().messages).toEqual(originalMessages)
})
