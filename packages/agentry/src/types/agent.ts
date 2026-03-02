import type { OnStepFinishResult } from './lifecycle'
import type { AgentMessageParam } from './messages'
import type { JsonObject } from './json'
import type { Model as _AnthropicModel } from '@anthropic-ai/sdk/resources/messages'
import type {
  Reasoning,
  ReasoningEffort,
  ResponsesModel,
} from 'openai/resources/shared'

export type AnthropicModel = _AnthropicModel
export type OpenAIModel = ResponsesModel
export type Model = AnthropicModel | OpenAIModel

export interface AnthropicThinkingEnabled {
  type: 'enabled'
  budget_tokens: number
  interleaved: boolean
}

export interface OpenAIThinkingEnabled {
  type: 'enabled'
  effort: NonNullable<ReasoningEffort>
  summary: NonNullable<Reasoning['summary']>
}

export type ThinkingConfig =
  | { type: 'disabled' }
  | AnthropicThinkingEnabled
  | OpenAIThinkingEnabled

export interface BaseAgentProps {
  name?: string
  description?: string
  maxTokens?: number
  maxIterations?: number
  stopSequences?: string[]
  temperature?: number
  stream?: boolean
  onMessage?: (message: AgentStreamEvent) => void
  onComplete?: (result: AgentResult) => void
  onError?: (error: Error) => void
  onStepFinish?: (result: OnStepFinishResult) => void | Promise<void>
  compactionControl?: CompactionControl
}

/**
 * Base discriminated union for provider + model selection.
 * Narrows `model` to the correct SDK type based on `provider`.
 * Extended by `ProviderVariant` (Agent) and used directly by `Condition`.
 */
export type ProviderModelOverride =
  | { provider: 'anthropic'; model?: AnthropicModel }
  | { provider: 'openai'; model?: OpenAIModel }
  | { provider?: undefined; model?: Model }

export type ProviderVariant =
  | (Extract<ProviderModelOverride, { provider: 'anthropic' }> & {
      thinking?: AnthropicThinkingEnabled | { type: 'disabled' }
      betas?: string[]
    })
  | (Extract<ProviderModelOverride, { provider: 'openai' }> & {
      thinking?: OpenAIThinkingEnabled | { type: 'disabled' }
      websocket?: boolean
    })
  | (Extract<ProviderModelOverride, { provider?: undefined }> & {
      thinking?: ThinkingConfig
    })

export type AgentProps = BaseAgentProps & ProviderVariant

export interface CompactionControl {
  enabled: boolean
  contextTokenThreshold?: number
  model?: Model
  summaryPrompt?: string
}

export type AgentStreamEvent =
  | { type: 'text'; text: string; accumulated: string }
  | { type: 'tool_use_start'; toolName: string; toolId: string }
  | { type: 'tool_result'; toolId: string; result: string; isError: boolean }
  | {
      type: 'provider_event'
      itemType: string
      item: JsonObject
    }
  | { type: 'thinking'; text: string }
  | { type: 'message_complete'; stopReason: string | null }

export interface AgentResult {
  content: string
  messages: AgentMessageParam[]
  usage: {
    inputTokens: number
    outputTokens: number
    cacheCreationInputTokens?: number
    cacheReadInputTokens?: number
  }
  stopReason: string | null
  thinking?: string
}
