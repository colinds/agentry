import type OpenAI from 'openai'
import type {
  ProviderAdapter,
  NormalizedTurnRequest,
  NormalizedTurnResponse,
} from './types'
import type {
  AgentContentBlock,
  AgentMessageParam,
  TextContentBlock,
} from '../types/messages'
import type { JsonObject } from '../types/json'
import { isCodeExecutionTool, isWebSearchTool } from '../types/tools'
import { debug } from '../debug'

type OpenAIResponseCreateParams =
  OpenAI.Responses.ResponseCreateParamsNonStreaming
type OpenAIResponseCreateParamsStreaming =
  OpenAI.Responses.ResponseCreateParamsStreaming
type OpenAIResponseResult = OpenAI.Responses.Response
type OpenAIResponseStreamEvent = OpenAI.Responses.ResponseStreamEvent
export type OpenAIInputItem = OpenAI.Responses.ResponseInputItem

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

export function toOpenAIInput(
  messages: AgentMessageParam[],
): OpenAIInputItem[] {
  const input: OpenAIInputItem[] = []
  for (const message of messages) {
    if (typeof message.content === 'string') {
      input.push({ role: message.role, content: message.content })
      continue
    }
    for (const block of message.content) {
      if (block.type === 'text' && block.text) {
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
      }
      // thinking blocks intentionally ignored — no OpenAI equivalent
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
    if (item.type === 'message' && Array.isArray(item.content)) {
      for (const part of item.content) {
        if (part.type === 'output_text' && typeof part.text === 'string') {
          content.push({ type: 'text', text: part.text })
        }
      }
    } else if (item.type === 'function_call') {
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
    } else if (item.type === 'reasoning' && Array.isArray(item.summary)) {
      const text = (item.summary as Array<{ type: string; text?: string }>)
        .filter((s) => s.type === 'summary_text')
        .map((s) => s.text ?? '')
        .join('\n')
      if (text) content.push({ type: 'thinking', thinking: text })
    } else {
      debug('api', `OpenAI: unrecognized output item type: ${item.type}`)
    }
  }

  const stopReason =
    response.status === 'incomplete'
      ? (response.incomplete_details?.reason ?? 'length')
      : content.some((block) => block.type === 'tool_use')
        ? 'tool_use'
        : 'end_turn'

  if (!response.usage) {
    console.warn(
      '[agentry] OpenAI response missing usage field; token counts will be reported as 0',
    )
  }

  return {
    message: {
      content,
      stop_reason: stopReason,
      usage: {
        input_tokens: response.usage?.input_tokens ?? 0,
        output_tokens: response.usage?.output_tokens ?? 0,
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

  for (const sdkTool of request.sdkTools) {
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
        filters: sdkTool.allowed_domains
          ? { allowed_domains: sdkTool.allowed_domains }
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
    }
  }

  for (const server of request.mcpServers) {
    tools.push({
      type: 'mcp',
      server_label: server.name,
      server_url: server.url,
      authorization: server.authorization_token,
      allowed_tools: server.tool_configuration?.allowed_tools,
      require_approval: 'never',
    } satisfies OpenAI.Responses.Tool.Mcp)
  }

  return tools
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
    const normalized = parseOpenAIResponse(response)
    // fire synthetic stream events so the engine's onStream handler is always called
    for (const block of normalized.message.content) {
      if (block.type === 'thinking') {
        request.onStream({ type: 'thinking', text: block.thinking })
      }
    }
    const text = normalized.message.content
      .filter((block): block is TextContentBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
    if (text) {
      request.onStream({ type: 'text', text, accumulated: text })
    }
    for (const block of normalized.message.content) {
      if (block.type === 'tool_use') {
        request.onStream({
          type: 'tool_use_start',
          toolName: block.name,
          toolId: block.id,
        })
      }
    }
    request.onStream({
      type: 'message_complete',
      stopReason: normalized.message.stop_reason ?? 'unknown',
    })
    return normalized
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

  let accumulatedText = ''
  let finalResponse: OpenAIResponseResult | null = null

  for await (const event of stream as AsyncIterable<OpenAIResponseStreamEvent>) {
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
          console.error(
            '[agentry] OpenAI stream: function_call item missing call_id or name, skipping tool_use_start event',
            item,
          )
        }
      }
    } else if (event.type === 'response.completed') {
      finalResponse = event.response
    } else if (event.type === 'response.incomplete') {
      finalResponse = event.response
    } else if (event.type === 'response.failed') {
      const err = event.response.error
      throw new Error(
        `[agentry] OpenAI response failed: ${err?.message ?? JSON.stringify(err)}`,
      )
    }
  }

  if (!finalResponse) {
    throw new Error(
      '[agentry] OpenAI stream ended without a response.completed event',
    )
  }

  const normalized = parseOpenAIResponse(finalResponse)
  request.onStream({
    type: 'message_complete',
    stopReason: normalized.message.stop_reason ?? 'unknown',
  })
  return normalized
}
