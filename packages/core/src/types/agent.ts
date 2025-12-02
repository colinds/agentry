import type { Model } from '@anthropic-ai/sdk/resources/messages'
import type {
  BetaMessageParam,
  BetaThinkingConfigParam,
} from '@anthropic-ai/sdk/resources/beta'
import type { OnStepFinishResult } from './lifecycle.ts'

export type { Model }

export interface AgentProps {
  model: Model

  name?: string
  description?: string
  maxTokens?: number
  maxIterations?: number
  stopSequences?: string[]
  temperature?: number
  stream?: boolean
  thinking?: BetaThinkingConfigParam
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
  | { type: 'message_complete'; stopReason: string }

export interface AgentResult {
  content: string
  messages: BetaMessageParam[]
  usage: {
    inputTokens: number
    outputTokens: number
    cacheCreationInputTokens?: number
    cacheReadInputTokens?: number
  }
  stopReason: string | null
  thinking?: string
}

