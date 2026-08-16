import type { TSchema, Tool as PiTool } from '@earendil-works/pi-ai'
import type { InternalTool } from '../types/tools'

/**
 * Converts an agentry `InternalTool` into the tool shape pi puts on the wire.
 *
 * pi types `parameters` as a typebox `TSchema`, but serializes it as plain JSON
 * Schema and does not validate arguments itself (`validateToolCall` is opt-in
 * and agentry does not use it — argument validation stays in `executeTool`).
 * The cast is therefore structural, not a lie about the runtime value.
 *
 * `strict` maps to constrained sampling with `'prefer'` rather than `'require'`
 * so that a provider without grammar support degrades to an ordinary tool call
 * instead of failing the request outright.
 */
export function toPiTool(tool: InternalTool): PiTool {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.jsonSchema as unknown as TSchema,
    ...(tool.strict
      ? {
          constrainedSampling: {
            type: 'json_schema',
            strict: 'prefer',
          } as const,
        }
      : {}),
  }
}

export function toPiTools(tools: InternalTool[]): PiTool[] {
  return tools.map(toPiTool)
}
