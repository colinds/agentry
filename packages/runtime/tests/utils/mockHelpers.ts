import { mockToolUse, mockText, type MockResponse } from '@agentry/core'

/**
 * Create a mock response sequence for subagent execution
 * Pattern: parent calls subagent → parent continues with result
 */
export function mockSubagentExecution(
  subagentName: string,
  subagentInput: unknown,
  parentContinuation: string,
): MockResponse[] {
  return [
    // Parent calls subagent tool
    {
      content: [mockToolUse(subagentName, subagentInput)],
      stop_reason: 'tool_use',
    },
    // Parent continues after subagent completes
    {
      content: [mockText(parentContinuation)],
    },
  ]
}

/**
 * Create a mock response sequence for multiple tool calls
 * Pattern: tool1 → tool2 → ... → final response
 */
export function mockToolSequence(
  calls: Array<{ name: string; input: unknown; id?: string }>,
  finalResponse: string,
): MockResponse[] {
  return [
    ...calls.map((call) => ({
      content: [mockToolUse(call.name, call.input, call.id)],
      stop_reason: 'tool_use' as const,
    })),
    {
      content: [mockText(finalResponse)],
    },
  ]
}

/**
 * Create a simple text response (convenience helper)
 */
export function mockSimpleResponse(text: string): MockResponse[] {
  return [{ content: [mockText(text)] }]
}
