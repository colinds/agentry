import type { ReactNode } from 'react'
import { z } from 'zod'
import { defineTool } from '../tools'
import type { InternalTool, DefineToolOptions } from '../types'

export type ToolProps<TSchema extends z.ZodType = z.ZodType> =
  | InternalTool<z.output<TSchema>>
  | DefineToolOptions<TSchema>

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
 * <Tool {...searchTool} />
 * ```
 *
 * @example using inline props
 * ```tsx
 * <Tool
 *   name="search"
 *   description="Search documents"
 *   parameters={z.object({ query: z.string() })}
 *   handler={async ({ query }) => `Results for ${query}`}
 * />
 * ```
 */
export function Tool<TSchema extends z.ZodType>(
  props: ToolProps<TSchema>,
): ReactNode {
  if ('parameters' in props && 'jsonSchema' in props) {
    return <tool tool={props as InternalTool<unknown>} key={props.name} />
  }

  const tool = defineTool(props)

  return <tool tool={tool as InternalTool<unknown>} key={tool.name} />
}
