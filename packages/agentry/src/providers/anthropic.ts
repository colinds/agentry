import type Anthropic from '@anthropic-ai/sdk'
import type {
  BetaContentBlock,
  BetaContentBlockParam,
  MessageCreateParams,
  BetaMessage,
  BetaMessageParam,
  BetaToolUnion,
  BetaMemoryTool20250818,
} from '@anthropic-ai/sdk/resources/beta'
import type { Model as AnthropicModel } from '@anthropic-ai/sdk/resources/messages'
import { ANTHROPIC_BETAS } from '../constants'

import type { AgentContentBlock, AgentMessageParam } from '../types/messages'
import type {
  ProviderAdapter,
  NormalizedTurnRequest,
  NormalizedTurnResponse,
} from './types'
import {
  isCodeExecutionTool,
  isMemoryTool,
  isWebSearchTool,
} from '../types/tools'
import { toApiTool } from '../tools'
import type { BuiltInTool } from '../types/tools'
import type { JsonObject } from '../types/json'

export function toAnthropicMessage(
  message: AgentMessageParam,
): BetaMessageParam {
  if (typeof message.content === 'string') {
    return { role: message.role, content: message.content }
  }
  const content: BetaContentBlockParam[] = []
  for (const block of message.content) {
    switch (block.type) {
      case 'text':
        content.push({ type: 'text', text: block.text })
        break
      case 'thinking':
        // Anthropic thinking blocks in request history require provider-generated signatures.
        // We keep only user/assistant text and tool blocks when replaying history.
        break
      case 'tool_use':
        content.push({
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: block.input,
        })
        break
      case 'tool_result':
        content.push({
          type: 'tool_result',
          tool_use_id: block.tool_use_id,
          content: block.content,
          is_error: block.is_error,
        })
        break
      default:
        console.warn(
          `[agentry] Dropping unrecognized message block type "${(block as { type: string }).type}" during Anthropic message conversion`,
        )
    }
  }
  // Thinking blocks are dropped (no preserved signatures), so guard against
  // an empty content array which the Anthropic API rejects.
  if (message.role === 'assistant' && content.length === 0) {
    content.push({ type: 'text', text: '' })
  }
  return { role: message.role, content }
}

function toAgentBlocks(content: BetaContentBlock[]): AgentContentBlock[] {
  const blocks: AgentContentBlock[] = []
  for (const block of content) {
    switch (block.type) {
      case 'text':
        blocks.push({ type: 'text', text: block.text })
        break
      case 'thinking':
        blocks.push({ type: 'thinking', thinking: block.thinking })
        break
      case 'tool_use': {
        let input: JsonObject
        if (typeof block.input === 'object' && block.input !== null) {
          input = block.input as JsonObject
        } else {
          console.warn(
            `[agentry] Anthropic tool "${block.name}": non-object input coerced to {} (received ${typeof block.input})`,
          )
          input = {}
        }
        blocks.push({
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input,
        })
        break
      }
      default:
        console.warn(
          `[agentry] Unrecognized content block type "${(block as { type: string }).type}" — block dropped`,
        )
    }
  }
  return blocks
}

function toApiSdkTool(tool: BuiltInTool): BetaToolUnion {
  if (isCodeExecutionTool(tool)) {
    return { type: 'code_execution_20250825', name: 'code_execution' }
  }
  if (isWebSearchTool(tool)) {
    const { type: _, ...rest } = tool
    return { type: 'web_search_20250305', ...rest }
  }
  if (isMemoryTool(tool)) {
    const { type: _, memoryHandlers: _handlers, ...rest } = tool
    return { type: 'memory_20250818', ...rest } as BetaMemoryTool20250818
  }
  throw new Error(
    `[agentry] Unknown built-in tool type: ${JSON.stringify(tool)}`,
  )
}

function resolveAnthropicThinking(
  thinking: NormalizedTurnRequest['thinking'],
): MessageCreateParams['thinking'] {
  if (thinking?.type === 'enabled' && 'budget_tokens' in thinking) {
    return { type: 'enabled' as const, budget_tokens: thinking.budget_tokens }
  }
  if (thinking?.type === 'disabled') {
    return { type: 'disabled' as const }
  }
  return undefined
}

export const anthropicAdapter: ProviderAdapter<'anthropic'> = {
  name: 'anthropic',
  async createTurn(
    client: Anthropic,
    request: NormalizedTurnRequest,
  ): Promise<NormalizedTurnResponse> {
    const tools: BetaToolUnion[] = [
      ...request.tools.map(toApiTool),
      ...request.builtInTools.map(toApiSdkTool),
      ...request.mcpServers.map((server) => ({
        type: 'mcp_toolset' as const,
        mcp_server_name: server.name,
      })),
    ]

    const betas = new Set(request.betas ?? [])
    if (request.mcpServers.length > 0) {
      betas.add(ANTHROPIC_BETAS.MCP_CLIENT)
    }
    if (request.builtInTools.some(isCodeExecutionTool)) {
      betas.add(ANTHROPIC_BETAS.CODE_EXECUTION)
    }
    if (request.builtInTools.some(isMemoryTool)) {
      betas.add(ANTHROPIC_BETAS.CONTEXT_MANAGEMENT)
    }
    if (request.tools.some((tool) => tool.strict)) {
      betas.add(ANTHROPIC_BETAS.STRUCTURED_OUTPUTS)
    }
    if (
      request.thinking?.type === 'enabled' &&
      'budget_tokens' in request.thinking &&
      request.thinking.interleaved
    ) {
      betas.add(ANTHROPIC_BETAS.INTERLEAVED_THINKING)
    }

    const params: MessageCreateParams = {
      model: request.model as AnthropicModel,
      max_tokens: request.maxTokens,
      system: request.system,
      messages: request.messages.map(toAnthropicMessage),
      tools: tools.length > 0 ? tools : undefined,
      mcp_servers:
        request.mcpServers.length > 0 ? request.mcpServers : undefined,
      stop_sequences: request.stopSequences,
      temperature: request.temperature,
      betas: betas.size > 0 ? Array.from(betas) : undefined,
      thinking: resolveAnthropicThinking(request.thinking),
    }

    let response: BetaMessage
    if (request.stream) {
      const stream = client.beta.messages.stream(params, {
        signal: request.signal,
      })
      stream.on('text', (text, snapshot) => {
        request.onStream({ type: 'text', text, accumulated: snapshot })
      })
      stream.on('thinking', (thinking) => {
        request.onStream({ type: 'thinking', text: thinking })
      })
      stream.on('contentBlock', (block) => {
        if (block.type === 'tool_use') {
          request.onStream({
            type: 'tool_use_start',
            toolName: block.name,
            toolId: block.id,
          })
        }
      })
      response = await stream.finalMessage()
      request.onStream({
        type: 'message_complete',
        stopReason: response.stop_reason ?? 'unknown',
      })
    } else {
      response = await client.beta.messages.create(
        { ...params, stream: false },
        { signal: request.signal },
      )
    }

    return {
      message: {
        content: toAgentBlocks(response.content),
        stop_reason: response.stop_reason,
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
          cache_creation_input_tokens:
            response.usage.cache_creation_input_tokens ?? null,
          cache_read_input_tokens:
            response.usage.cache_read_input_tokens ?? null,
        },
      },
    }
  },
}
