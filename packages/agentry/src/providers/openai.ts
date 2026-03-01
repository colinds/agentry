import type OpenAI from 'openai'
import type {
  ProviderAdapter,
  NormalizedTurnRequest,
  NormalizedTurnResponse,
} from './types'
import type { AgentContentBlock, AgentMessageParam } from '../types/messages'
import type { JsonObject } from '../types/json'
import { isCodeExecutionTool, isWebSearchTool } from '../types/tools'
import { emitSyntheticEvents } from './syntheticEvents'
import { debug } from '../debug'

type OpenAIResponseCreateParams =
  OpenAI.Responses.ResponseCreateParamsNonStreaming
type OpenAIResponseCreateParamsStreaming =
  OpenAI.Responses.ResponseCreateParamsStreaming
type OpenAIResponseResult = OpenAI.Responses.Response
type OpenAIResponseStreamEvent = OpenAI.Responses.ResponseStreamEvent
type OpenAIInputItem = OpenAI.Responses.ResponseInputItem
type OpenAIResponsesClientEvent = OpenAI.Responses.ResponsesClientEvent

/**
 * Minimal interface for the WebSocket emitter — compatible with ResponsesWS from the openai SDK,
 * but injectable for testing without a real WebSocket connection.
 */
export interface ResponsesWSLike {
  on(
    event: 'event',
    handler: (e: OpenAI.Responses.ResponsesServerEvent) => void,
  ): void
  on(event: 'error', handler: (e: Error) => void): void
  off(
    event: 'event',
    handler: (e: OpenAI.Responses.ResponsesServerEvent) => void,
  ): void
  off(event: 'error', handler: (e: Error) => void): void
  send(event: OpenAIResponsesClientEvent): void
  close(): void
  /** Present on real ResponsesWS; absent on mocks */
  socket?: {
    readyState: number
    once(event: 'open', handler: () => void): void
    once(event: 'error', handler: (err: Error) => void): void
    once(event: 'close', handler: () => void): void
    off(event: 'open', handler: () => void): void
    off(event: 'error', handler: (err: Error) => void): void
    off(event: 'close', handler: () => void): void
  }
}

/** Typed error that carries the OpenAI error code for retry decisions */
export class OpenAITurnError extends Error {
  readonly code: string | undefined
  constructor(message: string, code?: string) {
    super(message)
    this.name = 'OpenAITurnError'
    this.code = code
  }
}

function stringifyContent(
  content: string | Array<{ type: string; text?: string }> | undefined,
): string {
  if (!content) return ''
  if (typeof content === 'string') return content
  return content
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text ?? '')
    .join('\n')
}

function toProviderOutputEventItem(
  item: OpenAIResponseResult['output'][number],
): { itemType: string; item: Record<string, unknown> } {
  return {
    itemType: item.type,
    item: item as unknown as Record<string, unknown>,
  }
}

export function getErrorEventDetails(event: {
  message?: unknown
  code?: unknown
  error?: { message?: unknown; code?: unknown } | null
}): { message: string; code?: string } {
  let message: string
  if (typeof event.message === 'string' && event.message.length > 0) {
    message = event.message
  } else if (
    typeof event.error?.message === 'string' &&
    event.error.message.length > 0
  ) {
    message = event.error.message
  } else {
    message = JSON.stringify(event)
  }

  let codeValue: string | undefined
  if (typeof event.code === 'string') {
    codeValue = event.code
  } else if (typeof event.error?.code === 'string') {
    codeValue = event.error.code
  }

  return {
    message,
    code: codeValue,
  }
}

export function toOpenAIInput(
  messages: AgentMessageParam[],
): OpenAIInputItem[] {
  const input: OpenAIInputItem[] = []
  for (const message of messages) {
    if (typeof message.content === 'string') {
      input.push({ role: message.role, content: message.content })
      continue
    }
    const itemCountBefore = input.length
    for (const block of message.content) {
      if (block.type === 'text' && block.text !== undefined) {
        input.push({ role: message.role, content: block.text })
      } else if (block.type === 'tool_use') {
        input.push({
          type: 'function_call',
          call_id: block.id,
          name: block.name,
          arguments: JSON.stringify(block.input ?? {}),
        } as OpenAIInputItem)
      } else if (block.type === 'tool_result') {
        const output = stringifyContent(block.content)
        input.push({
          type: 'function_call_output',
          call_id: block.tool_use_id,
          output: block.is_error ? `[ERROR] ${output}` : output,
        } as OpenAIInputItem)
      } else if (block.type === 'thinking') {
        // Thinking blocks have no OpenAI equivalent — intentionally skipped
      } else {
        console.warn(
          `[agentry] Unrecognized message block type "${(block as { type: string }).type}" skipped during input conversion`,
        )
      }
    }
    // If we emitted nothing for an assistant message (e.g. thinking-only turn),
    // insert an empty placeholder to preserve conversation structure.
    if (message.role === 'assistant' && input.length === itemCountBefore) {
      input.push({ role: 'assistant', content: '' })
    }
  }
  return input
}

function parseOpenAIResponse(
  response: OpenAIResponseResult,
): NormalizedTurnResponse {
  const content: AgentContentBlock[] = []
  const output = Array.isArray(response.output) ? response.output : []
  for (const item of output) {
    switch (item.type) {
      case 'message': {
        if (!Array.isArray(item.content)) break
        for (const part of item.content) {
          if (part.type === 'output_text' && typeof part.text === 'string') {
            content.push({ type: 'text', text: part.text })
          }
        }
        break
      }
      case 'function_call': {
        const callId = item.call_id ?? item.id
        if (!callId) {
          throw new Error(
            `[agentry] OpenAI returned a function_call with no call_id or id: ${JSON.stringify(item)}`,
          )
        }
        if (!item.name) {
          throw new Error(
            `[agentry] OpenAI returned a function_call with no name: ${JSON.stringify(item)}`,
          )
        }
        let input: JsonObject = {}
        if (typeof item.arguments === 'string') {
          let parsed: unknown
          try {
            parsed = JSON.parse(item.arguments)
          } catch (e) {
            throw new Error(
              `[agentry] OpenAI tool call "${item.name}": failed to parse arguments: ${item.arguments}`,
              { cause: e },
            )
          }
          if (
            typeof parsed === 'object' &&
            parsed !== null &&
            !Array.isArray(parsed)
          ) {
            input = parsed as JsonObject
          } else {
            throw new Error(
              `[agentry] OpenAI tool call "${item.name}": expected object arguments, got ${typeof parsed}`,
            )
          }
        }
        content.push({
          type: 'tool_use',
          id: callId,
          name: item.name,
          input,
        })
        break
      }
      case 'reasoning': {
        if (!Array.isArray(item.summary)) break
        const text = (item.summary as Array<{ type: string; text?: string }>)
          .filter((s) => s.type === 'summary_text')
          .map((s) => s.text ?? '')
          .join('\n')
        if (text) content.push({ type: 'thinking', thinking: text })
        break
      }
      case 'web_search_call':
      case 'code_interpreter_call':
      case 'file_search_call':
      case 'image_generation_call':
      case 'computer_call':
      case 'mcp_call':
      case 'mcp_list_tools':
      case 'mcp_approval_request':
      case 'compaction':
      case 'local_shell_call':
      case 'shell_call':
      case 'shell_call_output':
      case 'apply_patch_call':
      case 'apply_patch_call_output':
      case 'custom_tool_call': {
        // Tool metadata and server-side tool-call records are surfaced in
        // subsequent assistant message items, so they are intentionally skipped.
        break
      }
      default: {
        const unhandled: never = item
        console.warn(
          `[agentry] Unrecognized output item type "${(unhandled as { type: string }).type}"`,
        )
      }
    }
  }

  let stopReason: string
  if (content.some((block) => block.type === 'tool_use')) {
    stopReason = 'tool_use'
  } else if (response.status === 'incomplete') {
    stopReason = response.incomplete_details?.reason ?? 'length'
  } else {
    stopReason = 'end_turn'
  }

  if (!response.usage) {
    throw new Error(
      '[agentry] OpenAI response missing usage field; cannot track token counts for compaction',
    )
  }

  return {
    message: {
      content,
      stop_reason: stopReason,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    },
  }
}

function toOpenAITools(
  request: NormalizedTurnRequest,
): OpenAI.Responses.Tool[] {
  const tools: OpenAI.Responses.Tool[] = request.tools.map((tool) => ({
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.jsonSchema as OpenAI.Responses.FunctionTool['parameters'],
    strict: tool.strict ?? null,
  }))

  for (const sdkTool of request.builtInTools) {
    if (isCodeExecutionTool(sdkTool)) {
      tools.push({
        type: 'code_interpreter',
        container: { type: 'auto' },
      } satisfies OpenAI.Responses.Tool.CodeInterpreter)
      continue
    }

    if (isWebSearchTool(sdkTool)) {
      tools.push({
        type: 'web_search',
        search_context_size: 'medium',
        filters:
          sdkTool.allowed_domains || sdkTool.blocked_domains
            ? {
                ...(sdkTool.allowed_domains && {
                  allowed_domains: sdkTool.allowed_domains,
                }),
                ...(sdkTool.blocked_domains && {
                  blocked_domains: sdkTool.blocked_domains,
                }),
              }
            : undefined,
        user_location: sdkTool.user_location
          ? {
              type: 'approximate',
              city: sdkTool.user_location.city ?? null,
              region: sdkTool.user_location.region ?? null,
              country: sdkTool.user_location.country ?? null,
              timezone: sdkTool.user_location.timezone ?? null,
            }
          : undefined,
      } satisfies OpenAI.Responses.WebSearchTool)
      continue
    }

    throw new Error(
      `[agentry] Built-in tool "${sdkTool.type}" is not supported on OpenAI. ` +
        `Remove this component or switch to an Anthropic provider.`,
    )
  }

  for (const server of request.mcpServers) {
    tools.push({
      type: 'mcp',
      server_label: server.name,
      server_url: server.url,
      authorization: server.authorization_token ?? undefined,
      allowed_tools: server.tool_configuration?.allowed_tools,
      require_approval: 'never',
    } satisfies OpenAI.Responses.Tool.Mcp)
  }

  return tools
}

/**
 * Process a stream of OpenAI response events into a NormalizedTurnResponse.
 * Shared by both HTTP streaming and WebSocket modes.
 *
 * Returns the normalized result plus the response ID (for WebSocket state tracking).
 */
async function processResponseStream(
  stream: AsyncIterable<OpenAIResponseStreamEvent>,
  request: NormalizedTurnRequest,
): Promise<{ result: NormalizedTurnResponse; responseId: string | null }> {
  let accumulatedText = ''
  let finalResponse: OpenAIResponseResult | null = null

  for await (const event of stream) {
    if (event.type === 'response.output_text.delta') {
      accumulatedText += event.delta
      request.onStream({
        type: 'text',
        text: event.delta,
        accumulated: accumulatedText,
      })
    } else if (event.type === 'response.reasoning_summary_text.delta') {
      request.onStream({ type: 'thinking', text: event.delta })
    } else if (event.type === 'response.output_item.added') {
      const item = event.item
      request.onStream({
        type: 'provider_event',
        ...toProviderOutputEventItem(item),
      })
      if (item.type === 'function_call') {
        const callId = 'call_id' in item ? (item.call_id as string) : undefined
        const name = 'name' in item ? (item.name as string) : undefined
        if (callId && name) {
          request.onStream({
            type: 'tool_use_start',
            toolName: name,
            toolId: callId,
          })
        } else {
          throw new Error(
            `[agentry] OpenAI stream: function_call item missing call_id or name: ${JSON.stringify(item)}`,
          )
        }
      } else if (item.type === 'code_interpreter_call') {
        request.onStream({
          type: 'tool_use_start',
          toolName: 'code_interpreter',
          toolId: item.id,
        })
      } else if (item.type === 'web_search_call') {
        request.onStream({
          type: 'tool_use_start',
          toolName: 'web_search',
          toolId: item.id,
        })
      } else if (item.type === 'mcp_call') {
        request.onStream({
          type: 'tool_use_start',
          toolName: `mcp:${item.name}`,
          toolId: item.id,
        })
      } else if (item.type === 'file_search_call') {
        request.onStream({
          type: 'tool_use_start',
          toolName: 'file_search',
          toolId: item.id,
        })
      } else if (item.type === 'image_generation_call') {
        request.onStream({
          type: 'tool_use_start',
          toolName: 'image_generation',
          toolId: item.id,
        })
      }
    } else if (event.type === 'response.completed') {
      finalResponse = event.response
    } else if (event.type === 'response.incomplete') {
      finalResponse = event.response
    } else if (event.type === 'response.failed') {
      const err = event.response.error
      throw new OpenAITurnError(
        `[agentry] OpenAI response failed: ${err?.message ?? JSON.stringify(err)}`,
        err?.code as string | undefined,
      )
    } else if (event.type === 'error') {
      // Application-level error event from server (e.g. previous_response_not_found)
      const { message, code } = getErrorEventDetails(
        event as {
          message?: unknown
          code?: unknown
          error?: { message?: unknown; code?: unknown } | null
        },
      )
      throw new OpenAITurnError(`[agentry] OpenAI error: ${message}`, code)
    }
  }

  if (!finalResponse) {
    throw new Error(
      '[agentry] OpenAI stream ended without a response.completed event',
    )
  }

  const result = parseOpenAIResponse(finalResponse)
  request.onStream({
    type: 'message_complete',
    stopReason: result.message.stop_reason ?? 'unknown',
  })

  return { result, responseId: finalResponse.id ?? null }
}

export const openaiAdapter: ProviderAdapter<'openai'> = {
  name: 'openai',
  async createTurn(
    client: OpenAI,
    request: NormalizedTurnRequest,
  ): Promise<NormalizedTurnResponse> {
    const tools = toOpenAITools(request)

    const systemText =
      typeof request.system === 'string'
        ? request.system
        : request.system?.map((s) => s.text).join('\n')

    const input = toOpenAIInput(request.messages)
    const oaiThinking =
      request.thinking?.type === 'enabled' && 'effort' in request.thinking
        ? request.thinking
        : undefined
    const basePayload = {
      model: request.model,
      input,
      tools: tools.length ? tools : undefined,
      max_output_tokens: request.maxTokens,
      temperature: request.temperature,
      ...(systemText ? { instructions: systemText } : {}),
      ...(request.stopSequences?.length ? { stop: request.stopSequences } : {}),
      ...(oaiThinking
        ? {
            reasoning: {
              effort: oaiThinking.effort,
              summary: oaiThinking.summary,
            },
          }
        : {}),
    }

    if (request.stream) {
      return streamOpenAITurn(client, basePayload, request)
    }

    const payload: OpenAIResponseCreateParams = {
      ...basePayload,
      stream: false,
    }
    const response = await client.responses.create(payload, {
      signal: request.signal,
    })
    const output = Array.isArray(response.output) ? response.output : []
    for (const item of output) {
      request.onStream({
        type: 'provider_event',
        ...toProviderOutputEventItem(item),
      })
    }

    const result = parseOpenAIResponse(response)

    emitSyntheticEvents(
      result.message.content,
      result.message.stop_reason,
      request.onStream,
    )

    return result
  },
}

async function streamOpenAITurn(
  client: OpenAI,
  basePayload: Omit<OpenAIResponseCreateParamsStreaming, 'stream'>,
  request: NormalizedTurnRequest,
): Promise<NormalizedTurnResponse> {
  const payload: OpenAIResponseCreateParamsStreaming = {
    ...basePayload,
    stream: true as const,
  }
  const stream = await client.responses.create(payload, {
    signal: request.signal,
  })

  const { result } = await processResponseStream(
    stream as AsyncIterable<OpenAIResponseStreamEvent>,
    request,
  )
  return result
}

/**
 * Convert a ResponsesWSLike event emitter into an async iterable of stream events.
 * Sends the given client event, then yields server events until a terminal event is received.
 */
async function* createWSEventStream(
  ws: ResponsesWSLike,
  wsEvent: OpenAIResponsesClientEvent,
  signal: AbortSignal,
): AsyncGenerator<OpenAIResponseStreamEvent> {
  const queue: Array<OpenAIResponseStreamEvent> = []
  let resolver: (() => void) | null = null
  let error: OpenAITurnError | null = null
  let done = false

  const wake = () => {
    resolver?.()
    resolver = null
  }

  const onEvent = (serverEvent: OpenAI.Responses.ResponsesServerEvent) => {
    queue.push(serverEvent as OpenAIResponseStreamEvent)
    const t = serverEvent.type
    if (
      t === 'response.completed' ||
      t === 'response.incomplete' ||
      t === 'response.failed' ||
      t === 'error'
    ) {
      done = true
    }
    wake()
  }

  const onError = (err: Error) => {
    // WebSocketError carries .error.code for specific error codes
    const wsErr = err as { error?: { code?: string | null } }
    const code =
      typeof wsErr.error?.code === 'string' ? wsErr.error.code : undefined
    error = new OpenAITurnError(err.message, code)
    done = true
    wake()
  }

  const onAbort = () => {
    const e = new Error('Request aborted')
    e.name = 'AbortError'
    error = e as OpenAITurnError
    done = true
    wake()
  }

  ws.on('event', onEvent)
  ws.on('error', onError)
  signal.addEventListener('abort', onAbort)

  if (signal.aborted) {
    onAbort()
  }

  try {
    ws.send(wsEvent)

    while (!done || queue.length > 0) {
      if (queue.length > 0) {
        yield queue.shift()!
      } else {
        await new Promise<void>((resolve) => {
          resolver = resolve
        })
      }
    }

    if (error) throw error
  } finally {
    ws.off('event', onEvent)
    ws.off('error', onError)
    signal.removeEventListener('abort', onAbort)
  }
}

/** Wait for the WebSocket socket to be open before sending */
async function waitForOpen(ws: ResponsesWSLike): Promise<void> {
  if (!ws.socket) return // No socket (mock/test mode)
  const socket = ws.socket
  if (socket.readyState === 1) return // Already OPEN (WS.OPEN = 1)
  if (socket.readyState === 2 || socket.readyState === 3) {
    throw new Error('[agentry] WebSocket connection is closed')
  }
  // readyState === 0 (CONNECTING) — wait for it to open
  await new Promise<void>((resolve, reject) => {
    const onOpen = () => {
      cleanup()
      resolve()
    }
    const onError = (err: unknown) => {
      cleanup()
      reject(err instanceof Error ? err : new Error(String(err)))
    }
    const onClose = () => {
      cleanup()
      reject(new Error('[agentry] WebSocket closed before opening'))
    }
    const cleanup = () => {
      socket.off('open', onOpen)
      socket.off('error', onError)
      socket.off('close', onClose)
    }
    socket.once('open', onOpen)
    socket.once('error', onError)
    socket.once('close', onClose)
  })
}

function isRetryableWSError(err: unknown): boolean {
  if (err instanceof OpenAITurnError) {
    return (
      err.code === 'previous_response_not_found' ||
      err.code === 'websocket_connection_limit_reached'
    )
  }
  if (err instanceof Error) {
    return (
      err.message.includes('previous_response_not_found') ||
      err.message.includes('websocket_connection_limit_reached')
    )
  }
  return false
}

/**
 * Create a stateful OpenAI adapter.
 *
 * When `websocket: true`, uses a persistent WebSocket connection and sends only
 * incremental input on continuation turns via `previous_response_id`, significantly
 * reducing per-turn latency in long tool-calling loops.
 *
 * @example
 * ```ts
 * import { createOpenAIAdapter } from 'agentry/openai'
 * import { createAI } from 'agentry'
 * import OpenAI from 'openai'
 *
 * const ai = createAI({
 *   providers: { openai: { client: new OpenAI(), websocket: true } },
 * })
 *
 * const result = await ai.run(<Agent provider="openai" model="gpt-4.1">...</Agent>)
 * ```
 *
 * @example advanced: manual lifecycle control
 * ```ts
 * import { createOpenAIAdapter } from 'agentry/openai'
 * const wsAdapter = createOpenAIAdapter({ websocket: true })
 * wsAdapter.close() // explicit cleanup when done
 * ```
 */
export function createOpenAIAdapter(options?: {
  /** Enable WebSocket transport + incremental input chaining */
  websocket?: boolean
  /**
   * Test-only: inject a custom WS factory instead of using ResponsesWS.
   * The factory receives the OpenAI client and returns a ResponsesWSLike emitter.
   * @internal
   */
  _responsesWSFactory?: (client: OpenAI) => ResponsesWSLike
}): ProviderAdapter<'openai'> & { close(): void } {
  if (!options?.websocket && !options?._responsesWSFactory) {
    // Plain HTTP adapter — same behaviour as openaiAdapter, just adds close()
    return {
      ...openaiAdapter,
      close() {},
    }
  }

  let responsesWS: ResponsesWSLike | null = null
  let previousResponseId: string | null = null
  /** messages.length at the start of the last completed turn */
  let previousResponseMessageCount = 0

  function resetContinuationState(): void {
    previousResponseId = null
    previousResponseMessageCount = 0
  }

  async function ensureWS(client: OpenAI): Promise<ResponsesWSLike> {
    if (!responsesWS) {
      if (options?._responsesWSFactory) {
        responsesWS = options._responsesWSFactory(client)
      } else {
        let ResponsesWSClass: new (client: OpenAI) => ResponsesWSLike
        try {
          const mod = await import('openai/resources/responses/ws')
          ResponsesWSClass = mod.ResponsesWS as unknown as new (
            client: OpenAI,
          ) => ResponsesWSLike
        } catch (importErr) {
          throw new Error(
            '[agentry] WebSocket mode requires the "ws" package. Install it: npm install ws',
            { cause: importErr },
          )
        }
        responsesWS = new ResponsesWSClass(client)
      }
    }
    return responsesWS
  }

  return {
    name: 'openai',

    async createTurn(
      client: OpenAI,
      request: NormalizedTurnRequest,
    ): Promise<NormalizedTurnResponse> {
      const tools = toOpenAITools(request)

      const systemText =
        typeof request.system === 'string'
          ? request.system
          : request.system?.map((s) => s.text).join('\n')

      const oaiThinking =
        request.thinking?.type === 'enabled' && 'effort' in request.thinking
          ? request.thinking
          : undefined

      const baseParams = {
        model: request.model as OpenAIResponsesClientEvent['model'],
        tools: tools.length ? tools : undefined,
        max_output_tokens: request.maxTokens,
        temperature: request.temperature,
        ...(systemText ? { instructions: systemText } : {}),
        ...(request.stopSequences?.length
          ? { stop: request.stopSequences }
          : {}),
        ...(oaiThinking
          ? {
              reasoning: {
                effort: oaiThinking.effort,
                summary: oaiThinking.summary,
              },
            }
          : {}),
        stream: true as const,
      }

      const currentMessageCount = request.messages.length
      const hadPreviousResponse = previousResponseId !== null

      let ws: ResponsesWSLike
      try {
        ws = await ensureWS(client)
        await waitForOpen(ws)
      } catch (err) {
        if (
          err instanceof TypeError ||
          err instanceof ReferenceError ||
          err instanceof SyntaxError
        ) {
          throw err
        }
        // WS failed to open — fall back to HTTP for this turn
        console.warn(
          `[agentry] WebSocket connection failed, falling back to HTTP: ${err instanceof Error ? err.message : String(err)}`,
        )
        debug(
          'openai',
          `WebSocket connection failed, falling back to HTTP: ${err instanceof Error ? err.message : String(err)}`,
        )
        responsesWS = null
        resetContinuationState()
        return openaiAdapter.createTurn(client, request)
      }

      try {
        let wsClientEvent: OpenAIResponsesClientEvent
        if (hadPreviousResponse) {
          // Incremental turn: skip the assistant message at previousResponseMessageCount
          // (it's stored server-side as previous_response_id) and send only new items
          const incrementalMessages = request.messages.slice(
            previousResponseMessageCount + 1,
          )
          wsClientEvent = {
            type: 'response.create',
            ...baseParams,
            previous_response_id: previousResponseId,
            input: toOpenAIInput(incrementalMessages),
          }
        } else {
          wsClientEvent = {
            type: 'response.create',
            ...baseParams,
            input: toOpenAIInput(request.messages),
          }
        }

        const stream = createWSEventStream(ws, wsClientEvent, request.signal)
        const { result, responseId } = await processResponseStream(
          stream,
          request,
        )
        // Record state for the next turn
        previousResponseMessageCount = currentMessageCount
        previousResponseId = responseId
        return result
      } catch (err) {
        // Abort errors should propagate immediately — not be retried
        if (err instanceof Error && err.name === 'AbortError') throw err
        if (isRetryableWSError(err)) {
          console.warn(
            `[agentry] Retryable WebSocket error (${err instanceof OpenAITurnError ? err.code : 'unknown'}), falling back to HTTP`,
          )
          debug(
            'openai',
            `Retryable WebSocket error (${err instanceof OpenAITurnError ? err.code : 'unknown'}), falling back to HTTP`,
          )
          // Reset state and retry with full context over HTTP
          responsesWS?.close()
          responsesWS = null
          resetContinuationState()
          return openaiAdapter.createTurn(client, request)
        }
        throw err
      }
    },

    resetChain() {
      resetContinuationState()
    },

    close() {
      responsesWS?.close()
      responsesWS = null
      resetContinuationState()
    },
  }
}
