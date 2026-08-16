import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  type Api,
  type AssistantMessage,
  type Context,
  type Model,
  type Models,
  type SimpleStreamOptions,
} from '@earendil-works/pi-ai'
import type { FauxContentBlock } from '@earendil-works/pi-ai/providers/faux'

export { fauxText, fauxToolCall }

export interface PiMockResponse {
  content: string | FauxContentBlock | FauxContentBlock[]
  /** Inferred from content when omitted: `toolUse` if a tool call is present. */
  stopReason?: AssistantMessage['stopReason']
  errorMessage?: string
}

export interface PiPendingCall {
  /** Everything the engine sent for this turn: system prompt, messages, tools. */
  context: Context
  options: SimpleStreamOptions | undefined
  model: Model<string>
  turnNumber: number
}

/**
 * Mirrors the turn-by-turn contract of the old `StepMockController` so existing
 * suites port without restructuring. The mechanism differs: instead of stubbing
 * an SDK client object, this scripts pi's `fauxProvider` with response
 * factories, which receive the full `(context, options, state, model)` of every
 * call and may return a promise — giving both param capture and turn gating.
 */
export interface PiStepMockController {
  /** Wait for a call to be queued, then release it with its scripted response. */
  nextTurn(): Promise<void>
  /** Wait for the next call to be queued without releasing it. */
  waitForNextCall(): Promise<void>
  getPendingCallCount(): number
  peekNextCall(): PiPendingCall | null
  getPendingCalls(): PiPendingCall[]
  getCurrentTurnNumber(): number
  isComplete(): boolean
  /** Release the next pending call with a caller-supplied response instead. */
  resolveNextCall(response: PiMockResponse): void
  /** Fail the next pending call. pi surfaces this as `stopReason: 'error'`. */
  rejectNextCall(message: string): void
  /** Every call made so far, in order — including already-released turns. */
  getCallHistory(): PiPendingCall[]
}

interface PendingEntry extends PiPendingCall {
  release: (response: PiMockResponse) => void
}

function toAssistantMessage(response: PiMockResponse): AssistantMessage {
  const blocks =
    typeof response.content === 'string'
      ? [fauxText(response.content)]
      : Array.isArray(response.content)
        ? response.content
        : [response.content]

  const hasToolCall = blocks.some((block) => block.type === 'toolCall')

  return fauxAssistantMessage(blocks, {
    stopReason: response.stopReason ?? (hasToolCall ? 'toolUse' : 'stop'),
    ...(response.errorMessage ? { errorMessage: response.errorMessage } : {}),
  })
}

/**
 * Creates a `Models` collection whose single provider replays `responses` one
 * turn at a time under the controller's direction.
 *
 * @example
 * ```ts
 * const { models, model, controller } = createStepMockModels([
 *   { content: [fauxToolCall('search', { query: 'test' })] },
 *   { content: 'Results found' },
 * ])
 *
 * const handle = createAgent(<Agent />, { models })
 * const run = handle.run()
 *
 * await controller.nextTurn()
 * expect(controller.peekNextCall()?.context.tools).toHaveLength(1)
 * await controller.nextTurn()
 * await run
 * ```
 */
export interface StepMockProviderOptions {
  /** Provider id the faux provider registers under (default: 'anthropic'). */
  provider?: string
  /** Wire protocol reported by the faux model. */
  api?: string
  /** Model ids the faux provider serves, in addition to the defaults. */
  modelIds?: string[]
}

/**
 * Model ids the suite declares on `<Agent model=...>`. The faux provider has to
 * serve all of them, because model resolution now goes through pi's catalog
 * rather than being an opaque string handed to an SDK client.
 */
const DEFAULT_MOCK_MODEL_IDS = [
  'claude-3-5-haiku-20241022',
  'claude-haiku-4-5',
  'claude-sonnet-4',
  'claude-sonnet-4-5',
  'claude-opus-4',
  'claude-opus-4-5',
  'gpt-5-mini',
  'gpt-4.1-mini',
  'old-model',
  'new-model',
]

export function createStepMockModels(
  responses: PiMockResponse[],
  options: StepMockProviderOptions = {},
): {
  models: Models
  model: Model<Api>
  controller: PiStepMockController
  /** Escape hatch for tests that want to script pi's faux provider directly. */
  faux: ReturnType<typeof fauxProvider>
} {
  const pending: PendingEntry[] = []
  const history: PiPendingCall[] = []
  const waiters: Array<() => void> = []
  let turnsCompleted = 0

  const notifyWaiters = () => {
    while (waiters.length > 0) waiters.shift()?.()
  }

  const faux = fauxProvider({
    provider: options.provider ?? 'anthropic',
    ...(options.api ? { api: options.api } : {}),
    // `reasoning: true` so `clampThinkingLevel` does not degrade a requested
    // thinking level to 'off'; tests that want the no-support path construct a
    // faux provider without it.
    models: [...(options.modelIds ?? []), ...DEFAULT_MOCK_MODEL_IDS].map(
      (id) => ({ id, reasoning: true }),
    ),
  })
  faux.setResponses(
    responses.map((scripted, index) => (context, options, _state, model) => {
      return new Promise<AssistantMessage>((resolve, reject) => {
        history.push({ context, options, model, turnNumber: index + 1 })
        pending.push({
          context,
          options,
          model,
          turnNumber: index + 1,
          release: (response) => {
            const entry = pending.shift()
            if (!entry) return
            turnsCompleted++
            if (response.stopReason === 'error') {
              reject(new Error(response.errorMessage ?? 'mock provider error'))
              return
            }
            resolve(toAssistantMessage(response))
          },
        })
        notifyWaiters()
      })
    }),
  )

  const models = createModels()
  models.setProvider(faux.provider)

  const waitForNextCall = async (): Promise<void> => {
    if (pending.length > 0) return
    await new Promise<void>((resolve) => {
      waiters.push(resolve)
    })
  }

  const controller: PiStepMockController = {
    waitForNextCall,

    async nextTurn() {
      await waitForNextCall()
      const entry = pending[0]
      if (!entry) return
      entry.release(responses[entry.turnNumber - 1] ?? { content: '' })
      // Let the engine consume the resolved turn before the caller asserts.
      await Promise.resolve()
    },

    getPendingCallCount: () => pending.length,
    peekNextCall: () => pending[0] ?? null,
    getPendingCalls: () => [...pending],
    getCurrentTurnNumber: () => turnsCompleted,
    isComplete: () => turnsCompleted >= responses.length,

    resolveNextCall(response) {
      pending[0]?.release(response)
    },

    rejectNextCall(message) {
      pending[0]?.release({
        content: '',
        stopReason: 'error',
        errorMessage: message,
      })
    },

    getCallHistory: () => [...history],
  }

  return { models, model: faux.getModel(), controller, faux }
}

/**
 * Builds one `Models` collection backed by several scripted faux providers, so
 * cross-provider tests (an Anthropic parent delegating to an OpenAI subagent,
 * say) can drive each side independently.
 */
export function createMultiProviderMockModels(
  scripts: Record<string, PiMockResponse[]>,
  modelIds: Record<string, string> = {},
): {
  models: Models
  controllers: Record<string, PiStepMockController>
} {
  const models = createModels()
  const controllers: Record<string, PiStepMockController> = {}

  for (const [provider, responses] of Object.entries(scripts)) {
    const built = createStepMockModels(responses, {
      provider,
      ...(modelIds[provider] ? { modelIds: [modelIds[provider]!] } : {}),
    })
    models.setProvider(built.faux.provider)
    controllers[provider] = built.controller
  }

  return { models, controllers }
}
