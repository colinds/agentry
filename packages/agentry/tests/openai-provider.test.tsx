import { test, expect, beforeEach } from 'bun:test'
import { z } from 'zod'
import { run, Agent, Message, Tools, AgentTool, Tool } from '../src'
import {
  createOpenAIMockClient,
  createStepMockClient,
  mockText,
  mockToolUse,
} from './utils'
import { ANTHROPIC_TEST_MODEL, OPENAI_TEST_MODEL } from '../src/constants'
import { toOpenAIInput } from '../src/providers/openai'
import { createAgentStore } from '../src/store'
import { ExecutionEngine } from '../src/execution'
import { InstanceType, type AgentInstance } from '../src/instances'
import { AgentStatus } from '../src/types'
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
    <Agent provider="openai" model="gpt-5-mini" stream={false}>
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
    <Agent provider="openai" model="gpt-5-mini" stream={false}>
      <Tools>
        <AgentTool
          name="researcher"
          description="Research specialist"
          parameters={z.object({ topic: z.string() })}
          agent={({ topic }) => (
            <Agent
              provider="anthropic"
              model={ANTHROPIC_TEST_MODEL}
              stream={false}
            >
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
    <Agent provider="anthropic" model={ANTHROPIC_TEST_MODEL} stream={false}>
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

test('thinking sends reasoning params to OpenAI API (non-streaming)', async () => {
  const { client, calls } = createOpenAIMockClient([
    {
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: 'Reasoned response' }],
        },
      ],
    },
  ])

  await run(
    <Agent
      provider="openai"
      model={OPENAI_TEST_MODEL}
      stream={false}
      thinking={{ type: 'enabled', effort: 'medium', summary: 'auto' }}
    >
      <Message role="user">Think about this</Message>
    </Agent>,
    { clients: { openai: client } },
  )

  expect(calls.length).toBe(1)
  const reasoning = calls[0]!.reasoning as Record<string, unknown>
  expect(reasoning).toBeDefined()
  expect(reasoning.effort).toBe('medium')
  expect(reasoning.summary).toBe('auto')
})

test('reasoning summary returned in result.thinking (non-streaming)', async () => {
  const { client } = createOpenAIMockClient([
    {
      output: [
        {
          type: 'reasoning',
          summary: [{ type: 'summary_text', text: 'I reasoned...' }],
        },
        {
          type: 'message',
          content: [{ type: 'output_text', text: 'Final answer' }],
        },
      ],
    },
  ])

  const result = await run(
    <Agent
      provider="openai"
      model={OPENAI_TEST_MODEL}
      stream={false}
      thinking={{ type: 'enabled', effort: 'medium', summary: 'auto' }}
    >
      <Message role="user">Think about this</Message>
    </Agent>,
    { clients: { openai: client } },
  )

  // thinking is available in the final result; onMessage does not fire in non-streaming mode
  expect(result.thinking).toBe('I reasoned...')
})

test('streaming: reasoning delta fires thinking event', async () => {
  const thinkingEvents: string[] = []

  const { client } = createOpenAIMockClient([
    {
      output: [
        {
          type: 'reasoning',
          summary: [{ type: 'summary_text', text: 'Streaming thought' }],
        },
        {
          type: 'message',
          content: [{ type: 'output_text', text: 'Streamed answer' }],
        },
      ],
    },
  ])

  const result = await run(
    <Agent
      provider="openai"
      model={OPENAI_TEST_MODEL}
      stream={true}
      thinking={{ type: 'enabled', effort: 'low', summary: 'concise' }}
      onMessage={(event) => {
        if (event.type === 'thinking') thinkingEvents.push(event.text)
      }}
    >
      <Message role="user">Stream thoughts</Message>
    </Agent>,
    { clients: { openai: client } },
  )

  expect(result.content).toBe('Streamed answer')
  expect(thinkingEvents).toContain('Streaming thought')
})

test('tool handler error is returned as [ERROR] function_call_output', async () => {
  const { client, calls } = createOpenAIMockClient([
    {
      output: [
        {
          type: 'function_call',
          call_id: 'call_err',
          name: 'failing_tool',
          arguments: JSON.stringify({}),
        },
      ],
    },
    {
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: 'Got error from tool' }],
        },
      ],
    },
  ])

  await run(
    <Agent provider="openai" model={OPENAI_TEST_MODEL} stream={false}>
      <Tools>
        <Tool
          name="failing_tool"
          description="A tool that always throws"
          parameters={z.object({})}
          handler={async () => {
            throw new Error('boom')
          }}
        />
      </Tools>
      <Message role="user">Call the failing tool</Message>
    </Agent>,
    { clients: { openai: client } },
  )

  const secondCallInput = calls[1]!.input as Array<Record<string, unknown>>
  const toolOutput = secondCallInput.find(
    (item) => item.type === 'function_call_output',
  )
  expect(toolOutput).toBeDefined()
  expect(toolOutput!.call_id).toBe('call_err')
  expect(String(toolOutput!.output)).toMatch(/boom/i)
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

test('streaming: function_call item fires tool_use_start event', async () => {
  const toolUseEvents: Array<{ toolName: string; toolId: string }> = []

  const { client } = createOpenAIMockClient([
    {
      output: [
        {
          type: 'function_call',
          call_id: 'call_stream_1',
          name: 'get_weather',
          arguments: JSON.stringify({ city: 'Paris' }),
        },
      ],
    },
    {
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: 'Paris is cloudy' }],
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
        if (event.type === 'tool_use_start') {
          toolUseEvents.push({ toolName: event.toolName, toolId: event.toolId })
        }
      }}
    >
      <Tools>
        <Tool
          name="get_weather"
          description="Get weather"
          parameters={z.object({ city: z.string() })}
          handler={async ({ city }) => `Weather in ${city}: Cloudy`}
        />
      </Tools>
      <Message role="user">What is the weather in Paris?</Message>
    </Agent>,
    { clients: { openai: client } },
  )

  expect(result.content).toBe('Paris is cloudy')
  expect(toolUseEvents).toHaveLength(1)
  expect(toolUseEvents[0]!.toolName).toBe('get_weather')
  expect(toolUseEvents[0]!.toolId).toBe('call_stream_1')
})

// toOpenAIInput unit tests

test('toOpenAIInput: tool_result with is_error:true is prefixed with [ERROR]', () => {
  const input = toOpenAIInput([
    {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'call_x',
          content: 'something went wrong',
          is_error: true,
        },
      ],
    },
  ])
  expect(input).toHaveLength(1)
  const item = input[0] as unknown as Record<string, unknown>
  expect(item.type).toBe('function_call_output')
  expect(item.call_id).toBe('call_x')
  expect(item.output).toBe('[ERROR] something went wrong')
})

test('toOpenAIInput: tool_result without is_error has no [ERROR] prefix', () => {
  const input = toOpenAIInput([
    {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'call_y',
          content: 'success result',
        },
      ],
    },
  ])
  const item = input[0] as unknown as Record<string, unknown>
  expect(item.output).toBe('success result')
  expect(String(item.output)).not.toMatch(/^\[ERROR\]/)
})

test('toOpenAIInput: assistant message with only thinking block emits empty placeholder', () => {
  const input = toOpenAIInput([
    {
      role: 'assistant',
      content: [
        {
          type: 'thinking',
          thinking: 'some internal thought',
        },
      ],
    },
  ])
  expect(input).toHaveLength(1)
  const item = input[0] as unknown as Record<string, unknown>
  expect(item.role).toBe('assistant')
  expect(item.content).toBe('')
})

test('toOpenAIInput: assistant message with text and tool_use preserves order', () => {
  const input = toOpenAIInput([
    {
      role: 'assistant',
      content: [
        { type: 'text', text: 'I will call a tool' },
        { type: 'tool_use', id: 'call_z', name: 'my_tool', input: { x: 1 } },
      ],
    },
  ])
  expect(input).toHaveLength(2)
  const first = input[0] as unknown as Record<string, unknown>
  const second = input[1] as unknown as Record<string, unknown>
  expect(first.content).toBe('I will call a tool')
  expect(second.type).toBe('function_call')
  expect(second.call_id).toBe('call_z')
  expect(second.name).toBe('my_tool')
})

// OpenAI compaction test

test('checkAndCompact compacts messages for OpenAI provider when threshold exceeded', async () => {
  const { client, calls } = createOpenAIMockClient([
    {
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: 'OpenAI summary' }],
        },
      ],
    },
  ])

  const store = createAgentStore()
  store.setState(() => ({
    executionState: { status: AgentStatus.Idle },
    messages: [
      { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Hi' }] },
    ],
  }))

  const agentInstance: AgentInstance = {
    type: InstanceType.Agent,
    props: {
      provider: 'openai' as const,
      model: OPENAI_TEST_MODEL,
      maxTokens: 100,
    },
    client,
    engine: null,
    systemParts: [],
    tools: [],
    builtInTools: [],
    mcpServers: [],
    children: [],
    parent: null,
    store,
  }

  const engine = new ExecutionEngine({
    provider: 'openai',
    client,
    model: OPENAI_TEST_MODEL,
    maxTokens: 100,
    store,
    agentInstance,
    compactionControl: {
      enabled: true,
      contextTokenThreshold: 10,
      model: OPENAI_TEST_MODEL,
    },
  })

  const engineWithInternals = engine as unknown as {
    lastMessage: unknown
    checkAndCompact: () => Promise<boolean>
  }

  engineWithInternals.lastMessage = {
    content: [],
    stop_reason: 'end_turn',
    usage: {
      input_tokens: 100,
      output_tokens: 50,
    },
  }

  const didCompact = await engineWithInternals.checkAndCompact()

  expect(didCompact).toBe(true)
  expect(calls.length).toBe(1)

  const state = store.getState()
  expect(state.messages).toHaveLength(1)
  const onlyMessage = state.messages[0]!
  expect(onlyMessage.role).toBe('user')
  expect(onlyMessage.content as unknown[]).toEqual([
    expect.objectContaining({ type: 'text', text: 'OpenAI summary' }),
  ])
})
