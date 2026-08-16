import type {
  CacheRetention,
  KnownProvider,
  ProviderHeaders,
  RetryPolicy,
  ThinkingLevel,
} from '@earendil-works/pi-ai'
import type { OnStepFinishResult } from './lifecycle'
import type { AgentMessageParam, StopReason } from './messages'

export type {
  CacheRetention,
  ProviderHeaders,
  RetryPolicy,
  ThinkingLevel,
} from '@earendil-works/pi-ai'

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

  /** Retry policy for transient provider failures. */
  retry?: RetryPolicy
  /** Prompt-cache retention hint. Defaults to pi's `'short'`. */
  cacheRetention?: CacheRetention
  /** Request timeout in ms. Without this the provider SDK default (10m) applies. */
  timeoutMs?: number
  /** Custom HTTP headers, e.g. to reach a corporate gateway. */
  headers?: ProviderHeaders
  /**
   * Extra sampling knobs merged into the request body (`top_p`, `top_k`, ...).
   * Applied only by OpenAI-compatible APIs; silently ignored on Anthropic,
   * Google and Bedrock.
   */
  samplingParams?: Record<string, unknown>
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
  /** Trigger compaction once a turn reports this many total tokens. */
  contextTokenThreshold?: number
  /**
   * How much of the recent conversation to keep verbatim rather than fold into
   * the summary. Defaults to ~16k tokens. Note that changing the transcript
   * invalidates the provider's prompt cache, so compact rarely.
   */
  keepRecentTokens?: number
  model?: Model
  summaryPrompt?: string
}

export type AgentStreamEvent =
  | { type: 'text'; text: string; accumulated: string }
  | { type: 'tool_use_start'; toolName: string; toolId: string }
  | { type: 'tool_result'; toolId: string; result: string; isError: boolean }
  | { type: 'thinking'; text: string }
  | {
      type: 'retry'
      attempt: number
      maxAttempts: number
      delayMs: number
      error: string
    }
  | { type: 'message_complete'; stopReason: StopReason | null }

export interface AgentResult {
  content: string
  messages: AgentMessageParam[]
  usage: {
    inputTokens: number
    outputTokens: number
    cacheCreationInputTokens?: number
    cacheReadInputTokens?: number
    /** Reasoning tokens, where the provider reports them. Subset of output. */
    reasoningTokens?: number
    /** Total cost in USD, computed by pi from the model's rate card. */
    costUSD?: number
    /**
     * Per-category cost breakdown. The cache split is the most actionable
     * signal here — it is how you find out your prompt cache is not hitting.
     */
    cost?: {
      input: number
      output: number
      cacheRead: number
      cacheWrite: number
      total: number
    }
  }
  stopReason: StopReason | null
  thinking?: string
}
