import {
  clampThinkingLevel,
  isContextOverflow,
  retryAssistantCall,
  type Api,
  type ApiStreamOptions,
  type AssistantMessage,
  type CacheRetention,
  type Context,
  type Model,
  type Models,
  type ProviderHeaders,
  type RetryPolicy,
  type ThinkingLevel,
} from '@earendil-works/pi-ai'
import type { AgentStreamEvent } from '../types/agent'
import { toAgentStreamEvent } from './events'

/** Raised when a provider turn fails. pi reports failures as values, not throws. */
export class AgentryProviderError extends Error {
  readonly provider: string
  readonly model: string

  constructor(message: string, provider: string, model: string) {
    super(message)
    this.name = 'AgentryProviderError'
    this.provider = provider
    this.model = model
  }
}

/**
 * Raised when a turn failed because the conversation no longer fits the model's
 * context window.
 *
 * Distinguished from a generic provider error because it is the one failure the
 * caller can actually act on — by compacting and retrying — and because
 * providers signal it in wildly different ways (an error message, a silent
 * `usage.input > contextWindow`, or a zero-output length stop). pi's
 * `isContextOverflow` encodes those patterns for ~18 providers.
 */
export class AgentryContextOverflowError extends Error {
  readonly provider: string
  readonly model: string
  readonly contextWindow: number | undefined

  constructor(
    message: string,
    details: { provider: string; model: string; contextWindow?: number },
  ) {
    super(message)
    this.name = 'AgentryContextOverflowError'
    this.provider = details.provider
    this.model = details.model
    this.contextWindow = details.contextWindow
  }
}

export interface TurnRequest {
  model: Model<Api>
  context: Context
  maxTokens?: number
  temperature?: number
  reasoning?: ThinkingLevel
  cacheRetention?: CacheRetention
  /** Per-run identifier; lets providers key prompt caching to this agent run. */
  sessionId?: string
  /** Extra sampling knobs (top_p, top_k, ...). OpenAI-compatible APIs only. */
  samplingParams?: Record<string, unknown>
  /** Custom HTTP headers, e.g. for a corporate gateway. */
  headers?: ProviderHeaders
  /** Request timeout. Without this, provider SDK defaults apply (10 minutes). */
  timeoutMs?: number
  /** Retry policy for transient provider failures. */
  retry?: RetryPolicy
  stream: boolean
  /**
   * Require the model to call one of the supplied tools, where the API can
   * express that. APIs without a forced mode fall back to prompting, so callers
   * must still handle a turn that produced no tool call.
   */
  forceToolUse?: boolean
  signal: AbortSignal
  onStream: (event: AgentStreamEvent) => void
}

function resolveReasoning(
  model: Model<Api>,
  requested: ThinkingLevel | undefined,
): ThinkingLevel | undefined {
  if (!requested) return undefined
  const clamped = clampThinkingLevel(model, requested)
  return clamped === 'off' ? undefined : clamped
}

/**
 * Per-API spelling of "you must call a tool". This is the only place API
 * differences leak into option-building, and it stays behind the seam.
 */
function forcedToolChoice(api: Api): string | undefined {
  switch (api) {
    case 'anthropic-messages':
    case 'google-generative-ai':
    case 'google-vertex':
    case 'bedrock-converse-stream':
      return 'any'
    case 'openai-responses':
    case 'openai-completions':
    case 'azure-openai-responses':
    case 'openai-codex-responses':
    case 'mistral-conversations':
    case 'pi-messages':
      return 'required'
    default:
      // A provider pi adds later, or a custom api id. Sending the request
      // unforced is the safe degradation: the caller checks for the tool call
      // and errors if it is absent, rather than acting on a wrong answer.
      return undefined
  }
}

/**
 * The single seam between agentry's execution engine and pi.
 *
 * Behaviours normalized here so the engine above does not have to care:
 *
 * 1. **Errors become throws.** pi encodes request, model and runtime failures
 *    in the returned stream (`stopReason: 'error' | 'aborted'`) rather than
 *    throwing. `ExecutionEngine` drives its error state transition from a
 *    thrown exception, so both are converted back into throws. Context overflow
 *    gets its own error type because it is separately actionable.
 * 2. **Non-streaming turns still emit events.** Callers get the same
 *    `AgentStreamEvent` sequence whether or not `stream` is set, so callers
 *    never have to branch on transport.
 * 3. **Transient failures are retried.** pi's own retry helper classifies which
 *    failures are worth retrying (aborts are terminal, quota/billing fail fast).
 */
export async function createTurn(
  models: Models,
  request: TurnRequest,
): Promise<AssistantMessage> {
  const options = {
    maxTokens: request.maxTokens,
    temperature: request.temperature,
    // A model that does not support the requested level would otherwise error
    // or silently misbehave; clamping degrades instead. A model with no
    // thinking support at all clamps to 'off', which pi expresses as absence.
    reasoning: resolveReasoning(request.model, request.reasoning),
    cacheRetention: request.cacheRetention,
    sessionId: request.sessionId,
    samplingParams: request.samplingParams,
    headers: request.headers,
    timeoutMs: request.timeoutMs,
    signal: request.signal,
  }

  const produce = async (): Promise<AssistantMessage> => {
    if (request.forceToolUse) {
      // `complete` rather than `completeSimple`, because tool choice is a native
      // per-API option that the normalized surface does not model.
      const toolChoice = forcedToolChoice(request.model.api)
      // `reasoning` lives on pi's SimpleStreamOptions, but `complete` takes the
      // raw per-API options — it would ride along as an unknown key and be
      // dropped. Nothing requests both today; assert rather than silently
      // sending a request without the thinking configuration it asked for.
      if (options.reasoning !== undefined) {
        throw new Error(
          '[agentry] forceToolUse cannot be combined with reasoning: pi applies thinking levels only on the normalized (non-forced) path.',
        )
      }
      const { reasoning: _reasoning, ...rawOptions } = options
      return models.complete(request.model, request.context, {
        ...rawOptions,
        ...(toolChoice ? { toolChoice } : {}),
      } as ApiStreamOptions<Api>)
    }
    return models.completeSimple(request.model, request.context, options)
  }

  /**
   * One streaming attempt. Once content has been emitted a retry would replay
   * it, so the failure is raised as terminal; earlier failures are left for the
   * retry helper to classify.
   */
  const produceStream = async (): Promise<AssistantMessage> => {
    let emittedContent = false
    const stream = models.streamSimple(request.model, request.context, options)
    for await (const event of stream) {
      const mapped = toAgentStreamEvent(event)
      if (!mapped) continue
      if (carriesContent(mapped)) emittedContent = true
      request.onStream(mapped)
    }

    const message = await stream.result()
    if (emittedContent) throwIfFailed(message, request.model)
    return message
  }

  const message = await retryAssistantCall(
    request.stream ? produceStream : produce,
    request.retry,
    request.signal,
    {
      // oxlint-disable-next-line max-params -- arity is pi's RetryCallbacks signature
      onRetryScheduled: (attempt, maxAttempts, delayMs, errorMessage) =>
        request.onStream({
          type: 'retry',
          attempt,
          maxAttempts,
          delayMs,
          error: errorMessage,
        }),
    },
  )

  if (!request.stream) emitSyntheticEvents(message, request.onStream)

  throwIfFailed(message, request.model)
  return message
}

/**
 * Whether an event showed the consumer something a retry would repeat. Excludes
 * lifecycle events and the empty text delta a failed turn still emits.
 */
function carriesContent(event: AgentStreamEvent): boolean {
  switch (event.type) {
    case 'text':
    case 'thinking':
      return event.text.length > 0
    case 'tool_use_start':
      return true
    default:
      return false
  }
}

function throwIfFailed(
  message: AssistantMessage,
  model: Model<Api>,
): never | void {
  if (message.stopReason === 'aborted') {
    const error = new Error(message.errorMessage ?? 'Request was aborted')
    error.name = 'AbortError'
    throw error
  }

  // Checked before the error branch, because two of the three overflow shapes
  // pi recognises do NOT arrive as errors: a silent overflow reports
  // `stopReason: 'stop'` with `input + cacheRead` over the window, and some
  // providers signal it as a length stop with zero output. Gating this on
  // `stopReason === 'error'` made both unreachable — the run would simply end
  // with truncated or empty content and no explanation.
  if (isContextOverflow(message, model.contextWindow)) {
    throw new AgentryContextOverflowError(
      message.errorMessage ?? 'Conversation exceeded the model context window',
      {
        provider: model.provider,
        model: model.id,
        contextWindow: model.contextWindow,
      },
    )
  }

  if (message.stopReason === 'error') {
    throw new AgentryProviderError(
      message.errorMessage ?? 'Provider request failed',
      model.provider,
      model.id,
    )
  }

  // `deferred` and `pending` carry no content and no tool calls, so letting
  // them through would end the run with empty output and no error at all.
  // agentry never requests deferred responses, but failing loudly beats a
  // silent empty result if that ever changes.
  if (message.stopReason === 'deferred' || message.stopReason === 'pending') {
    throw new AgentryProviderError(
      `Provider returned an unsupported stop reason "${message.stopReason}". ` +
        `agentry does not support deferred responses.`,
      model.provider,
      model.id,
    )
  }
}

/**
 * Replays a completed message as the event sequence a streaming turn would
 * have produced, so non-streaming callers see identical `onStream` output.
 */
function emitSyntheticEvents(
  message: AssistantMessage,
  onStream: (event: AgentStreamEvent) => void,
): void {
  let accumulated = ''

  for (const block of message.content) {
    switch (block.type) {
      case 'text':
        accumulated += block.text
        onStream({ type: 'text', text: block.text, accumulated })
        break
      case 'thinking':
        onStream({ type: 'thinking', text: block.thinking })
        break
      case 'toolCall':
        onStream({
          type: 'tool_use_start',
          toolName: block.name,
          toolId: block.id,
        })
        break
    }
  }

  onStream({ type: 'message_complete', stopReason: message.stopReason })
}
