import type { ReactNode } from 'react'
import type { TSchema } from 'typebox'
import { defineTool } from '../tools'
import type { AnyInternalTool, InternalTool, DefineToolOptions } from '../types'

export type ToolProps<TParameters extends TSchema = TSchema> =
  | AnyInternalTool
  | DefineToolOptions<TParameters>

/**
 * tool component - registers a tool with the parent agent
 *
 * @example using defineTool
 * ```tsx
 * const searchTool = defineTool({
 *   name: 'search',
 *   description: 'Search documents',
 *   parameters: Type.Object({ query: Type.String() }),
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
 *   parameters={Type.Object({ query: Type.String() })}
 *   handler={async ({ query }) => `Results for ${query}`}
 * />
 * ```
 */
// Overloads keep handler-parameter inference working for the inline form while
// still accepting an already-defined tool spread in as `{...someTool}`.
export function Tool(props: AnyInternalTool): ReactNode
export function Tool<TParameters extends TSchema>(
  props: DefineToolOptions<TParameters>,
): ReactNode
export function Tool<TParameters extends TSchema>(
  props: ToolProps<TParameters>,
): ReactNode {
  if ('parameters' in props && 'jsonSchema' in props) {
    return <tool tool={props as InternalTool} key={props.name} />
  }

  const tool = defineTool(props)

  return <tool tool={tool as InternalTool} key={tool.name} />
}
