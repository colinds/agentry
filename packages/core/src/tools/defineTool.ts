import { z } from 'zod'
import type { BetaTool } from '@anthropic-ai/sdk/resources/beta'
import type { InternalTool, ToolContext, ToolResult } from '../types/index.ts'

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
    input: z.infer<TSchema>,
    context: ToolContext,
  ) => Promise<ToolResult> | ToolResult
}): InternalTool<z.infer<TSchema>> {
  const { name, description, parameters, handler } = options

  return {
    name,
    description,
    parameters,
    jsonSchema: z.toJSONSchema(parameters),
    handler,
  } as InternalTool<z.infer<TSchema>>
}

/**
 * convert an InternalTool to the format expected by the Anthropic API
 */
export function toApiTool(tool: InternalTool): BetaTool {
  return {
    type: 'custom',
    name: tool.name,
    description: tool.description,
    input_schema: tool.jsonSchema as BetaTool.InputSchema,
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
  const schema = tool.parameters as {
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
