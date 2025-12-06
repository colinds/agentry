import type { AgentToolInstance } from '../instances/types'
import type { InternalTool } from '../types'
import type { SubagentInstance } from '../instances/types'
import { parseToolInput, formatValidationError } from './defineTool'
import { runSubagent } from '../run/subagent'
import { createSubagentInstance } from '../instances/createInstance'

export const createAgentSyntheticTool = (
  agentTool: AgentToolInstance,
): InternalTool => {
  return {
    name: agentTool.name,
    description: agentTool.description,
    parameters: agentTool.parameters,
    jsonSchema: agentTool.jsonSchema,
    handler: async (input, toolContext) => {
      const toolForValidation: InternalTool = {
        name: agentTool.name,
        description: agentTool.description,
        parameters: agentTool.parameters,
        jsonSchema: agentTool.jsonSchema,
        handler: () => '',
      }
      const parseResult = parseToolInput(toolForValidation, input)

      if (!parseResult.success) {
        return formatValidationError(parseResult.error)
      }

      const validatedInput = parseResult.data

      const agentElement = agentTool.agent(validatedInput)

      const subagent: SubagentInstance = createSubagentInstance(
        {
          name: agentTool.name,
          description: agentTool.description,
          agentNode: agentElement,
        },
        {
          model: toolContext.model,
        },
      )

      const result = await runSubagent(subagent, {
        client: toolContext.client,
        signal: toolContext.signal,
      })

      return result.content
    },
  }
}
