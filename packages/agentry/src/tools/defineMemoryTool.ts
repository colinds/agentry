import type { InternalTool, MemoryHandlers, ToolResult } from '../types'
import type { JsonObject, JsonValue } from '../types/json'
import { executeMemoryTool, isMemoryToolInput } from './memoryTool'

/**
 * JSON Schema for the memory command union.
 *
 * Mirrors Anthropic's published `memory` tool schema so existing prompts and
 * handler implementations keep working, but it is now an ordinary
 * client-executed tool rather than a provider-native one — which means it
 * works on every provider, not just Anthropic.
 */
const MEMORY_SCHEMA: Record<string, JsonValue> = {
  type: 'object',
  properties: {
    command: {
      type: 'string',
      enum: ['view', 'create', 'str_replace', 'insert', 'delete', 'rename'],
      description: 'The memory operation to perform.',
    },
    path: {
      type: 'string',
      description:
        'Path to the file or directory, relative to the memory root. Required for all commands except rename.',
    },
    view_range: {
      type: 'array',
      items: { type: 'number' },
      description:
        'Optional [start, end] line range for view. 1-indexed; -1 means end of file.',
    },
    file_text: {
      type: 'string',
      description: 'Full file contents. Required for create.',
    },
    old_str: {
      type: 'string',
      description: 'Exact text to replace. Required for str_replace.',
    },
    new_str: {
      type: 'string',
      description: 'Replacement text. Required for str_replace.',
    },
    insert_line: {
      type: 'number',
      description: 'Line number to insert after. Required for insert.',
    },
    insert_text: {
      type: 'string',
      description: 'Text to insert. Required for insert.',
    },
    old_path: {
      type: 'string',
      description: 'Source path. Required for rename.',
    },
    new_path: {
      type: 'string',
      description: 'Destination path. Required for rename.',
    },
  },
  required: ['command'],
}

const MEMORY_DESCRIPTION = `Persistent memory stored outside the conversation. Use it to record durable notes and read them back in later turns.

Commands:
- view: read a file, or list a directory
- create: write a file, replacing any existing contents
- str_replace: replace an exact string in a file
- insert: insert text after a given line
- delete: delete a file or directory
- rename: move or rename a file or directory`

/**
 * Builds the client-side memory tool from user-supplied handlers.
 *
 * Storage is entirely the caller's concern — agentry validates the command and
 * dispatches; it never touches the filesystem itself.
 */
export function defineMemoryTool(handlers: MemoryHandlers): InternalTool {
  return {
    name: 'memory',
    description: MEMORY_DESCRIPTION,
    parameters: MEMORY_SCHEMA as never,
    jsonSchema: MEMORY_SCHEMA,
    handler: async (input): Promise<ToolResult> => {
      const candidate = (input ?? {}) as JsonObject

      if (!isMemoryToolInput(candidate)) {
        return `Error: invalid memory command. Expected one of view, create, str_replace, insert, delete, rename.`
      }

      const { result } = await executeMemoryTool(
        { name: 'memory', memoryHandlers: handlers },
        candidate,
      )
      return result
    },
  }
}
