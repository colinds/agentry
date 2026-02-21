import { test, expect } from 'bun:test'
import { z } from 'zod'
import type { AgentMessage } from '../src/types'
import {
  defineTool,
  parseToolInput,
  executeTool,
  toApiTool,
} from '../src/tools'
import {
  initialState,
  transition,
  canAcceptMessages,
  isProcessing,
  AgentStatus,
  TransitionType,
  type InternalTool,
} from '../src/types'
import { createStepMockClient } from './utils'
import type { ToolContext } from '../src/types'
import { createRunAgent } from '../src/run/runAgentFunction'

const { client } = createStepMockClient([])
const mockContext: ToolContext = {
  agentName: 'test-agent',
  provider: 'anthropic',
  client,
  runAgent: createRunAgent({
    clients: { anthropic: client },
    model: 'claude-sonnet-4-5',
    provider: 'anthropic',
  }),
}

test('defineTool creates a type-safe tool', () => {
  const testTool = defineTool({
    name: 'test',
    description: 'A test tool',
    parameters: z.object({
      query: z.string(),
      count: z.number().default(5),
    }),
    handler: async ({ query, count }) => {
      return `Query: ${query}, Count: ${count}`
    },
  })

  expect(testTool.name).toBe('test')
  expect(testTool.description).toBe('A test tool')
  expect(testTool.jsonSchema).toBeDefined()
  expect(testTool.handler).toBeDefined()
})

test('toApiTool converts to Anthropic format', () => {
  const testTool = defineTool({
    name: 'search',
    description: 'Search for something',
    parameters: z.object({
      q: z.string(),
    }),
    handler: async () => 'result',
  })

  const apiTool = toApiTool(testTool as InternalTool)

  expect(apiTool.type).toBe('custom')
  expect(apiTool.name).toBe('search')
  expect(apiTool.description).toBe('Search for something')
  expect(apiTool.input_schema).toBeDefined()
})

test('strict tool sets strict on tool and API output', () => {
  const tool = defineTool({
    name: 'extract',
    description: 'Extract data',
    strict: true,
    parameters: z.object({ name: z.string() }),
    handler: async () => 'result',
  })

  expect(tool.strict).toBe(true)
  expect(toApiTool(tool as InternalTool)).toHaveProperty('strict', true)
})

test('parseToolInput validates input correctly', () => {
  const tool = defineTool({
    name: 'math',
    description: 'Do math',
    parameters: z.object({
      a: z.number(),
      b: z.number(),
    }),
    handler: async ({ a, b }) => String(a + b),
  })

  const validResult = parseToolInput(tool, { a: 5, b: 10 })
  expect(validResult.success).toBe(true)
  if (validResult.success) {
    expect(validResult.data.a).toBe(5)
    expect(validResult.data.b).toBe(10)
  }

  const invalidResult = parseToolInput(tool, { a: 'not a number', b: 10 })
  expect(invalidResult.success).toBe(false)
})

test('executeTool runs handler with validated input', async () => {
  const tool = defineTool({
    name: 'greet',
    description: 'Greet someone',
    parameters: z.object({
      name: z.string(),
    }),
    handler: async ({ name }) => `Hello, ${name}!`,
  })

  const result = await executeTool(tool, { name: 'World' }, mockContext)
  expect(result.isError).toBe(false)
  expect(result.result).toBe('Hello, World!')
})

test('executeTool handles validation errors', async () => {
  const tool = defineTool({
    name: 'test',
    description: 'test',
    parameters: z.object({
      age: z.number(),
    }),
    handler: async () => 'success',
  })

  const result = await executeTool(tool, { age: 'invalid' }, mockContext)
  expect(result.isError).toBe(true)
  expect(result.result).toContain('Validation error')
})

test('executeTool handles handler errors', async () => {
  const tool = defineTool({
    name: 'failing',
    description: 'This tool fails',
    parameters: z.object({
      shouldFail: z.boolean(),
    }),
    handler: async ({ shouldFail }) => {
      if (shouldFail) {
        throw new Error('Tool failed!')
      }
      return 'success'
    },
  })

  const result = await executeTool(tool, { shouldFail: true }, mockContext)
  expect(result.isError).toBe(true)
  expect(result.result).toContain('Error: Tool failed!')
})

test('state machine transitions correctly', () => {
  let state = initialState()
  expect(state.status).toBe(AgentStatus.Idle)

  state = transition(state, {
    type: TransitionType.StartStreaming,
    abortController: new AbortController(),
  })
  expect(state.status).toBe(AgentStatus.Streaming)

  state = transition(state, {
    type: TransitionType.ToolsRequested,
    pendingTools: [{ id: 'tool_1', name: 'test', input: {} }],
  })
  expect(state.status).toBe(AgentStatus.WaitingForTools)

  state = transition(state, {
    type: TransitionType.ToolsCompleted,
    results: [],
  })
  expect(state.status).toBe(AgentStatus.Idle)
})

test('state machine transitions to error state', () => {
  let state = initialState()
  state = transition(state, {
    type: TransitionType.StartStreaming,
    abortController: new AbortController(),
  })

  const error = new Error('Something went wrong')
  state = transition(state, { type: TransitionType.Error, error })

  expect(state.status).toBe(AgentStatus.Error)
  if (state.status === AgentStatus.Error) {
    expect(state.error).toBe(error)
  }
})

test('state machine transitions to completed state', () => {
  let state = initialState()
  state = transition(state, {
    type: TransitionType.StartStreaming,
    abortController: new AbortController(),
  })

  const finalMessage = {
    content: [],
    stop_reason: null,
    usage: { input_tokens: 0, output_tokens: 0 },
  } as AgentMessage
  state = transition(state, { type: TransitionType.Completed, finalMessage })

  expect(state.status).toBe(AgentStatus.Completed)
  if (state.status === AgentStatus.Completed) {
    expect(state.finalMessage).toBe(finalMessage)
  }
})

test('canAcceptMessages returns true for idle and completed', () => {
  expect(canAcceptMessages({ status: AgentStatus.Idle })).toBe(true)
  expect(
    canAcceptMessages({
      status: AgentStatus.Completed,
      finalMessage: {} as AgentMessage,
    }),
  ).toBe(true)
  expect(
    canAcceptMessages({
      status: AgentStatus.Streaming,
      abortController: new AbortController(),
    }),
  ).toBe(false)
  expect(
    canAcceptMessages({
      status: AgentStatus.WaitingForTools,
      pendingTools: [],
    }),
  ).toBe(false)
})

test('isProcessing returns true for active states', () => {
  expect(isProcessing({ status: AgentStatus.Idle })).toBe(false)
  expect(
    isProcessing({
      status: AgentStatus.Completed,
      finalMessage: {} as AgentMessage,
    }),
  ).toBe(false)
  expect(
    isProcessing({
      status: AgentStatus.Streaming,
      abortController: new AbortController(),
    }),
  ).toBe(true)
  expect(
    isProcessing({
      status: AgentStatus.WaitingForTools,
      pendingTools: [],
    }),
  ).toBe(true)
  expect(
    isProcessing({
      status: AgentStatus.ExecutingTools,
      pendingTools: [],
    }),
  ).toBe(true)
})
