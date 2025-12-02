import { z } from 'zod'
import type { SubagentInstance } from '../instances/index.ts'
import type { InternalTool } from '../types/index.ts'
import { renderSubagent } from '../render.ts'

/**
 * create a synthetic tool from a subagent
 *
 * when parent invokes this tool, it spawns the child agent
 */
export function createSubagentTool(subagent: SubagentInstance): InternalTool {
  const parameters = z.object({
    task: z.string().describe('Task for the subagent to perform'),
    context: z.string().describe('Additional context').optional(),
  })

  return {
    name: subagent.name,
    description:
      subagent.description ?? `Delegate task to ${subagent.name} agent`,
    parameters,
    jsonSchema: z.toJSONSchema(parameters),
    handler: async (input, toolContext) => {
      const { task, context: additionalContext } = input as {
        task: string
        context?: string
      }

      subagent.messages.push({
        role: 'user' as const,
        content: additionalContext ? `${additionalContext}\n\n${task}` : task,
      })

      const result = await renderSubagent(subagent, {
        client: toolContext.client,
        signal: toolContext.signal,
      })

      return result.content
    },
  }
}
