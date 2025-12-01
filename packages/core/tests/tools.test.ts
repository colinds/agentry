import { test, expect } from 'bun:test'
import { z } from 'zod'
import type { BetaMessage } from '@anthropic-ai/sdk/resources/beta'
import {
  defineTool,
  parseToolInput,
  executeTool,
  toApiTool,
  zodToJsonSchema,
} from '../src/tools/index.ts'
import {
  initialState,
  transition,
  canAcceptMessages,
  isProcessing,
  type InternalTool,
} from '../src/types/index.ts'
import { createStepMockClient } from '../src/test-utils/index.ts'
import type { ToolContext } from '../src/types/tools.ts'

const { client } = createStepMockClient([])
const mockContext: ToolContext = {
  agentName: 'test-agent',
  client,
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
  expect(state.status).toBe('idle')

  state = transition(state, {
    type: 'start_streaming',
    abortController: new AbortController(),
  })
  expect(state.status).toBe('streaming')

  state = transition(state, {
    type: 'tools_requested',
    pendingTools: [{ id: 'tool_1', name: 'test', input: {} }],
  })
  expect(state.status).toBe('waiting_for_tools')

  state = transition(state, {
    type: 'tools_completed',
    results: [],
  })
  expect(state.status).toBe('idle')
})

test('zodToJsonSchema returns object with type field', () => {
  const schema = z.object({
    name: z.string(),
  })

  const jsonSchema = zodToJsonSchema(schema)

  expect(jsonSchema.type).toBe('object')
})

test('zodToJsonSchema works with defineTool output', () => {
  const tool = defineTool({
    name: 'test',
    description: 'test',
    parameters: z.object({
      query: z.string().describe('The query'),
      count: z.number().optional(),
    }),
    handler: async () => 'ok',
  })

  expect(tool.jsonSchema).toBeDefined()
  expect(tool.jsonSchema.type).toBe('object')
})

test('zodToJsonSchema handles empty schema', () => {
  const schema = z.object({})
  const jsonSchema = zodToJsonSchema(schema)

  expect(jsonSchema.type).toBe('object')
})

test('state machine transitions to error state', () => {
  let state = initialState()
  state = transition(state, {
    type: 'start_streaming',
    abortController: new AbortController(),
  })

  const error = new Error('Something went wrong')
  state = transition(state, { type: 'error', error })

  expect(state.status).toBe('error')
  if (state.status === 'error') {
    expect(state.error).toBe(error)
  }
})

test('state machine transitions to completed state', () => {
  let state = initialState()
  state = transition(state, {
    type: 'start_streaming',
    abortController: new AbortController(),
  })

  const finalMessage = { id: 'msg_1', type: 'message' } as BetaMessage
  state = transition(state, { type: 'completed', finalMessage })

  expect(state.status).toBe('completed')
  if (state.status === 'completed') {
    expect(state.finalMessage).toBe(finalMessage)
  }
})

test('state machine reset returns to idle', () => {
  let state = initialState()
  state = transition(state, {
    type: 'start_streaming',
    abortController: new AbortController(),
  })
  expect(state.status).toBe('streaming')

  state = transition(state, { type: 'reset' })
  expect(state.status).toBe('idle')
})

test('canAcceptMessages returns true for idle and completed', () => {
  expect(canAcceptMessages({ status: 'idle' })).toBe(true)
  expect(
    canAcceptMessages({ status: 'completed', finalMessage: {} as BetaMessage }),
  ).toBe(true)
  expect(
    canAcceptMessages({
      status: 'streaming',
      abortController: new AbortController(),
    }),
  ).toBe(false)
  expect(
    canAcceptMessages({ status: 'waiting_for_tools', pendingTools: [] }),
  ).toBe(false)
})

test('isProcessing returns true for active states', () => {
  expect(isProcessing({ status: 'idle' })).toBe(false)
  expect(
    isProcessing({ status: 'completed', finalMessage: {} as BetaMessage }),
  ).toBe(false)
  expect(
    isProcessing({
      status: 'streaming',
      abortController: new AbortController(),
    }),
  ).toBe(true)
  expect(isProcessing({ status: 'waiting_for_tools', pendingTools: [] })).toBe(
    true,
  )
  expect(isProcessing({ status: 'executing_tools', pendingTools: [] })).toBe(
    true,
  )
})
