import type { BetaContentBlock, BetaMessage, BetaMessageParam } from '@anthropic-ai/sdk/resources/beta';

/**
 * Information about a tool call in a step
 */
export interface StepToolCall {
  id: string;
  name: string;
  input: unknown;
}

/**
 * Information about a tool execution result in a step
 */
export interface StepToolResult {
  toolCallId: string;
  toolName: string;
  result: string | BetaContentBlock[];
  isError: boolean;
  executionTime?: number; // Milliseconds
}

/**
 * Token usage information for a step
 */
export interface StepUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  totalTokens: number;
}

/**
 * Result object provided to onStepFinish callback
 * Matches AI SDK's onStepFinish pattern
 *
 * @see https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text
 */
export interface OnStepFinishResult {
  /** 1-indexed step/iteration number */
  stepNumber: number;

  /** Text content generated in this step */
  text: string;

  /** Extended thinking content if present */
  thinking?: string;

  /** Tools that were called in this step */
  toolCalls: StepToolCall[];

  /** Results from tool execution */
  toolResults: StepToolResult[];

  /** Reason the step finished ('tool_use' | 'end_turn' | 'max_tokens' | etc.) */
  finishReason: string | null;

  /** Token usage for this step */
  usage: StepUsage;

  /** Full message from Claude API (advanced use) */
  message: BetaMessage;

  /** Immutable snapshot of full conversation history */
  messages: readonly BetaMessageParam[];

  /** Timestamp when step finished */
  timestamp: Date;
}
