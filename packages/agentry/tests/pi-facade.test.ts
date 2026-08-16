import { describe, expect, test } from 'bun:test'
import { Type, type AssistantMessage } from '@earendil-works/pi-ai'
import { toAgentStreamEvent } from '../src/pi/events'
import { toPiTool } from '../src/pi/tools'
import {
  getDefaultModels,
  resetSharedDefaultModels,
  resolveModel,
} from '../src/pi/models'
import { AgentryProviderError, createTurn } from '../src/pi/turn'
import type { AgentStreamEvent } from '../src/types/agent'
import type { InternalTool } from '../src/types/tools'
import { createStepMockModels, fauxText, fauxToolCall } from './utils/piMockProvider'

const partialWith = (
  content: AssistantMessage['content'],
): AssistantMessage => ({ content }) as AssistantMessage

describe('toAgentStreamEvent', () => {
  test('maps text_delta with accumulated text keyed by contentIndex', () => {
    const event = toAgentStreamEvent({
      type: 'text_delta',
      contentIndex: 1,
      delta: ' world',
      partial: partialWith([
        { type: 'thinking', thinking: 'hmm' },
        { type: 'text', text: 'hello world' },
      ]),
    })

    expect(event).toEqual({
      type: 'text',
      text: ' world',
      accumulated: 'hello world',
    })
  })

  test('falls back to the delta when the indexed block is not text', () => {
    const event = toAgentStreamEvent({
      type: 'text_delta',
      contentIndex: 9,
      delta: 'orphan',
      partial: partialWith([]),
    })

    expect(event).toEqual({
      type: 'text',
      text: 'orphan',
      accumulated: 'orphan',
    })
  })

  test('maps thinking_delta', () => {
    expect(
      toAgentStreamEvent({
        type: 'thinking_delta',
        contentIndex: 0,
        delta: 'reasoning',
        partial: partialWith([]),
      }),
    ).toEqual({ type: 'thinking', text: 'reasoning' })
  })

  test('maps toolcall_start by reading name and id off partial', () => {
    expect(
      toAgentStreamEvent({
        type: 'toolcall_start',
        contentIndex: 0,
        partial: partialWith([
          { type: 'toolCall', id: 'call_1', name: 'search', arguments: {} },
        ]),
      }),
    ).toEqual({ type: 'tool_use_start', toolName: 'search', toolId: 'call_1' })
  })

  test('maps done to message_complete', () => {
    expect(
      toAgentStreamEvent({
        type: 'done',
        reason: 'toolUse',
        message: partialWith([]),
      }),
    ).toEqual({ type: 'message_complete', stopReason: 'toolUse' })
  })

  test('drops lifecycle events and errors', () => {
    const dropped: Array<Parameters<typeof toAgentStreamEvent>[0]> = [
      { type: 'start', partial: partialWith([]) },
      { type: 'text_start', contentIndex: 0, partial: partialWith([]) },
      { type: 'text_end', contentIndex: 0, content: 'x', partial: partialWith([]) },
      { type: 'toolcall_delta', contentIndex: 0, delta: '{', partial: partialWith([]) },
      { type: 'error', reason: 'error', error: partialWith([]) },
    ]

    for (const event of dropped) {
      expect(toAgentStreamEvent(event)).toBeNull()
    }
  })
})

describe('toPiTool', () => {
  const base: InternalTool = {
    name: 'search',
    description: 'Search things',
    parameters: undefined as never,
    jsonSchema: { type: 'object', properties: { q: { type: 'string' } } },
    handler: () => 'ok',
  }

  test('passes the JSON schema through as parameters', () => {
    expect(toPiTool(base)).toEqual({
      name: 'search',
      description: 'Search things',
      parameters: base.jsonSchema as never,
    })
  })

  test('maps strict to constrained sampling with prefer', () => {
    expect(toPiTool({ ...base, strict: true })).toMatchObject({
      constrainedSampling: { type: 'json_schema', strict: 'prefer' },
    })
  })

  test('omits constrainedSampling when not strict', () => {
    expect(toPiTool(base)).not.toHaveProperty('constrainedSampling')
  })
})

describe('resolveModel', () => {
  test('resolves a known provider/model pair', () => {
    const { models, model } = createStepMockModels([])
    expect(resolveModel(models, model.provider, model.id).id).toBe(model.id)
  })

  test('lists available providers when the provider is unknown', () => {
    const { models } = createStepMockModels([])
    expect(() => resolveModel(models, 'nope', 'x')).toThrow(
      /Unknown provider "nope". Available providers:/,
    )
  })

  test('lists available models when the model is unknown', () => {
    const { models, model } = createStepMockModels([])
    expect(() => resolveModel(models, model.provider, 'nope')).toThrow(
      /Unknown model "nope" for provider/,
    )
  })
})

describe('createTurn', () => {
  const run = async (
    responses: Parameters<typeof createStepMockModels>[0],
    stream: boolean,
  ) => {
    const { models, model, controller } = createStepMockModels(responses)
    const events: AgentStreamEvent[] = []

    const turn = createTurn(models, {
      model,
      context: { messages: [{ role: 'user', content: 'hi', timestamp: 0 }] },
      stream,
      signal: new AbortController().signal,
      onStream: (event) => events.push(event),
    })

    await controller.nextTurn()
    return { message: await turn, events }
  }

  test('streaming emits mapped events and returns the message', async () => {
    const { message, events } = await run([{ content: 'hello' }], true)

    expect(message.stopReason).toBe('stop')
    expect(events.some((e) => e.type === 'text')).toBe(true)
    expect(events.at(-1)).toEqual({ type: 'message_complete', stopReason: 'stop' })
  })

  test('non-streaming synthesizes text, tool and completion events', async () => {
    const { message, events } = await run(
      [{ content: [fauxText('looking'), fauxToolCall('search', { q: 'x' })] }],
      false,
    )

    expect(message.stopReason).toBe('toolUse')
    expect(events).toEqual([
      { type: 'text', text: 'looking', accumulated: 'looking' },
      { type: 'tool_use_start', toolName: 'search', toolId: expect.any(String) },
      { type: 'message_complete', stopReason: 'toolUse' },
    ])
  })

  test('converts a provider error into a thrown AgentryProviderError', async () => {
    const { models, model, controller } = createStepMockModels([{ content: '' }])

    const turn = createTurn(models, {
      model,
      context: { messages: [{ role: 'user', content: 'hi', timestamp: 0 }] },
      stream: true,
      signal: new AbortController().signal,
      onStream: () => {},
    })

    await controller.waitForNextCall()
    controller.rejectNextCall('upstream exploded')

    await expect(turn).rejects.toThrow(AgentryProviderError)
  })
})

describe('createStepMockModels controller', () => {
  test('captures context and options per call', async () => {
    const { models, model, controller } = createStepMockModels([{ content: 'ok' }])

    const turn = createTurn(models, {
      model,
      context: {
        systemPrompt: 'be helpful',
        messages: [{ role: 'user', content: 'hi', timestamp: 0 }],
        tools: [
          toPiTool({
            name: 'noop',
            description: 'noop',
            parameters: undefined as never,
            jsonSchema: Type.Object({}) as never,
            handler: () => 'ok',
          }),
        ],
      },
      maxTokens: 512,
      temperature: 0.25,
      stream: true,
      signal: new AbortController().signal,
      onStream: () => {},
    })

    await controller.waitForNextCall()
    const call = controller.peekNextCall()

    expect(call?.context.systemPrompt).toBe('be helpful')
    expect(call?.context.tools?.[0]?.name).toBe('noop')
    expect(call?.options?.temperature).toBe(0.25)
    expect(call?.options?.maxTokens).toBe(512)
    expect(controller.getPendingCallCount()).toBe(1)
    expect(controller.getCurrentTurnNumber()).toBe(0)

    await controller.nextTurn()
    await turn

    expect(controller.getCurrentTurnNumber()).toBe(1)
    expect(controller.isComplete()).toBe(true)
  })
})

describe('getDefaultModels', () => {
  test('lazily builds pi’s catalog, caches it, and can be reset', async () => {
    resetSharedDefaultModels()

    // Concurrent callers must share one in-flight build rather than racing.
    const [first, second] = await Promise.all([
      getDefaultModels(),
      getDefaultModels(),
    ])
    expect(first).toBe(second)

    // The zero-config path has to actually carry providers, otherwise
    // `run(<Agent provider="anthropic" .../>)` could never resolve a model.
    expect(first.getProviders().length).toBeGreaterThan(1)
    expect(first.getProvider('anthropic')).toBeDefined()

    expect(await getDefaultModels()).toBe(first)

    resetSharedDefaultModels()
    expect(await getDefaultModels()).not.toBe(first)

    resetSharedDefaultModels()
  })
})
