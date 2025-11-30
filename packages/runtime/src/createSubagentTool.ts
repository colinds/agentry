import type { z } from 'zod';
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta';
import type { SubagentInstance, AgentInstance, InternalTool } from '@agentry/core';
import { isAgentInstance } from '@agentry/core';
import { renderSubagent } from './renderSubagent.ts';

/**
 * create a synthetic tool from a subagent
 *
 * when parent invokes this tool, it spawns the child agent
 */
export function createSubagentTool(
  subagent: SubagentInstance,
  parentAgent: AgentInstance | SubagentInstance,
): InternalTool {
  return {
    name: subagent.name,
    description: subagent.description ?? `Delegate task to ${subagent.name} agent`,
    inputSchema: {
      safeParse: (input: unknown) => {
        const obj = input as { task?: unknown; context?: unknown };
        if (typeof obj.task !== 'string') {
          return {
            success: false,
            error: { issues: [{ path: ['task'], message: 'Required field' }] },
          };
        }
        return {
          success: true,
          data: {
            task: obj.task,
            context: typeof obj.context === 'string' ? obj.context : undefined,
          },
        };
      },
    } as z.ZodType,
    jsonSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Task for the subagent to perform' },
        context: { type: 'string', description: 'Additional context' },
      },
      required: ['task'],
    },
    handler: async (input, toolContext) => {
      const { task, context: additionalContext } = input as { task: string; context?: string };
      // build child's initial message
      const childMessages: BetaMessageParam[] = [
        {
          role: 'user' as const,
          content: additionalContext ? `${additionalContext}\n\n${task}` : task,
        },
      ];

      // get parent's client
      const client = isAgentInstance(parentAgent) ? parentAgent.client : null;
      if (!client) {
        throw new Error('Cannot spawn subagent: parent agent has no client');
      }

      // spawn the subagent
      const result = await renderSubagent(subagent, {
        client,
        signal: toolContext.signal,
        initialMessages: childMessages,
      });

      return result.content;
    },
  };
}
