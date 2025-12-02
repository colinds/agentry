import type { ReactNode } from 'react'
import type { MemoryHandlers, MemoryTool } from '@agentry/core/types'

// Re-export MemoryHandlers for convenience
export type { MemoryHandlers }

type MemoryProps = MemoryHandlers

/**
 * Memory built-in tool - enables memory capability
 *
 * This uses Anthropic's memory tool, which allows Claude to store and retrieve
 * information across conversations through a memory file directory. All operations
 * are handled client-side through the provided handlers.
 *
 * The memory tool requires the `context-management-2025-06-27` beta header,
 * which is automatically added when this component is used.
 *
 * **Security Note**: All handlers should validate that paths start with `/memories`
 * to prevent directory traversal attacks. Reject paths containing `../` or other
 * traversal patterns.
 *
 * @example
 * ```tsx
 * <Agent model="claude-sonnet-4-5">
 *   <Tools>
 *     <Memory
 *       onView={async ({ path }) => {
 *         // Validate path starts with /memories
 *         if (!path.startsWith('/memories')) {
 *           throw new Error('Invalid path')
 *         }
 *         // Return directory listing or file contents
 *         return '...'
 *       }}
 *       onCreate={async ({ path, file_text }) => {
 *         // Create file at path
 *         return 'File created'
 *       }}
 *     />
 *   </Tools>
 * </Agent>
 * ```
 */
export function Memory(props: MemoryProps): ReactNode {
  const handlers: MemoryHandlers = {
    onView: props.onView,
    onCreate: props.onCreate,
    onStrReplace: props.onStrReplace,
    onInsert: props.onInsert,
    onDelete: props.onDelete,
    onRename: props.onRename,
  }

  const tool: MemoryTool = {
    type: 'memory_20250818',
    name: 'memory',
    memoryHandlers: handlers,
  }

  return <sdk_tool tool={tool} key="memory" />
}
