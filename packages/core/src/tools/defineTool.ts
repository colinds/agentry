import type { z } from 'zod'
import type { InternalTool, ToolContext, ToolResult } from '../types/index.ts'

/**
 * Convert a Zod schema to JSON schema format for the Anthropic API
 */
export function zodToJsonSchema(schema: unknown): Record<string, unknown> {
  const zodSchema = schema as { toJSONSchema?: () => Record<string, unknown> }
  const jsonSchemaRaw = zodSchema.toJSONSchema?.() || {}
  return {
    type: 'object' as const,
    ...jsonSchemaRaw,
  }
}

/**
 * define a type-safe tool with Zod schema validation
 *
 * @example
 * ```ts
 * const searchTool = defineTool({
 *   name: 'search_docs',
 *   description: 'Search documentation',
 *   parameters: z.object({
 *     query: z.string().describe('search query'),
 *     maxResults: z.number().optional().default(10),
 *   }),
 *   handler: async (params, ctx) => {
 *     // params is fully typed as { query: string, maxResults: number }
 *     return `Found results for: ${params.query}`;
 *   },
 * });
 * ```
 */
export function defineTool<TSchema extends z.ZodType>(options: {
  name: string
  description: string
  parameters: TSchema
  handler: (
    input: z.output<TSchema>,
    context: ToolContext,
  ) => Promise<ToolResult> | ToolResult
}): InternalTool<z.output<TSchema>> {
  const { name, description, parameters, handler } = options

  return {
    name,
    description,
    inputSchema: parameters,
    jsonSchema: zodToJsonSchema(parameters),
    handler,
  } as InternalTool<z.output<TSchema>>
}

/**
 * convert an InternalTool to the format expected by the Anthropic API
 */
export function toApiTool(tool: InternalTool): {
  type: 'custom'
  name: string
  description: string
  input_schema: Record<string, unknown>
} {
  return {
    type: 'custom',
    name: tool.name,
    description: tool.description,
    input_schema: tool.jsonSchema as Record<string, unknown>,
  }
}

/**
 * validate and parse tool input using the Zod schema
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
  const schema = tool.inputSchema as {
    safeParse: (input: unknown) => {
      success: boolean
      data?: TInput
      error?: {
        issues: Array<{ path: Array<string | number>; message: string }>
      }
    }
  }
  const result = schema.safeParse(input)
  if (result.success) {
    return { success: true, data: result.data as TInput }
  }
  return { success: false, error: result.error! }
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
    const errorMessage = parseResult.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join(', ')
    return {
      result: `Validation error: ${errorMessage}`,
      isError: true,
    }
  }

  try {
    const result = await tool.handler(parseResult.data, context)
    return { result, isError: false }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      result: `Error: ${message}`,
      isError: true,
    }
  }
}
