import type { AgentContentBlock } from '../types/messages'
import type { AgentStreamEvent } from '../types/agent'

/**
 * Emit synthetic stream events from a complete (non-streaming) response so that
 * `onMessage` fires consistently regardless of streaming mode.
 *
 * Iterates content blocks in order, emitting `text`, `thinking`, and `tool_use_start`
 * events. Text blocks accumulate across all blocks so the last `text` event's
 * `accumulated` field always equals the full concatenated text content.
 *
 * Always emits `message_complete` as the final event.
 */
export function emitSyntheticEvents(
  content: AgentContentBlock[],
  stopReason: string | null,
  onStream: (event: AgentStreamEvent) => void,
): void {
  let accumulatedText = ''

  for (const block of content) {
    if (block.type === 'text') {
      accumulatedText += block.text
      onStream({ type: 'text', text: block.text, accumulated: accumulatedText })
    } else if (block.type === 'thinking') {
      onStream({ type: 'thinking', text: block.thinking })
    } else if (block.type === 'tool_use') {
      onStream({
        type: 'tool_use_start',
        toolName: block.name,
        toolId: block.id,
      })
    }
  }

  onStream({
    type: 'message_complete',
    stopReason: stopReason ?? 'unknown',
  })
}
