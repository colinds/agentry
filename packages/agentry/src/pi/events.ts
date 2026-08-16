import type { AssistantMessageEvent } from '@earendil-works/pi-ai'
import type { AgentStreamEvent } from '../types/agent'

/**
 * Maps a pi `AssistantMessageEvent` to agentry's `AgentStreamEvent`.
 *
 * Returns `null` for events agentry does not surface (lifecycle markers and
 * partial tool-call argument deltas). `error` events are also dropped here —
 * they are surfaced by `createTurn` as a thrown error instead, because the
 * execution engine drives its error state transition from a throw.
 *
 * pi does not guarantee that a block's `*_start`/`*_delta`/`*_end` sequence is
 * uninterrupted, so every accumulated read is keyed off `contentIndex` rather
 * than assuming the block is the last one in `partial.content`.
 */
export function toAgentStreamEvent(
  event: AssistantMessageEvent,
): AgentStreamEvent | null {
  switch (event.type) {
    case 'text_delta': {
      // `accumulated` is the message's text so far, not just this block's —
      // a message with several text blocks reads as one continuous stream.
      const accumulated = event.partial.content
        .slice(0, event.contentIndex + 1)
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('')
      return {
        type: 'text',
        text: event.delta,
        accumulated: accumulated || event.delta,
      }
    }

    case 'thinking_delta':
      return { type: 'thinking', text: event.delta }

    case 'toolcall_start': {
      // pi appends the tool-call block before emitting, so name and id are
      // already readable off `partial` at start time.
      const block = event.partial.content[event.contentIndex]
      if (block?.type !== 'toolCall') return null
      return {
        type: 'tool_use_start',
        toolName: block.name,
        toolId: block.id,
      }
    }

    case 'done':
      return { type: 'message_complete', stopReason: event.reason }

    case 'start':
    case 'text_start':
    case 'text_end':
    case 'thinking_start':
    case 'thinking_end':
    case 'toolcall_delta':
    case 'toolcall_end':
    case 'error':
      return null
  }
}
