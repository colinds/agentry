import type { OnStepFinishResult } from './lifecycle'
import type { AgentMessageParam } from './messages'
import type { ProviderName } from './provider'
import type { Model as AnthropicModel } from '@anthropic-ai/sdk/resources/messages'
import type OpenAI from 'openai'

export type Model =
  | AnthropicModel
  | NonNullable<OpenAI.Responses.ResponseCreateParamsNonStreaming['model']>

export interface AnthropicThinkingEnabled {
  type: 'enabled'
  budget_tokens: number
  interleaved: boolean
}

export interface OpenAIThinkingEnabled {
  type: 'enabled'
  effort: 'low' | 'medium' | 'high'
  summary: 'auto' | 'concise' | 'detailed'
}

export type ThinkingConfig =
  | { type: 'disabled' }
  | AnthropicThinkingEnabled
  | OpenAIThinkingEnabled

export interface AgentProps {
  provider?: ProviderName
  model?: Model

  name?: string
  description?: string
  maxTokens?: number
  maxIterations?: number
  stopSequences?: string[]
  temperature?: number
  stream?: boolean
  thinking?: ThinkingConfig
  betas?: string[]
  onMessage?: (message: AgentStreamEvent) => void
  onComplete?: (result: AgentResult) => void
  onError?: (error: Error) => void
  onStepFinish?: (result: OnStepFinishResult) => void | Promise<void>
  compactionControl?: CompactionControl
}

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
