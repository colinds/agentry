import type { ReactNode } from 'react'
import type { MemoryHandlers } from '../types'
import { defineMemoryTool } from '../tools/defineMemoryTool'

export interface MemoryProps {
  /**
   * Storage callbacks. Agentry validates and dispatches memory commands but
   * never touches storage itself, so where memory lives is entirely yours.
   */
  handlers: MemoryHandlers
}

/**
 * Memory component — gives the agent a persistent scratchpad.
 *
 * This used to be Anthropic's server-side `memory_20250818` tool. pi models
 * only client-executed tools, so it is now an ordinary tool backed by your
 * handlers, which means it works on every provider rather than just Anthropic.
 *
 * @example
 * ```tsx
 * <Agent provider="anthropic" model="claude-haiku-4-5">
 *   <Memory
 *     handlers={{
 *       onView: ({ path }) => store.read(path),
 *       onCreate: ({ path, file_text }) => store.write(path, file_text),
 *     }}
 *   />
 *   <Message role="user">Remember that my favourite colour is blue.</Message>
 * </Agent>
 * ```
 */
export function Memory({ handlers }: MemoryProps): ReactNode {
  return <tool tool={defineMemoryTool(handlers)} key="memory" />
}
