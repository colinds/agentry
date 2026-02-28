import type { OnStepFinishResult } from './lifecycle'
import type { AgentMessageParam } from './messages'
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

export type ProviderVariant =
  | {
      provider: 'anthropic'
      model?: AnthropicModel
      thinking?: AnthropicThinkingEnabled | { type: 'disabled' }
      betas?: string[]
    }
  | {
      provider: 'openai'
      model?: OpenAIModel
      thinking?: OpenAIThinkingEnabled | { type: 'disabled' }
    }
  | { provider?: undefined; model?: Model; thinking?: ThinkingConfig }

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
  | { type: 'tool_use_input'; toolId: string; partialInput: string }
  | { type: 'tool_result'; toolId: string; result: string; isError: boolean }
  | {
      type: 'provider_event'
      itemType: string
      item: Record<string, unknown>
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
