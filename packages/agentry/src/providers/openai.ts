import type OpenAI from 'openai'
import type { ProviderAdapter, NormalizedTurnRequest, NormalizedTurnResponse } from './types'
import type { AgentContentBlock, AgentMessageParam } from '../types/messages'
import type { JsonObject } from '../types/json'
import { isCodeExecutionTool, isWebSearchTool } from '../types/tools'

type OpenAIResponseCreateParams = OpenAI.Responses.ResponseCreateParamsNonStreaming
type OpenAIResponseResult = OpenAI.Responses.Response
type OpenAIInputItem =
  | { role: 'user' | 'assistant'; content: string }
  | { type: 'function_call'; call_id: string; name: string; arguments: string }
  | { type: 'function_call_output'; call_id: string; output: string }

function stringifyContent(
  content:
    | string
    | Array<{ type: string; text?: string }>
    | undefined,
): string {
  if (!content) return ''
  if (typeof content === 'string') return content
  return content
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text ?? '')
    .join('\n')
}

function toOpenAIInput(messages: AgentMessageParam[]): OpenAIInputItem[] {
  const input: OpenAIInputItem[] = []
  for (const message of messages) {
    if (typeof message.content === 'string') {
      input.push({
        role: message.role,
        content: message.content,
      })
      continue
    }

    const text = message.content
      .filter((block) => block.type === 'text')
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
    if (text) {
      input.push({
        role: message.role,
        content: text,
      })
    }

    for (const block of message.content) {
      if (
        block.type === 'tool_use' &&
        'id' in block &&
        typeof block.id === 'string' &&
        'name' in block &&
        typeof block.name === 'string'
      ) {
        input.push({
          type: 'function_call',
          call_id: block.id,
          name: block.name,
          arguments: JSON.stringify(block.input ?? {}),
        })
        continue
      }
      if (
        block.type === 'tool_result' &&
        'tool_use_id' in block &&
        typeof block.tool_use_id === 'string'
      ) {
        input.push({
          type: 'function_call_output',
          call_id: block.tool_use_id,
          output: stringifyContent('content' in block ? block.content : undefined),
        })
      }
    }
  }
  return input
}

function parseOpenAIResponse(response: OpenAIResponseResult): NormalizedTurnResponse {
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
      let input: JsonObject = {}
      if (typeof item.arguments === 'string') {
        try {
          const parsed = JSON.parse(item.arguments)
          if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
            input = parsed as JsonObject
          }
        } catch {
          input = {}
        }
      }
      content.push({
        type: 'tool_use',
        id: item.call_id ?? item.id ?? `call_${Date.now()}`,
        name: item.name ?? 'tool',
        input,
      })
    } else if (item.type === 'reasoning' && typeof item.summary === 'string') {
      content.push({ type: 'thinking', thinking: item.summary })
    }
  }

  const stopReason = content.some((block) => block.type === 'tool_use')
    ? 'tool_use'
    : 'end_turn'

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

function toOpenAITools(request: NormalizedTurnRequest): OpenAI.Responses.Tool[] {
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

export const openaiAdapter: ProviderAdapter = {
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
    const payload: OpenAIResponseCreateParams = {
      model: request.model,
      input,
      tools: tools.length ? tools : undefined,
      max_output_tokens: request.maxTokens,
      temperature: request.temperature,
      stream: false,
    }

    if (systemText) {
      payload.instructions = systemText
    }

    const response = await client.responses.create(payload, {
      signal: request.signal,
    })
    const normalized = parseOpenAIResponse(response)
    const text = normalized.message.content
      .filter((block) => block.type === 'text')
      .map((block) => (block.type === 'text' ? block.text : ''))
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
