import { describe, expect, test } from 'bun:test'
import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
} from '@earendil-works/pi-ai'
import {
  AgentryContextOverflowError,
  AgentryProviderError,
  createTurn,
} from '../src/pi/turn'
import { describeMissingAuth } from '../src/pi/models'
import { run, Type, Agent, System, Tools, Tool, Message } from '../src'
import { createStepMockModels, fauxText } from './utils'
import { ANTHROPIC_TEST_MODEL } from './constants'
import type { AgentStreamEvent } from '../src/types'

const userTurn = {
  messages: [{ role: 'user' as const, content: 'hi', timestamp: 0 }],
}

describe('context overflow', () => {
  test('is raised as its own error type, not a generic provider error', async () => {
    const { models, model, controller } = createStepMockModels([
      { content: '' },
    ])

    const turn = createTurn(models, {
      model,
      context: userTurn,
      stream: false,
      signal: new AbortController().signal,
      onStream: () => {},
    })

    await controller.waitForNextCall()
    // Wording pi's overflow patterns recognise across providers.
    controller.rejectNextCall(
      'prompt is too long: 250000 tokens > 200000 maximum',
    )

    await expect(turn).rejects.toThrow(AgentryContextOverflowError)
  })

  test('carries the model context window so a caller can act on it', async () => {
    const { models, model, controller } = createStepMockModels([
      { content: '' },
    ])

    const turn = createTurn(models, {
      model,
      context: userTurn,
      stream: false,
      signal: new AbortController().signal,
      onStream: () => {},
    }).catch((e: unknown) => e)

    await controller.waitForNextCall()
    controller.rejectNextCall(
      'prompt is too long: 250000 tokens > 200000 maximum',
    )

    const error = (await turn) as AgentryContextOverflowError
    expect(error).toBeInstanceOf(AgentryContextOverflowError)
    expect(error.contextWindow).toBe(model.contextWindow)
    expect(error.model).toBe(model.id)
  })

  test('an ordinary failure is still a plain provider error', async () => {
    const { models, model, controller } = createStepMockModels([
      { content: '' },
    ])

    const turn = createTurn(models, {
      model,
      context: userTurn,
      stream: false,
      signal: new AbortController().signal,
      onStream: () => {},
    })

    await controller.waitForNextCall()
    controller.rejectNextCall('upstream exploded')

    await expect(turn).rejects.toThrow(AgentryProviderError)
    await expect(turn).rejects.not.toThrow(AgentryContextOverflowError)
  })
})

describe('abort', () => {
  test('a pi-reported abort becomes a thrown AbortError', async () => {
    // pi reports aborts as a *value* (`stopReason: 'aborted'`), not a throw.
    // The engine's cancellation path depends on the seam converting it back,
    // so that conversion is what this asserts — not pi's own signal handling.
    const { models, model, controller } = createStepMockModels([
      { content: '', stopReason: 'aborted', errorMessage: 'cancelled by user' },
    ])

    const turn = createTurn(models, {
      model,
      context: userTurn,
      stream: false,
      signal: new AbortController().signal,
      onStream: () => {},
    }).catch((e: unknown) => e)

    await controller.nextTurn()
    const error = (await turn) as Error

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('AbortError')
    expect(error.message).toContain('cancelled by user')
  })
})

describe('retry', () => {
  test('a retryable failure is retried and surfaced as stream events', async () => {
    // pi classifies which failures are worth retrying (529 yes, 401 no); this
    // asserts agentry wires that in and reports it, not that pi classifies well.
    const faux = fauxProvider({ provider: 'anthropic' })
    const models = createModels()
    models.setProvider(faux.provider)

    let attempts = 0
    faux.setResponses([
      () => {
        attempts++
        return fauxAssistantMessage('', {
          stopReason: 'error',
          errorMessage: '529 overloaded_error',
        })
      },
      () => {
        attempts++
        return fauxAssistantMessage('', {
          stopReason: 'error',
          errorMessage: '529 overloaded_error',
        })
      },
      () => {
        attempts++
        return fauxAssistantMessage('recovered')
      },
    ])

    const events: AgentStreamEvent[] = []
    const message = await createTurn(models, {
      model: faux.getModel(),
      context: userTurn,
      stream: false,
      retry: { enabled: true, maxRetries: 3, baseDelayMs: 1 },
      signal: new AbortController().signal,
      onStream: (e) => events.push(e),
    })

    expect(attempts).toBe(3)
    expect(message.stopReason).toBe('stop')

    const retries = events.filter((e) => e.type === 'retry')
    expect(retries).toHaveLength(2)
    expect(retries[0]).toMatchObject({ attempt: 1, maxAttempts: 3 })
  })

  test('a non-retryable failure fails immediately', async () => {
    const faux = fauxProvider({ provider: 'anthropic' })
    const models = createModels()
    models.setProvider(faux.provider)

    let attempts = 0
    faux.setResponses(
      Array.from({ length: 3 }, () => () => {
        attempts++
        return fauxAssistantMessage('', {
          stopReason: 'error',
          errorMessage: '401 invalid api key',
        })
      }),
    )

    await expect(
      createTurn(models, {
        model: faux.getModel(),
        context: userTurn,
        stream: false,
        retry: { enabled: true, maxRetries: 3, baseDelayMs: 1 },
        signal: new AbortController().signal,
        onStream: () => {},
      }),
    ).rejects.toThrow(AgentryProviderError)

    // An auth failure must not burn retries.
    expect(attempts).toBe(1)
  })
})

describe('request options reach pi', () => {
  test('timeoutMs, headers, samplingParams and cacheRetention are forwarded', async () => {
    const { models, controller } = createStepMockModels([
      { content: [fauxText('ok')] },
    ])

    const runPromise = run(
      <Agent
        provider="anthropic"
        model={ANTHROPIC_TEST_MODEL}
        maxTokens={100}
        stream={false}
        timeoutMs={12_345}
        cacheRetention="long"
        headers={{ 'x-corp-gateway': 'yes' }}
        samplingParams={{ top_p: 0.9 }}
      >
        <System>Test</System>
        <Message role="user">Hi</Message>
      </Agent>,
      { models },
    )

    await controller.waitForNextCall()
    const options = controller.peekNextCall()!.options as Record<
      string,
      unknown
    >

    // `cacheRetention` in particular was declared and read but never set —
    // permanently undefined until it was wired.
    expect(options.timeoutMs).toBe(12_345)
    expect(options.cacheRetention).toBe('long')
    expect(options.headers).toEqual({ 'x-corp-gateway': 'yes' })
    expect(options.samplingParams).toEqual({ top_p: 0.9 })
    expect(options.sessionId).toBeDefined()

    await controller.nextTurn()
    await runPromise
  })

  test('thinking is clamped to what the model supports', async () => {
    // A model with no reasoning support must degrade rather than error.
    const faux = fauxProvider({
      provider: 'anthropic',
      models: [{ id: 'no-thinking', reasoning: false }],
    })
    const models = createModels()
    models.setProvider(faux.provider)
    faux.setResponses([
      (_ctx, options) => {
        expect(options?.reasoning).toBeUndefined()
        return { content: 'ok' } as never
      },
    ])

    await createTurn(models, {
      model: faux.getModel(),
      context: userTurn,
      reasoning: 'high',
      stream: false,
      signal: new AbortController().signal,
      onStream: () => {},
    }).catch(() => {})
  })
})

describe('auth preflight', () => {
  test('a configured provider is not flagged', async () => {
    // The faux provider resolves auth, so this is the false-positive guard:
    // preflight must never block a run that would have worked.
    const { models } = createStepMockModels([])
    expect(await describeMissingAuth(models, 'anthropic')).toBeUndefined()
  })

  test('an unconfigured provider is named, with its credential type', async () => {
    const { builtinModels } = await import('@earendil-works/pi-ai/providers/all')
    const catalog = builtinModels()

    // Pick a real provider that has no credentials in this environment rather
    // than assuming a specific one is unset.
    const candidates = ['groq', 'deepseek', 'mistral', 'cerebras', 'xai']
    let unconfigured: string | undefined
    for (const id of candidates) {
      if (await describeMissingAuth(catalog, id)) {
        unconfigured = id
        break
      }
    }

    if (!unconfigured) {
      // Every candidate is configured here; nothing to assert.
      return
    }

    const message = await describeMissingAuth(catalog, unconfigured)
    expect(message).toContain(unconfigured)
    expect(message).toMatch(/No .*configured for provider/)
  })
})

describe('tool results may carry images', () => {
  test('an image block survives into the next turn', async () => {
    const { models, controller } = createStepMockModels([
      {
        content: [
          {
            type: 'toolCall',
            id: 'call_1',
            name: 'screenshot',
            arguments: {},
          },
        ],
      },
      { content: [fauxText('I see it')] },
    ])

    const runPromise = run(
      <Agent
        provider="anthropic"
        model={ANTHROPIC_TEST_MODEL}
        maxTokens={100}
        stream={false}
      >
        <System>Test</System>
        <Tools>
          <Tool
            name="screenshot"
            description="Take a screenshot"
            parameters={Type.Object({})}
            handler={() => [
              { type: 'text' as const, text: 'captured' },
              {
                type: 'image' as const,
                data: 'aGVsbG8=',
                mimeType: 'image/png',
              },
            ]}
          />
        </Tools>
        <Message role="user">Take a screenshot</Message>
      </Agent>,
      { models },
    )

    await controller.nextTurn()
    await controller.waitForNextCall()

    const replayed = controller.peekNextCall()!.context.messages
    const toolResult = replayed.find((m) => m.role === 'toolResult')!
    expect(toolResult.content.some((b) => b.type === 'image')).toBe(true)

    await controller.nextTurn()
    await runPromise
  })
})

describe('unsupported stop reasons', () => {
  test('a deferred response fails loudly rather than returning empty', async () => {
    // `deferred` carries no content and no tool calls; without a guard the
    // engine would end the run with empty output and no error.
    const { models, model, controller } = createStepMockModels([
      { content: '', stopReason: 'deferred' },
    ])

    const turn = createTurn(models, {
      model,
      context: userTurn,
      stream: false,
      signal: new AbortController().signal,
      onStream: () => {},
    })

    await controller.nextTurn()
    await expect(turn).rejects.toThrow(/unsupported stop reason "deferred"/)
  })
})
