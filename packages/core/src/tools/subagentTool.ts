import { z } from 'zod'
import type { SubagentInstance } from '../instances/index'
import type { InternalTool } from '../types/index.ts'
import { renderSubagent } from '../render.ts'

const parameters = z.object({
  task: z.string().describe('Task for the subagent to perform'),
  context: z.string().describe('Additional context').optional(),
})

export const createSubagentTool = (
  subagent: SubagentInstance,
): InternalTool => {
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
  } satisfies InternalTool
}
