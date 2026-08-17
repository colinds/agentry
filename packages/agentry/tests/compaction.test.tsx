import { describe, test, expect } from 'bun:test'
import { run, Agent, System, Message } from '../src'
import { ExecutionEngine } from '../src/execution'
import {
  findCutIndex,
  isFatalCompactionError,
} from '../src/execution/compaction'
import { createAgentStore } from '../src/store'
import {
  assistantSeedMessage,
  extractToolCalls,
  toolResultMessage,
  userMessage,
} from '../src/types/messages'
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
    duplicateToolNames: new Map(),
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
      // Force everything into the summarized half; the default 16k recent
      // window would leave this short transcript untouched.
      keepRecentTokens: 0,
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

  // The summary replaces the older half; the most recent turn survives
  // verbatim. Wiping the whole transcript was the old behaviour and it took
  // the model's recent context away mid-task.
  expect(state.messages).toHaveLength(2)

  const summary = state.messages[0]!
  expect(summary.role).toBe('user')
  expect(JSON.stringify(summary.content)).toContain('Summary result')

  const kept = state.messages[1]!
  expect(JSON.stringify(kept.content)).toContain('Second message')
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
    duplicateToolNames: new Map(),
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

describe('cut point', () => {
  const msg = (text: string): AgentMessageParam =>
    userMessage([{ type: 'text', text }])

  test('never separates a tool call from its result', () => {
    // The kept tail is prefixed by the summary, which is a *user* message — so
    // the tail may legally open with an assistant turn. The one illegal opener
    // is a tool result, whose matching call would have been summarized away.
    const messages: AgentMessageParam[] = [
      msg('old one'),
      msg('old two'),
      {
        ...assistantSeedMessage([]),
        content: [
          { type: 'toolCall', id: 'call_1', name: 'search', arguments: {} },
        ],
      },
      toolResultMessage({
        toolCallId: 'call_1',
        toolName: 'search',
        content: 'results',
        isError: false,
      }),
    ]

    for (const budget of [1, 5, 10, 20, 40, 1000]) {
      const index = findCutIndex(messages, budget)

      // index 0 means nothing is summarized, so no transcript is rewritten.
      if (index === 0) continue

      expect(messages[index]!.role).not.toBe('toolResult')

      // And every tool result in the kept tail must still have its call.
      const kept = messages.slice(index)
      const callIds = new Set(
        kept.flatMap((m) =>
          m.role === 'assistant' ? extractToolCalls(m).map((c) => c.id) : [],
        ),
      )
      for (const m of kept) {
        if (m.role === 'toolResult') expect(callIds.has(m.toolCallId)).toBe(true)
      }
    }
  })

  test('keeps a conversation that ends mid-tool-use rather than wiping it', () => {
    // Walking forward past the pair would run off the end here and keep
    // nothing — which is the behaviour the rewrite exists to remove.
    const messages: AgentMessageParam[] = [
      msg('a'),
      msg('b'),
      msg('c'),
      {
        ...assistantSeedMessage([]),
        content: [
          { type: 'toolCall', id: 'call_1', name: 'search', arguments: {} },
        ],
      },
      toolResultMessage({
        toolCallId: 'call_1',
        toolName: 'search',
        content: 'results',
        isError: false,
      }),
    ]

    const index = findCutIndex(messages, 1)
    expect(index).toBeLessThan(messages.length)
    expect(messages.slice(index).length).toBeGreaterThan(0)
    expect(messages[index]!.role).toBe('assistant')
  })

  test('keeps the whole transcript when the budget covers it', () => {
    expect(findCutIndex([msg('a'), msg('b')], 100_000)).toBe(0)
  })
})

describe('context-overflow recovery', () => {
  test('an overflow compacts and retries the turn once', async () => {
    // Turn 1 is refused for overflow, turn 2 is the summary request, turn 3 is
    // the retried original turn. Overflow is the one provider failure the
    // framework can recover from, and the token threshold has by definition
    // already failed to fire.
    const { models, controller } = createStepMockModels([
      { content: '' },
      { content: [fauxText('Summary of earlier work')] },
      { content: [fauxText('Recovered answer')] },
    ])

    const runPromise = run(
      <Agent
        provider="anthropic"
        model={ANTHROPIC_TEST_MODEL}
        maxTokens={100}
        stream={false}
        compactionControl={{ enabled: true, keepRecentTokens: 0 }}
      >
        <System>Test</System>
        <Message role="user">First</Message>
        <Message role="assistant">Second</Message>
        <Message role="user">Third</Message>
      </Agent>,
      { models },
    )

    await controller.waitForNextCall()
    controller.rejectNextCall(
      'prompt is too long: 250000 tokens > 200000 maximum',
    )

    // Summary request, then the retried turn.
    await controller.nextTurn()
    await controller.nextTurn()

    const result = await runPromise
    expect(result.content).toBe('Recovered answer')

    // The retried call went out with a compacted transcript.
    const history = controller.getCallHistory()
    expect(history.length).toBe(3)
    const retried = history[2]!
    expect(JSON.stringify(retried.context.messages)).toContain(
      'Summary of earlier work',
    )
  })

  test('an overflow with compaction disabled propagates', async () => {
    const { models, controller } = createStepMockModels([{ content: '' }])

    const runPromise = run(
      <Agent
        provider="anthropic"
        model={ANTHROPIC_TEST_MODEL}
        maxTokens={100}
        stream={false}
      >
        <System>Test</System>
        <Message role="user">Hi</Message>
      </Agent>,
      { models },
    ).catch((e: unknown) => e)

    await controller.waitForNextCall()
    controller.rejectNextCall(
      'prompt is too long: 250000 tokens > 200000 maximum',
    )

    const error = (await runPromise) as Error
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('AgentryContextOverflowError')
  })
})

describe('compaction failure handling', () => {
  test('an aborted compaction is fatal, a transient one is not', async () => {
    // isFatalCompactionError could return false unconditionally and nothing
    // failed — so a user's abort mid-compaction was swallowed and the run
    // carried on.
    const abort = new Error('Aborted')
    abort.name = 'AbortError'
    expect(isFatalCompactionError(abort)).toBe(true)

    // Programming errors are not worth retrying past either.
    expect(isFatalCompactionError(new TypeError('boom'))).toBe(true)

    // Auth failures arrive as provider errors carrying the status in the
    // message — pi never sets `error.status`, which is why the old numeric
    // check was dead code.
    expect(
      isFatalCompactionError(new Error('provider returned 401 Unauthorized')),
    ).toBe(true)

    // A genuinely transient failure must stay non-fatal: compaction is
    // best-effort and should not kill an otherwise healthy run.
    expect(isFatalCompactionError(new Error('529 overloaded_error'))).toBe(
      false,
    )
  })
})
