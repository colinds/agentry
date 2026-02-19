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

      // Extract stream from the JSX element's props, defaulting to false for subagents
      const agentElementStream =
        (agentElement.props as { stream?: boolean }).stream ?? false

      const subagent: SubagentInstance = createSubagentInstance(
        {
          name: agentTool.name,
          description: agentTool.description,
          provider: toolContext.provider,
          agentNode: agentElement,
          stream: agentElementStream,
        },
        {
          provider: toolContext.provider,
          model: toolContext.model,
        },
      )

      const result = await runSubagent(subagent, {
        provider: subagent.props.provider,
        clients: toolContext.clients,
        signal: toolContext.signal,
      })

      const content = result.content
      if (!content) {
        return `Subagent "${agentTool.name}" completed but produced no text output. Stop reason: ${result.stopReason ?? 'unknown'}.`
      }
      return content
    },
  }
}
