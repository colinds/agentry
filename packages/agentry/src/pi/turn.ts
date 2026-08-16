import type {
  Api,
  AssistantMessage,
  CacheRetention,
  Context,
  Model,
  Models,
  ThinkingLevel,
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

export interface TurnRequest {
  model: Model<Api>
  context: Context
  maxTokens?: number
  temperature?: number
  reasoning?: ThinkingLevel
  cacheRetention?: CacheRetention
  /** Per-run identifier; lets providers key prompt caching to this agent run. */
  sessionId?: string
  stream: boolean
  signal: AbortSignal
  onStream: (event: AgentStreamEvent) => void
}

/**
 * The single seam between agentry's execution engine and pi.
 *
 * Two behaviours are deliberately normalized here so the engine above does not
 * have to care:
 *
 * 1. **Errors become throws.** pi encodes request, model and runtime failures
 *    in the returned stream (`stopReason: 'error' | 'aborted'`) rather than
 *    throwing. `ExecutionEngine` drives its error state transition from a
 *    thrown exception, so both are converted back into throws.
 * 2. **Non-streaming turns still emit events.** Callers get the same
 *    `AgentStreamEvent` sequence whether or not `stream` is set, matching the
 *    guarantee the previous provider adapters made.
 */
export async function createTurn(
  models: Models,
  request: TurnRequest,
): Promise<AssistantMessage> {
  const options = {
    maxTokens: request.maxTokens,
    temperature: request.temperature,
    reasoning: request.reasoning,
    cacheRetention: request.cacheRetention,
    sessionId: request.sessionId,
    signal: request.signal,
  }

  let message: AssistantMessage

  if (request.stream) {
    const stream = models.streamSimple(request.model, request.context, options)
    for await (const event of stream) {
      const mapped = toAgentStreamEvent(event)
      if (mapped) request.onStream(mapped)
    }
    message = await stream.result()
  } else {
    message = await models.completeSimple(
      request.model,
      request.context,
      options,
    )
    emitSyntheticEvents(message, request.onStream)
  }

  throwIfFailed(message, request.model)
  return message
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

  if (message.stopReason === 'error') {
    throw new AgentryProviderError(
      message.errorMessage ?? 'Provider request failed',
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
