import type { AgentMessage, AgentMessageParam } from './messages'
import type { z } from 'zod'

export interface StepToolCall {
  id: string
  name: string
  input: z.output<z.ZodType>
}

export interface StepToolResult {
  toolCallId: string
  toolName: string
  result: string | Array<{ type: 'text'; text: string }>
  isError: boolean
  executionTime?: number // milliseconds
}

export interface StepUsage {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens?: number
  cacheReadTokens?: number
  totalTokens: number
}

/**
 * Result object provided to onStepFinish callback
 */
export interface OnStepFinishResult {
  /** 1-indexed step/iteration number */
  stepNumber: number

  /** Text content generated in this step */
  text: string

  /** Extended thinking content if present */
  thinking?: string

  /** Tools that were called in this step */
  toolCalls: StepToolCall[]

  /** Results from tool execution */
  toolResults: StepToolResult[]

  /** Reason the step finished ('tool_use' | 'end_turn' | 'max_tokens' | etc.) */
  finishReason: string | null

  /** Token usage for this step */
  usage: StepUsage

  /** Full message from the provider API (advanced use) */
  message: AgentMessage

  /** Immutable snapshot of full conversation history */
  messages: readonly AgentMessageParam[]

  /** Timestamp when step finished */
  timestamp: Date
}
