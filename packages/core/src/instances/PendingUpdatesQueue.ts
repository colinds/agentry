import type { PendingUpdate } from './types.ts'
import type { InternalTool, SdkTool } from '../types/index.ts'

/**
 * Queue for pending tool updates with automatic deduplication.
 * Adding a tool cancels any pending removal for that tool, and vice versa.
 */
export class PendingUpdatesQueue {
  #updates = new Map<string, PendingUpdate>()

  get size(): number {
    return this.#updates.size
  }

  addTool(tool: InternalTool): void {
    // adding cancels any pending removal
    this.#updates.delete(`tool_removed:${tool.name}`)
    this.#updates.set(`tool_added:${tool.name}`, { type: 'tool_added', tool })
  }

  removeTool(toolName: string): void {
    // removing cancels any pending add
    this.#updates.delete(`tool_added:${toolName}`)
    this.#updates.set(`tool_removed:${toolName}`, {
      type: 'tool_removed',
      toolName,
    })
  }

  addSdkTool(tool: SdkTool): void {
    this.#updates.delete(`sdk_tool_removed:${tool.name}`)
    this.#updates.set(`sdk_tool_added:${tool.name}`, {
      type: 'sdk_tool_added',
      tool,
    })
  }

  removeSdkTool(toolName: string): void {
    this.#updates.delete(`sdk_tool_added:${toolName}`)
    this.#updates.set(`sdk_tool_removed:${toolName}`, {
      type: 'sdk_tool_removed',
      toolName,
    })
  }

  *[Symbol.iterator](): Iterator<PendingUpdate> {
    for (const update of this.#updates.values()) {
      yield update
    }
  }

  clear(): void {
    this.#updates.clear()
  }
}
