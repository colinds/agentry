import type { Api, Model, Models, ProviderHeaders } from '@earendil-works/pi-ai'
import {
  isTextBlock,
  isToolResultMessage,
  userMessage,
  type AgentMessage,
  type AgentMessageParam,
} from '../types/messages'
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

/** Request options that must reach every call a run makes, not just the turn. */
export interface RequestOptions {
  headers?: ProviderHeaders
  timeoutMs?: number
}

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
 *
 * pi ships `estimateMessageTokens`, but it lives in `dist/utils/estimate.js`
 * and the package's `exports` map has no `./utils/*` entry, so it is not
 * reachable without a deep import that the map forbids and that any pi
 * restructure would break. Hence a local one.
 */
export function estimateTokens(message: AgentMessageParam): number {
  if (typeof message.content === 'string') {
    return Math.ceil(message.content.length / 4)
  }

  let chars = 0
  let images = 0
  for (const block of message.content) {
    // A base64 image is enormous as text but costs a roughly fixed number of
    // tokens. Counting its payload at chars/4 would swamp the estimate and
    // drag the compaction cut far later than it should be.
    if (block.type === 'image') {
      images++
      continue
    }
    chars += JSON.stringify(block).length
  }
  return Math.ceil(chars / 4) + images * IMAGE_TOKEN_ESTIMATE
}

/** Rough per-image cost; real figures are resolution-dependent. */
const IMAGE_TOKEN_ESTIMATE = 1_500

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

  // The kept tail is prefixed by the summary, which is itself a user message —
  // so the tail may legally begin with an assistant turn, tool calls and all.
  // The one thing it must not begin with is a tool result, whose matching call
  // would have been summarized away.
  //
  // Walk *backward* to fix that, pulling the assistant turn that owns those
  // results into the tail. Walking forward instead would skip past the pair and,
  // whenever a conversation ends mid-tool-use — which is most of the time —
  // run off the end and keep nothing at all.
  while (index > 0 && index < messages.length) {
    if (!isToolResultMessage(messages[index]!)) break
    index--
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
  /** Gateway headers and timeouts apply here too; without them a gateway user's
   * main loop works while compaction silently fails. */
  request?: RequestOptions
}): Promise<CompactionResult> {
  const { models, model, messages, settings, maxTokens, signal, request } =
    options

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
    headers: request?.headers,
    timeoutMs: request?.timeoutMs,
    stream: false,
    // A one-off summary prompt is never reused, so caching it only evicts
    // entries that would have been hit. A fresh id keeps it out of the run's
    // cache lineage.
    sessionId: crypto.randomUUID(),
    cacheRetention: 'none',
    // Compose rather than fall back: the engine always passes a signal, so a
    // plain `??` meant the 60s guard never applied and a hung summary would
    // block until the provider SDK's 10-minute default.
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(60_000)])
      : AbortSignal.timeout(60_000),
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
