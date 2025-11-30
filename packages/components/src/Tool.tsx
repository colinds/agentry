import type { ReactNode } from 'react';
import type { InternalTool } from '@agentry/core';

export interface ToolProps<TInput = unknown> {
  // either spread a defined tool or pass it directly
  tool?: InternalTool<TInput>;
  // or use the individual props
  name?: string;
  description?: string;
  inputSchema?: InternalTool<TInput>['inputSchema'];
  jsonSchema?: Record<string, unknown>;
  handler?: InternalTool<TInput>['handler'];
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
 */
export function Tool<TInput = unknown>(props: ToolProps<TInput>): ReactNode {
  // if tool prop is provided, use it directly
  // otherwise construct from individual props
  const tool: InternalTool<TInput> = props.tool ?? {
    name: props.name!,
    description: props.description!,
    inputSchema: props.inputSchema!,
    jsonSchema: props.jsonSchema!,
    handler: props.handler!,
  };

  return <tool tool={tool} key={tool.name} />;
}
