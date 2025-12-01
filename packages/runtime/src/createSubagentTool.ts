import type { z } from 'zod'
import type { SubagentInstance, InternalTool } from '@agentry/core'
import { renderSubagent } from './renderSubagent.ts'

/**
 * create a synthetic tool from a subagent
 *
 * when parent invokes this tool, it spawns the child agent
 */
export function createSubagentTool(subagent: SubagentInstance): InternalTool {
  return {
    name: subagent.name,
    description:
      subagent.description ?? `Delegate task to ${subagent.name} agent`,
    inputSchema: {
      safeParse: (input: unknown) => {
        const obj = input as { task?: unknown; context?: unknown }
        if (typeof obj.task !== 'string') {
          return {
            success: false,
            error: { issues: [{ path: ['task'], message: 'Required field' }] },
          }
        }
        return {
          success: true,
          data: {
            task: obj.task,
            context: typeof obj.context === 'string' ? obj.context : undefined,
          },
        }
      },
    } as z.ZodType,
    jsonSchema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'Task for the subagent to perform',
        },
        context: { type: 'string', description: 'Additional context' },
      },
      required: ['task'],
    },
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
