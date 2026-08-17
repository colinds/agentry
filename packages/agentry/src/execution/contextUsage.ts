import type { AgentInstance } from '../instances/types'
import type { AgentMessageParam } from '../types/messages'
import { estimateTokens } from './compaction'
import { buildSystemPrompt } from './createEngineConfig'

export interface ContextSection {
  /** What this section is, e.g. `'system'`, `'tools'`, `'messages'`. */
  name: string
  tokens: number
  /** Share of the model's context window, 0–1. Undefined if the window is unknown. */
  share?: number
}

export interface ToolUsage {
  name: string
  /** Tokens the tool's schema and description cost on every single request. */
  tokens: number
}

export interface ContextUsage {
  /** The model's context window, when known. */
  contextWindow?: number
  /**
   * Estimated tokens for the parts agentry controls.
   *
   * This *understates* real usage — measured at roughly a sixth of what the
   * provider reports for a small request — because providers prepend their own
   * scaffolding (tool-use instructions and similar) that the client never sees.
   * Use it for attribution between sections, and `reportedInputTokens` for the
   * true figure.
   */
  estimatedUsed: number
  /**
   * Prompt tokens the most recent turn actually occupied — input plus cached
   * reads and writes, since cached tokens still take up the window. This is
   * the number to trust for "how close am I to the limit".
   */
  reportedInputTokens?: number
  /** `contextWindow - reportedInputTokens`, when both are known. */
  free?: number
  sections: ContextSection[]
  /**
   * Per-tool cost, largest first. Tool definitions are re-sent on every
   * request, so a fat schema is a fixed tax on the whole run — this is usually
   * where an unexpectedly full context is hiding.
   */
  tools: ToolUsage[]
  messageCount: number
}

/**
 * Reports what is actually filling the context window.
 *
 * Overflow detection and compaction tell you that you ran out of room and then
 * take action; neither tells you *why*. The parts that are easy to forget are
 * the ones the caller never wrote by hand — the assembled system prompt and
 * the tool JSON schemas, which are re-sent verbatim on every request.
 *
 * Section counts are estimates from the same heuristic compaction uses, and
 * `share` is each section's fraction of that estimate — so they answer "what is
 * filling my context" reliably even though the absolute figure understates the
 * provider's own overhead. `reportedInputTokens` carries the real number.
 */
export function describeContextUsage(options: {
  agent: AgentInstance
  messages: readonly AgentMessageParam[]
  contextWindow?: number
  reportedInputTokens?: number
}): ContextUsage {
  const { agent, messages, contextWindow, reportedInputTokens } = options

  const systemPrompt = buildSystemPrompt(agent)
  const systemTokens = systemPrompt ? Math.ceil(systemPrompt.length / 4) : 0

  const tools: ToolUsage[] = [...agent.tools.values()]
    .map((tool) => ({
      name: tool.name,
      // Description and schema both travel on every request.
      tokens: Math.ceil(
        (tool.description.length + JSON.stringify(tool.jsonSchema).length) / 4,
      ),
    }))
    .sort((a, b) => b.tokens - a.tokens)

  const toolTokens = tools.reduce((sum, t) => sum + t.tokens, 0)
  const messageTokens = messages.reduce(
    (sum, message) => sum + estimateTokens(message),
    0,
  )

  const estimatedUsed = systemTokens + toolTokens + messageTokens

  // Shares are relative to the estimate, not the window, so they answer "what
  // is filling my context" without inheriting the estimate's absolute error.
  const withShare = (name: string, tokens: number): ContextSection => ({
    name,
    tokens,
    ...(estimatedUsed > 0 ? { share: tokens / estimatedUsed } : {}),
  })

  return {
    ...(contextWindow ? { contextWindow } : {}),
    ...(contextWindow && reportedInputTokens !== undefined
      ? { free: contextWindow - reportedInputTokens }
      : {}),
    ...(reportedInputTokens !== undefined ? { reportedInputTokens } : {}),
    estimatedUsed,
    sections: [
      withShare('system', systemTokens),
      withShare('tools', toolTokens),
      withShare('messages', messageTokens),
    ],
    tools,
    messageCount: messages.length,
  }
}
