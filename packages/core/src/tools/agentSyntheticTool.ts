import type { AgentToolInstance } from '../instances/types.ts'
import type { InternalTool } from '../types/index.ts'
import type { SubagentInstance } from '../instances/types.ts'
import { parseToolInput, formatValidationError } from './defineTool.ts'
import { renderSubagent } from '../render.ts'
import { createSubagentInstance } from '../instances/createInstance.ts'

/**
 * Creates a synthetic tool from an AgentToolInstance
 * When the tool is called:
 * 1. Validates input against the schema
 * 2. Calls the agent function with validated input to get the agent element
 * 3. Creates a SubagentInstance with the agent element as deferred children
 * 4. Renders the subagent using renderSubagent
 * 5. Returns the agent's output as the tool result
 */
export const createAgentSyntheticTool = (
  agentTool: AgentToolInstance,
): InternalTool => {
  return {
    name: agentTool.name,
    description: agentTool.description,
    parameters: agentTool.parameters,
    jsonSchema: agentTool.jsonSchema,
    handler: async (input, toolContext) => {
      // Validate input against schema
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

      const result = await renderSubagent(subagent, {
        client: toolContext.client,
        signal: toolContext.signal,
      })

      return result.content
    },
  }
}
