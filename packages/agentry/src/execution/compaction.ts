import type { Api, Model, Models } from '@earendil-works/pi-ai'
import {
  isAssistantMessage,
  isTextBlock,
  isToolResultMessage,
  userMessage,
  type AgentMessage,
  type AgentMessageParam,
} from '../types/messages'
import { extractToolCalls } from '../types/messages'
import { createTurn } from '../pi/turn'
import { debug } from '../debug'

export const DEFAULT_TOKEN_THRESHOLD = 100_000

/**
 * How much recent conversation to keep verbatim.
 *
 * Compaction used to replace the whole transcript with a summary, which took
 * the model's recent context away at exactly the moment it was deepest in a
 * task. Keeping a recent window costs tokens but preserves the detail a summary
 * necessarily loses.
 */
export const DEFAULT_KEEP_RECENT_TOKENS = 16_000

export const DEFAULT_SUMMARY_PROMPT = `You have been working on the task described above but have not yet completed it. Write a continuation summary that will allow you (or another instance of yourself) to resume work efficiently in a future context window where the conversation history will be replaced with this summary. Your summary should be structured, concise, and actionable. Include:
1. Task Overview
2. Current State
3. Important Discoveries
4. Next Steps
5. Context to Preserve
Be concise but complete. Write in a way that enables immediate resumption of the task.
Wrap your summary in <summary></summary> tags.`

export interface CompactionSettings {
  enabled: boolean
  contextTokenThreshold?: number
  keepRecentTokens?: number
  model?: string
  summaryPrompt?: string
}

/**
 * Rough token estimate. Deliberately crude — it only decides where to cut, and
 * an exact count would need a per-model tokenizer for a decision that is
 * tolerant of being off by a chunk.
 */
export function estimateTokens(message: AgentMessageParam): number {
  const text =
    typeof message.content === 'string'
      ? message.content
      : JSON.stringify(message.content)
  return Math.ceil(text.length / 4)
}

/**
 * Picks the index to cut at, keeping roughly `keepRecentTokens` of the tail.
 *
 * The cut must land on a turn boundary. Splitting an assistant message from the
 * tool results that answer it produces a transcript the provider rejects — an
 * assistant `toolCall` with no matching result — so the scan walks back to a
 * message that opens a turn rather than cutting wherever the budget runs out.
 */
export function findCutIndex(
  messages: readonly AgentMessageParam[],
  keepRecentTokens: number,
): number {
  let budget = keepRecentTokens
  let index = messages.length

  for (let i = messages.length - 1; i >= 0; i--) {
    budget -= estimateTokens(messages[i]!)
    if (budget <= 0) {
      index = i
      break
    }
    index = i
  }

  // Walk forward to the next message that can legally start a conversation:
  // never a tool result (its call would be gone), and never an assistant turn
  // that itself has unanswered tool calls.
  while (index < messages.length) {
    const message = messages[index]!
    const opensTurn =
      !isToolResultMessage(message) &&
      !(isAssistantMessage(message) && extractToolCalls(message).length > 0)
    if (opensTurn) break
    index++
  }

  return index
}

export interface CompactionResult {
  compacted: boolean
  messages?: AgentMessageParam[]
}

/**
 * Summarizes the older part of the conversation and keeps the recent tail.
 *
 * Returns the replacement transcript rather than mutating a store, so the
 * decision to apply it stays with the caller.
 */
export async function compactMessages(options: {
  models: Models
  model: Model<Api>
  messages: readonly AgentMessageParam[]
  settings: CompactionSettings
  maxTokens: number
  signal?: AbortSignal
}): Promise<CompactionResult> {
  const { models, model, messages, settings, maxTokens, signal } = options

  const keepRecentTokens =
    settings.keepRecentTokens ?? DEFAULT_KEEP_RECENT_TOKENS
  const cutIndex = findCutIndex(messages, keepRecentTokens)

  // Nothing old enough to be worth summarizing.
  if (cutIndex === 0) {
    debug('compaction', 'Skipped: recent window already covers the transcript')
    return { compacted: false }
  }

  const older = messages.slice(0, cutIndex)
  const recent = messages.slice(cutIndex)

  const summaryPrompt = settings.summaryPrompt ?? DEFAULT_SUMMARY_PROMPT

  const message = await createTurn(models, {
    model,
    context: {
      messages: [...older, userMessage(summaryPrompt)],
      tools: [],
    },
    maxTokens,
    stream: false,
    // A one-off summary prompt is never reused, so caching it only evicts
    // entries that would have been hit. A fresh id keeps it out of the run's
    // cache lineage.
    sessionId: crypto.randomUUID(),
    cacheRetention: 'none',
    signal: signal ?? AbortSignal.timeout(60_000),
    onStream: () => {},
  })

  const summaryText = message.content
    .filter(isTextBlock)
    .map((block) => block.text)
    .join('')

  if (!summaryText) {
    return { compacted: false }
  }

  debug('compaction', 'Compacted conversation', {
    summarized: older.length,
    kept: recent.length,
  })

  return {
    compacted: true,
    messages: [
      userMessage([
        {
          type: 'text',
          text: `Summary of the earlier conversation:\n\n${summaryText}`,
        },
      ]),
      ...recent,
    ],
  }
}

/**
 * Classifies a compaction failure.
 *
 * Compaction is best-effort — a failed summary should not kill a run that is
 * otherwise fine — but aborts, auth failures and programming errors are not
 * things retrying past will fix.
 */
export function isFatalCompactionError(error: Error): boolean {
  if (error.name === 'AbortError') return true

  const status = (error as { status?: number }).status
  if (status === 401 || status === 403 || status === 404) return true

  return (
    error instanceof TypeError ||
    error instanceof ReferenceError ||
    error instanceof SyntaxError
  )
}

/** Total tokens the last turn reported, used against the trigger threshold. */
export function contextTokens(message: AgentMessage): number {
  return message.usage.totalTokens
}
