import type { KnownProvider, ThinkingLevel } from '@earendil-works/pi-ai'
import type { OnStepFinishResult } from './lifecycle'
import type { AgentMessageParam, StopReason } from './messages'

export type { ThinkingLevel } from '@earendil-works/pi-ai'

/**
 * Provider ids pi ships with, while still allowing custom providers registered
 * on a `Models` collection. Model ids are plain strings — pi owns the catalog.
 */
export type ProviderId = KnownProvider | (string & {})
export type Model = string

export interface BaseAgentProps {
  name?: string
  description?: string
  maxTokens?: number
  maxIterations?: number
  temperature?: number
  stream?: boolean
  onMessage?: (message: AgentStreamEvent) => void
  onComplete?: (result: AgentResult) => void
  onError?: (error: Error) => void
  onStepFinish?: (result: OnStepFinishResult) => void | Promise<void>
  compactionControl?: CompactionControl
}

/**
 * Provider + model selection. Both are plain strings now that pi resolves them
 * against its catalog, so there is no per-provider discriminated union.
 */
export interface ProviderModelOverride {
  provider?: ProviderId
  model?: Model
}

export interface ProviderVariant extends ProviderModelOverride {
  /** Normalized reasoning effort; pi maps it to each provider's native knob. */
  thinking?: ThinkingLevel
}

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
  | { type: 'thinking'; text: string }
  | { type: 'message_complete'; stopReason: StopReason | null }

export interface AgentResult {
  content: string
  messages: AgentMessageParam[]
  usage: {
    inputTokens: number
    outputTokens: number
    cacheCreationInputTokens?: number
    cacheReadInputTokens?: number
    /** Total cost in USD, computed by pi from the model's rate card. */
    costUSD?: number
  }
  stopReason: StopReason | null
  thinking?: string
}
