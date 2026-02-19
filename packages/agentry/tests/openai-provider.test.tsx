import { test, expect, beforeEach } from 'bun:test'
import { z } from 'zod'
import { run, Agent, Message, Tools, AgentTool, Tool } from '../src'
import {
  createOpenAIMockClient,
  createStepMockClient,
  mockText,
  mockToolUse,
} from './utils'
import { TEST_MODEL, OPENAI_TEST_MODEL } from '../src/constants'
import { resetSharedDefaultClients } from '../src/providers/clientResolver'

beforeEach(() => {
  resetSharedDefaultClients()
})

test('openai provider streams text correctly', async () => {
  const streamedChunks: string[] = []

  const { client } = createOpenAIMockClient([
    {
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: 'Streamed response' }],
        },
      ],
    },
  ])

  const result = await run(
    <Agent
      provider="openai"
      model={OPENAI_TEST_MODEL}
      stream={true}
      onMessage={(event) => {
        if (event.type === 'text') streamedChunks.push(event.text)
      }}
    >
      <Message role="user">Hello</Message>
    </Agent>,
    { clients: { openai: client } },
  )

  expect(result.content).toBe('Streamed response')
  expect(streamedChunks).toContain('Streamed response')
})

test('openai provider runs basic response flow', async () => {
  const { client, calls } = createOpenAIMockClient([
    {
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: 'Hello from OpenAI' }],
        },
      ],
    },
  ])

  const result = await run(
    <Agent provider="openai" model="gpt-4.1-mini" stream={false}>
      <Message role="user">Hello</Message>
    </Agent>,
    {
      clients: { openai: client },
    },
  )

  expect(result.content).toBe('Hello from OpenAI')
  expect(calls.length).toBe(1)
})

test('openai parent can run anthropic AgentTool subagent', async () => {
  const { client: openaiClient, calls: openaiCalls } = createOpenAIMockClient([
    {
      output: [
        {
          type: 'function_call',
          call_id: 'call_1',
          name: 'researcher',
          arguments: JSON.stringify({ topic: 'Bun runtime' }),
        },
      ],
    },
    {
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: 'Final combined answer' }],
        },
      ],
    },
  ])

  const anthropicClient = {
    beta: {
      messages: {
        create: async () => ({
          content: [{ type: 'text', text: 'Anthropic subagent result' }],
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            cache_creation_input_tokens: null,
            cache_read_input_tokens: null,
          },
        }),
      },
    },
  } as any

  const runPromise = run(
    <Agent provider="openai" model="gpt-4.1-mini" stream={false}>
      <Tools>
        <AgentTool
          name="researcher"
          description="Research specialist"
          parameters={z.object({ topic: z.string() })}
          agent={({ topic }) => (
            <Agent provider="anthropic" model={TEST_MODEL} stream={false}>
              <Message role="user">Research: {topic}</Message>
            </Agent>
          )}
        />
      </Tools>
      <Message role="user">Please research Bun runtime</Message>
    </Agent>,
    {
      clients: {
        openai: openaiClient,
        anthropic: anthropicClient,
      },
    },
  )

  const result = await runPromise
  expect(result.content).toBe('Final combined answer')

  // assert the OpenAI client received two calls: function_call turn + final turn
  expect(openaiCalls.length).toBe(2)
  // second call should contain a function_call_output referencing call_1
  const secondCallInput = openaiCalls[1]!.input as Array<
    Record<string, unknown>
  >
  const functionCallOutput = secondCallInput.find(
    (item) => item.type === 'function_call_output',
  )
  expect(functionCallOutput).toBeDefined()
  expect(functionCallOutput!.call_id).toBe('call_1')
  expect(functionCallOutput!.output).toContain('Anthropic subagent result')
})

test('client: backward-compat detects OpenAI client without clients:', async () => {
  const { client } = createOpenAIMockClient([
    {
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: 'Detected via client:' }],
        },
      ],
    },
  ])

  const result = await run(
    <Agent provider="openai" model={OPENAI_TEST_MODEL} stream={false}>
      <Message role="user">Hello</Message>
    </Agent>,
    { client },
  )

  expect(result.content).toBe('Detected via client:')
})

test('missing OpenAI client throws descriptive error when no env var set', async () => {
  const originalKey = process.env.OPENAI_API_KEY
  delete process.env.OPENAI_API_KEY
  resetSharedDefaultClients()

  try {
    await expect(
      run(
        <Agent provider="openai" model={OPENAI_TEST_MODEL} stream={false}>
          <Message role="user">Hello</Message>
        </Agent>,
      ),
    ).rejects.toThrow('No OpenAI client configured')
  } finally {
    if (originalKey !== undefined) {
      process.env.OPENAI_API_KEY = originalKey
    }
    resetSharedDefaultClients()
  }
})

test('surfaces stream failure from response.failed event', async () => {
  const { client } = createOpenAIMockClient([
    { type: 'failed', message: 'rate limit exceeded' },
  ])

  await expect(
    run(
      <Agent provider="openai" model={OPENAI_TEST_MODEL} stream={true}>
        <Message role="user">Hello</Message>
      </Agent>,
      { clients: { openai: client } },
    ),
  ).rejects.toThrow('rate limit exceeded')
})

test('anthropic parent can run openai AgentTool subagent', async () => {
  const { client: anthropicClient, controller } = createStepMockClient([
    {
      content: [mockToolUse('summarizer', { text: 'Hello world' })],
      stop_reason: 'tool_use',
    },
    {
      content: [mockText('Summary complete')],
      stop_reason: 'end_turn',
    },
  ])

  let openaiCallCount = 0
  const { client: openaiClient } = createOpenAIMockClient([
    {
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: 'OpenAI summary result' }],
        },
      ],
    },
  ])

  const originalCreate = (openaiClient as any).responses.create.bind(
    (openaiClient as any).responses,
  )
  ;(openaiClient as any).responses.create = async (...args: unknown[]) => {
    openaiCallCount++
    return originalCreate(...args)
  }

  const runPromise = run(
    <Agent provider="anthropic" model={TEST_MODEL} stream={false}>
      <Tools>
        <AgentTool
          name="summarizer"
          description="Summarize text"
          parameters={z.object({ text: z.string() })}
          agent={({ text }) => (
            <Agent provider="openai" model={OPENAI_TEST_MODEL} stream={false}>
              <Message role="user">Summarize: {text}</Message>
            </Agent>
          )}
        />
      </Tools>
      <Message role="user">Summarize something</Message>
    </Agent>,
    { clients: { anthropic: anthropicClient, openai: openaiClient } },
  )

  await controller.nextTurn() // tool_use turn
  await controller.waitForNextCall()
  await controller.nextTurn() // final anthropic turn

  const result = await runPromise
  expect(result.content).toBe('Summary complete')
  expect(openaiCallCount).toBe(1)
})

test('openai multi-turn tool round-trip (function_call → result → response)', async () => {
  let capturedSecondInput: Array<Record<string, unknown>> | null = null

  const { client, calls } = createOpenAIMockClient([
    {
      output: [
        {
          type: 'function_call',
          call_id: 'call_abc',
          name: 'get_weather',
          arguments: JSON.stringify({ city: 'London' }),
        },
      ],
    },
    {
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: 'London is sunny' }],
        },
      ],
    },
  ])

  const result = await run(
    <Agent provider="openai" model={OPENAI_TEST_MODEL} stream={false}>
      <Tools>
        <Tool
          name="get_weather"
          description="Get weather for a city"
          parameters={z.object({ city: z.string() })}
          handler={async ({ city }) => `Weather in ${city}: Sunny`}
        />
      </Tools>
      <Message role="user">What is the weather in London?</Message>
    </Agent>,
    { clients: { openai: client } },
  )

  expect(result.content).toBe('London is sunny')
  expect(calls.length).toBe(2)

  capturedSecondInput = calls[1]!.input as Array<Record<string, unknown>>

  // verify function_call was echoed back as function_call output with matching call_id
  const functionCallOutput = capturedSecondInput.find(
    (item) => item.type === 'function_call_output',
  )
  expect(functionCallOutput).toBeDefined()
  expect(functionCallOutput!.call_id).toBe('call_abc')
  expect(functionCallOutput!.output).toContain('London')

  // verify the original function_call is replayed correctly
  const functionCall = capturedSecondInput.find(
    (item) => item.type === 'function_call',
  )
  expect(functionCall).toBeDefined()
  expect(functionCall!.call_id).toBe('call_abc')
  expect(functionCall!.name).toBe('get_weather')
})
