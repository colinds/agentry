import type { ReactNode } from 'react'
import type { InternalTool } from '@agentry/core'
import { zodToJsonSchema } from '@agentry/core'

export interface ToolProps<TInput = unknown> {
  tool?: InternalTool<TInput>
  name?: string
  description?: string
  inputSchema?: InternalTool<TInput>['inputSchema']
  jsonSchema?: Record<string, unknown>
  handler?: InternalTool<TInput>['handler']
}

/**
 * tool component - registers a tool with the parent agent
 *
 * @example using defineTool
 * ```tsx
 * const searchTool = defineTool({
 *   name: 'search',
 *   description: 'Search documents',
 *   parameters: z.object({ query: z.string() }),
 *   handler: async ({ query }) => `Results for ${query}`,
 * });
 *
 * <Tool tool={searchTool} />
 * // or spread:
 * <Tool {...searchTool} />
 * ```
 *
 * @example using inline props
 * ```tsx
 * <Tool
 *   name="search"
 *   description="Search documents"
 *   inputSchema={z.object({ query: z.string() })}
 *   handler={async ({ query }) => `Results for ${query}`}
 * />
 * ```
 */
export function Tool<TInput = unknown>(props: ToolProps<TInput>): ReactNode {
  const tool: InternalTool<TInput> = props.tool ?? {
    name: props.name!,
    description: props.description!,
    inputSchema: props.inputSchema!,
    jsonSchema: props.jsonSchema ?? zodToJsonSchema(props.inputSchema),
    handler: props.handler!,
  }

  return <tool tool={tool as InternalTool<unknown>} key={tool.name} />
}
