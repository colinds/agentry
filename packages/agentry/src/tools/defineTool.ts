import type { Static, TSchema } from 'typebox'
import { Value } from 'typebox/value'
import type { InternalTool, ToolContext, ToolResult } from '../types'
import type { JsonValue } from '../types/json'
import { debug } from '../debug'

/**
 * define a type-safe tool with a TypeBox schema
 *
 * TypeBox schemas are plain JSON Schema at runtime, which is exactly what pi
 * puts on the wire — so there is no conversion step, and `Static<TSchema>`
 * gives the handler fully inferred parameters.
 *
 * @example
 * ```ts
 * import { Type } from 'agentry'
 *
 * const searchTool = defineTool({
 *   name: 'search_docs',
 *   description: 'Search documentation',
 *   parameters: Type.Object({
 *     query: Type.String({ description: 'search query' }),
 *     maxResults: Type.Optional(Type.Number()),
 *   }),
 *   handler: async (params, ctx) => {
 *     // params is typed as { query: string, maxResults?: number }
 *     return `Found results for: ${params.query}`;
 *   },
 * });
 * ```
 */
export function defineTool<TParameters extends TSchema>(options: {
  name: string
  description: string
  parameters: TParameters
  strict?: boolean
  handler: (
    input: Static<TParameters>,
    context: ToolContext,
  ) => Promise<ToolResult> | ToolResult
}): InternalTool<Static<TParameters>> {
  const { name, description, parameters, strict, handler } = options

  const jsonSchema = { ...parameters } as unknown as Record<string, JsonValue>

  if (strict && jsonSchema.type === 'object') {
    jsonSchema.additionalProperties = false
  }

  return {
    name,
    description,
    parameters,
    jsonSchema,
    strict,
    handler,
  } as InternalTool<Static<TParameters>>
}

/**
 * validate tool input against the tool's TypeBox schema
 */
export function parseToolInput<TInput>(
  tool: InternalTool<TInput>,
  input: unknown,
):
  | { success: true; data: TInput }
  | {
      success: false
      error: {
        issues: Array<{ path: Array<string | number>; message: string }>
      }
    } {
  if (Value.Check(tool.parameters, input)) {
    return { success: true, data: input as TInput }
  }

  const issues = [...Value.Errors(tool.parameters, input)].map((issue) => ({
    path: issue.instancePath.split('/').filter(Boolean),
    message: issue.message,
  }))

  return { success: false, error: { issues } }
}

/**
 * format validation error issues into a human-readable string
 */
export function formatValidationError(error: {
  issues: Array<{ path: Array<string | number>; message: string }>
}): string {
  const errorMessage = error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join(', ')
  return `Validation error: ${errorMessage}`
}

/**
 * execute a tool with validated input
 */
export async function executeTool<TInput>(
  tool: InternalTool<TInput>,
  input: unknown,
  context: ToolContext,
): Promise<{ result: ToolResult; isError: boolean }> {
  const parseResult = parseToolInput(tool, input)

  if (!parseResult.success) {
    return {
      result: formatValidationError(parseResult.error),
      isError: true,
    }
  }

  try {
    const result = await tool.handler(parseResult.data, context)
    return { result, isError: false }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    debug('tool', `Tool "${tool.name}" handler threw:`, error as object)
    const message = error instanceof Error ? error.message : String(error)
    return {
      result: `Error: ${message}`,
      isError: true,
    }
  }
}
