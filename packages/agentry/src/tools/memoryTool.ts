import type { MemoryTool } from '../types'
import type { JsonObject } from '../types/json'
import { debug } from '../debug'

const MEMORY_COMMANDS = [
  'view',
  'create',
  'str_replace',
  'insert',
  'delete',
  'rename',
] as const

type MemoryCommand = (typeof MEMORY_COMMANDS)[number]

const validCommands = new Set<MemoryCommand>(MEMORY_COMMANDS)

export interface MemoryToolInput {
  command: MemoryCommand
  path?: string
  view_range?: [number, number]
  file_text?: string
  old_str?: string
  new_str?: string
  insert_line?: number
  insert_text?: string
  old_path?: string
  new_path?: string
}

export interface MemoryToolResult {
  result: string
  isError: boolean
}

export function isMemoryToolInput(
  input: JsonObject,
): input is JsonObject & MemoryToolInput {
  return (
    typeof input.command === 'string' &&
    validCommands.has(input.command as MemoryCommand)
  )
}

/**
 * Execute a memory tool call by routing to the appropriate handler
 *
 * @param memoryTool - The memory tool with handlers
 * @param input - The tool call input containing the command and parameters
 * @returns The result of the handler execution
 */
export async function executeMemoryTool(
  memoryTool: MemoryTool,
  input: MemoryToolInput,
): Promise<MemoryToolResult> {
  const handlers = memoryTool.memoryHandlers
  if (!handlers) {
    return {
      result: 'Error: Memory handlers not provided',
      isError: true,
    }
  }

  let result: string
  let isError = false

  try {
    switch (input.command) {
      case 'view': {
        if (!handlers.onView) throw new Error('Missing onView handler.')
        if (!input.path) throw new Error('view command requires "path"')
        result = await Promise.resolve(
          handlers.onView({ path: input.path, view_range: input.view_range }),
        )
        break
      }
      case 'create': {
        if (!handlers.onCreate) throw new Error('Missing onCreate handler.')
        if (!input.path || !input.file_text)
          throw new Error('create command requires "path" and "file_text"')
        result = await Promise.resolve(
          handlers.onCreate({ path: input.path, file_text: input.file_text }),
        )
        break
      }
      case 'str_replace': {
        if (!handlers.onStrReplace)
          throw new Error('Missing onStrReplace handler.')
        if (!input.path || !input.old_str || !input.new_str)
          throw new Error(
            'str_replace command requires "path", "old_str", and "new_str"',
          )
        result = await Promise.resolve(
          handlers.onStrReplace({
            path: input.path,
            old_str: input.old_str,
            new_str: input.new_str,
          }),
        )
        break
      }
      case 'insert': {
        if (!handlers.onInsert) throw new Error('Missing onInsert handler.')
        if (!input.path || input.insert_line == null || !input.insert_text)
          throw new Error(
            'insert command requires "path", "insert_line", and "insert_text"',
          )
        result = await Promise.resolve(
          handlers.onInsert({
            path: input.path,
            insert_line: input.insert_line,
            insert_text: input.insert_text,
          }),
        )
        break
      }
      case 'delete': {
        if (!handlers.onDelete) throw new Error('Missing onDelete handler.')
        if (!input.path) throw new Error('delete command requires "path"')
        result = await Promise.resolve(handlers.onDelete({ path: input.path }))
        break
      }
      case 'rename': {
        if (!handlers.onRename) throw new Error('Missing onRename handler.')
        if (!input.old_path || !input.new_path)
          throw new Error('rename command requires "old_path" and "new_path"')
        result = await Promise.resolve(
          handlers.onRename({
            old_path: input.old_path,
            new_path: input.new_path,
          }),
        )
        break
      }
      default:
        throw new Error(`Unknown memory command: ${input.command}`)
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    debug(
      'tool',
      `Memory tool command "${input.command}" failed:`,
      error instanceof Error ? error : { message: String(error) },
    )
    const message = error instanceof Error ? error.message : String(error)
    result = `Error: ${message}`
    isError = true
  }

  return { result, isError }
}
