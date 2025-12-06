import type { MemoryTool } from '../types'

export interface MemoryToolInput {
  command: string
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
        if (!handlers.onView) {
          throw new Error('onView handler not provided')
        }
        result = await Promise.resolve(
          handlers.onView({
            path: input.path!,
            view_range: input.view_range,
          }),
        )
        break
      }
      case 'create': {
        if (!handlers.onCreate) {
          throw new Error('onCreate handler not provided')
        }
        result = await Promise.resolve(
          handlers.onCreate({
            path: input.path!,
            file_text: input.file_text!,
          }),
        )
        break
      }
      case 'str_replace': {
        if (!handlers.onStrReplace) {
          throw new Error('onStrReplace handler not provided')
        }
        result = await Promise.resolve(
          handlers.onStrReplace({
            path: input.path!,
            old_str: input.old_str!,
            new_str: input.new_str!,
          }),
        )
        break
      }
      case 'insert': {
        if (!handlers.onInsert) {
          throw new Error('onInsert handler not provided')
        }
        result = await Promise.resolve(
          handlers.onInsert({
            path: input.path!,
            insert_line: input.insert_line!,
            insert_text: input.insert_text!,
          }),
        )
        break
      }
      case 'delete': {
        if (!handlers.onDelete) {
          throw new Error('onDelete handler not provided')
        }
        result = await Promise.resolve(
          handlers.onDelete({
            path: input.path!,
          }),
        )
        break
      }
      case 'rename': {
        if (!handlers.onRename) {
          throw new Error('onRename handler not provided')
        }
        result = await Promise.resolve(
          handlers.onRename({
            old_path: input.old_path!,
            new_path: input.new_path!,
          }),
        )
        break
      }
      default:
        throw new Error(`Unknown memory command: ${input.command}`)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    result = `Error: ${message}`
    isError = true
  }

  return { result, isError }
}
