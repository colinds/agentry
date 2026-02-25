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
import {
  toOpenAIInput,
  createOpenAIAdapter,
  getErrorEventDetails,
} from '../src/providers/openai'
import type { ResponsesWSLike } from '../src/providers/openai'
import type OpenAI from 'openai'
import { createAgentStore } from '../src/store'
import { ExecutionEngine } from '../src/execution'
import { InstanceType, type AgentInstance } from '../src/instances'
import { AgentStatus } from '../src/types'
import { resetSharedDefaultClients } from '../src/providers/clientResolver'
import type {
  NormalizedTurnRequest,
  NormalizedTurnResponse,
  OpenAIProviderConfigInternal,
} from '../src/providers/types'
import { OPENAI_INTERNAL_WS_FACTORY } from '../src/providers/types'

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
    { providers: { openai: { client } } },
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
      providers: { openai: { client } },
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
      providers: {
        openai: { client: openaiClient },
        anthropic: { client: anthropicClient },
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
      { providers: { openai: { client } } },
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
    {
      providers: {
        anthropic: { client: anthropicClient },
        openai: { client: openaiClient },
      },
    },
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
    { providers: { openai: { client } } },
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
    { providers: { openai: { client } } },
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
    { providers: { openai: { client } } },
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
    { providers: { openai: { client } } },
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
    { providers: { openai: { client } } },
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
  const providerEvents: string[] = []

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
        if (event.type === 'provider_event') {
          providerEvents.push(event.itemType)
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
    { providers: { openai: { client } } },
  )

  expect(result.content).toBe('Paris is cloudy')
  expect(toolUseEvents).toHaveLength(1)
  expect(toolUseEvents[0]!.toolName).toBe('get_weather')
  expect(toolUseEvents[0]!.toolId).toBe('call_stream_1')
  expect(providerEvents).toEqual(['function_call', 'message'])
})

test('streaming: built-in OpenAI output items fire tool_use_start events and parse cleanly', async () => {
  const toolUseEvents: Array<{ toolName: string; toolId: string }> = []
  const providerEvents: string[] = []

  const { client } = createOpenAIMockClient([
    {
      output: [
        {
          type: 'mcp_list_tools',
          id: 'mcp_list_1',
          server_label: 'cloudflare-demo',
          tools: [],
        },
        {
          type: 'web_search_call',
          id: 'ws_1',
          status: 'completed',
        },
        {
          type: 'code_interpreter_call',
          id: 'ci_1',
          status: 'completed',
          code: null,
          container_id: 'container_1',
          outputs: null,
        },
        {
          type: 'mcp_call',
          id: 'mcp_call_1',
          name: 'demo_tool',
          arguments: '{}',
          server_label: 'cloudflare-demo',
        },
        {
          type: 'file_search_call',
          id: 'fs_1',
          status: 'completed',
        },
        {
          type: 'image_generation_call',
          id: 'img_1',
          status: 'completed',
          result: null,
        },
        {
          type: 'message',
          content: [{ type: 'output_text', text: 'Built-ins ok' }],
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
        if (event.type === 'provider_event') {
          providerEvents.push(event.itemType)
        }
      }}
    >
      <Message role="user">Use built-ins.</Message>
    </Agent>,
    { providers: { openai: { client } } },
  )

  expect(result.content).toBe('Built-ins ok')
  expect(toolUseEvents).toEqual([
    { toolName: 'web_search', toolId: 'ws_1' },
    { toolName: 'code_interpreter', toolId: 'ci_1' },
    { toolName: 'mcp:demo_tool', toolId: 'mcp_call_1' },
    { toolName: 'file_search', toolId: 'fs_1' },
    { toolName: 'image_generation', toolId: 'img_1' },
  ])
  expect(providerEvents).toEqual([
    'mcp_list_tools',
    'web_search_call',
    'code_interpreter_call',
    'mcp_call',
    'file_search_call',
    'image_generation_call',
    'message',
  ])
})

test('non-streaming: built-in OpenAI output items emit provider_event events', async () => {
  const providerEvents: string[] = []

  const { client } = createOpenAIMockClient([
    {
      output: [
        {
          type: 'web_search_call',
          id: 'ws_non_stream_1',
          status: 'completed',
        },
        {
          type: 'message',
          content: [{ type: 'output_text', text: 'Non-stream built-ins ok' }],
        },
      ],
    },
  ])

  const result = await run(
    <Agent
      provider="openai"
      model={OPENAI_TEST_MODEL}
      stream={false}
      onMessage={(event) => {
        if (event.type === 'provider_event') {
          providerEvents.push(event.itemType)
        }
      }}
    >
      <Message role="user">Use built-ins without streaming.</Message>
    </Agent>,
    { providers: { openai: { client } } },
  )

  expect(result.content).toBe('Non-stream built-ins ok')
  expect(providerEvents).toEqual(['web_search_call', 'message'])
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

test('checkAndCompact resets provider continuation chain after compaction', async () => {
  let resetChainCalls = 0
  const store = createAgentStore()
  store.setState(() => ({
    executionState: { status: AgentStatus.Idle },
    messages: [
      { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Hi' }] },
    ],
  }))

  const adapter = {
    name: 'openai' as const,
    async createTurn(
      _client: OpenAI,
      _request: NormalizedTurnRequest,
    ): Promise<NormalizedTurnResponse> {
      return {
        message: {
          content: [{ type: 'text', text: 'Compacted summary' }],
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 1,
            output_tokens: 1,
          },
        },
      }
    },
    resetChain() {
      resetChainCalls++
    },
  }

  const anthropicAdapterStub = {
    name: 'anthropic' as const,
    async createTurn(): Promise<NormalizedTurnResponse> {
      throw new Error('not used in this test')
    },
  }

  const agentInstance: AgentInstance = {
    type: InstanceType.Agent,
    props: {
      provider: 'openai' as const,
      model: OPENAI_TEST_MODEL,
      maxTokens: 100,
    },
    client: {} as OpenAI,
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
    client: {} as OpenAI,
    model: OPENAI_TEST_MODEL,
    maxTokens: 100,
    store,
    agentInstance,
    adapters: {
      openai: adapter as never,
      anthropic: anthropicAdapterStub as never,
    },
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
  expect(resetChainCalls).toBe(1)
})

// ── WebSocket adapter tests ───────────────────────────────────────────────────

/**
 * Mock WebSocket emitter for testing createOpenAIAdapter({ websocket: true }).
 * Delivers pre-configured response event sequences in response to each send() call.
 */
class MockResponsesWS implements ResponsesWSLike {
  private eventHandlers: Array<
    (e: OpenAI.Responses.ResponsesServerEvent) => void
  > = []
  private errorHandlers: Array<(e: Error) => void> = []
  readonly sentEvents: Array<OpenAI.Responses.ResponsesClientEvent> = []
  closed = false

  /** Pre-loaded response batches — consumed one per send() call */
  private responseQueue: Array<Array<Record<string, unknown>>>

  constructor(responseQueue: Array<Array<Record<string, unknown>>>) {
    this.responseQueue = [...responseQueue]
  }

  on(
    event: 'event',
    handler: (e: OpenAI.Responses.ResponsesServerEvent) => void,
  ): void
  on(event: 'error', handler: (e: Error) => void): void
  on(
    event: 'event' | 'error',
    handler: ((e: OpenAI.Responses.ResponsesServerEvent) => void) &
      ((e: Error) => void),
  ): void {
    if (event === 'event') this.eventHandlers.push(handler)
    else if (event === 'error') this.errorHandlers.push(handler)
  }

  off(
    event: 'event',
    handler: (e: OpenAI.Responses.ResponsesServerEvent) => void,
  ): void
  off(event: 'error', handler: (e: Error) => void): void
  off(
    event: 'event' | 'error',
    handler: ((e: OpenAI.Responses.ResponsesServerEvent) => void) &
      ((e: Error) => void),
  ): void {
    if (event === 'event') {
      this.eventHandlers = this.eventHandlers.filter((h) => h !== handler)
    } else if (event === 'error') {
      this.errorHandlers = this.errorHandlers.filter((h) => h !== handler)
    }
  }

  send(event: OpenAI.Responses.ResponsesClientEvent): void {
    this.sentEvents.push(event)
    const batch = this.responseQueue.shift()
    if (!batch) throw new Error('MockResponsesWS: no more responses queued')
    // Emit all events asynchronously (next microtask) to simulate real WS
    Promise.resolve().then(() => {
      for (const serverEvent of batch) {
        for (const handler of this.eventHandlers) {
          handler(
            serverEvent as unknown as OpenAI.Responses.ResponsesServerEvent,
          )
        }
      }
    })
  }

  close(): void {
    this.closed = true
  }

  emitError(err: Error): void {
    for (const handler of this.errorHandlers) {
      handler(err)
    }
  }
}

function makeWsResponse(
  callIndex: number,
  output: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const events: Array<Record<string, unknown>> = []
  for (let i = 0; i < output.length; i++) {
    const item = output[i]!
    events.push({ type: 'response.output_item.added', output_index: i, item })
    if (item.type === 'message' && Array.isArray(item.content)) {
      for (const part of item.content as Array<Record<string, unknown>>) {
        if (part.type === 'output_text' && typeof part.text === 'string') {
          events.push({
            type: 'response.output_text.delta',
            output_index: i,
            delta: part.text,
          })
        }
      }
    }
    events.push({ type: 'response.output_item.done', output_index: i, item })
  }
  events.push({
    type: 'response.completed',
    response: {
      id: `resp_ws_${callIndex}`,
      output,
      status: 'completed',
      usage: { input_tokens: 100, output_tokens: 50 },
    },
  })
  return events
}

/** Build a minimal NormalizedTurnRequest for unit testing the adapter directly */
function makeTurnRequest(
  messages: NormalizedTurnRequest['messages'],
  overrides: Partial<NormalizedTurnRequest> = {},
): NormalizedTurnRequest {
  return {
    model: OPENAI_TEST_MODEL,
    maxTokens: 4096,
    messages,
    tools: [],
    builtInTools: [],
    mcpServers: [],
    stream: true,
    signal: new AbortController().signal,
    onStream: () => {},
    ...overrides,
  }
}

test('createOpenAIAdapter({ websocket: true }) uses WebSocket for streaming', async () => {
  let wsMock: MockResponsesWS | null = null

  const { client } = createOpenAIMockClient([])

  const result = await run(
    <Agent provider="openai" model={OPENAI_TEST_MODEL} stream={true}>
      <Message role="user">Hello via WS</Message>
    </Agent>,
    {
      providers: {
        openai: {
          client,
          websocket: true,
          [OPENAI_INTERNAL_WS_FACTORY]: () => {
            wsMock = new MockResponsesWS([
              makeWsResponse(1, [
                {
                  type: 'message',
                  content: [{ type: 'output_text', text: 'WS response' }],
                },
              ]),
            ])
            return wsMock
          },
        } as OpenAIProviderConfigInternal,
      },
    },
  )

  expect(result.content).toBe('WS response')
  expect(wsMock).not.toBeNull()
  expect(wsMock!.sentEvents).toHaveLength(1)
})

test('createOpenAIAdapter WS: subsequent turns send incremental input + previous_response_id', async () => {
  let wsMock: MockResponsesWS | null = null

  const { client } = createOpenAIMockClient([])

  const result = await run(
    <Agent provider="openai" model={OPENAI_TEST_MODEL} stream={true}>
      <Tools>
        <Tool
          name="get_info"
          description="Get info"
          parameters={z.object({ query: z.string() })}
          handler={async ({ query }) => `Info about ${query}`}
        />
      </Tools>
      <Message role="user">Use get_info</Message>
    </Agent>,
    {
      providers: {
        openai: {
          client,
          websocket: true,
          [OPENAI_INTERNAL_WS_FACTORY]: () => {
            wsMock = new MockResponsesWS([
              // Turn 1: function_call
              makeWsResponse(1, [
                {
                  type: 'function_call',
                  call_id: 'call_ws_1',
                  name: 'get_info',
                  arguments: JSON.stringify({ query: 'test' }),
                },
              ]),
              // Turn 2: final answer
              makeWsResponse(2, [
                {
                  type: 'message',
                  content: [{ type: 'output_text', text: 'WS final answer' }],
                },
              ]),
            ])
            return wsMock
          },
        } as OpenAIProviderConfigInternal,
      },
    },
  )

  expect(result.content).toBe('WS final answer')

  const mock = wsMock!
  expect(mock.sentEvents).toHaveLength(2)

  // Turn 1: first turn sends full context with no previous_response_id
  const turn1 = mock.sentEvents[0]!
  expect(turn1.previous_response_id).toBeUndefined()

  // Turn 2: has previous_response_id, only incremental input (tool result)
  const turn2 = mock.sentEvents[1]!
  expect(turn2.previous_response_id).toBe('resp_ws_1')
  const turn2Input = turn2.input as unknown as Array<Record<string, unknown>>
  expect(Array.isArray(turn2Input)).toBe(true)
  // Should only contain the tool result, not the original user message or function_call
  expect(turn2Input.every((item) => item.type === 'function_call_output')).toBe(
    true,
  )
})

test('createOpenAIAdapter WS: forwards stopSequences as stop param', async () => {
  let wsMock: MockResponsesWS | null = null

  const adapter = createOpenAIAdapter({
    websocket: true,
    _responsesWSFactory: () => {
      wsMock = new MockResponsesWS([
        makeWsResponse(1, [
          {
            type: 'message',
            content: [{ type: 'output_text', text: 'Stopped response' }],
          },
        ]),
      ])
      return wsMock
    },
  })

  const { client } = createOpenAIMockClient([])

  await adapter.createTurn(
    client,
    makeTurnRequest(
      [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
      { stopSequences: ['STOP'] },
    ),
  )

  const sent = wsMock!.sentEvents[0]! as unknown as Record<string, unknown>
  expect(sent.stop).toEqual(['STOP'])
})

test('createOpenAIAdapter WS: previous_response_not_found retries with HTTP', async () => {
  let wsMock: MockResponsesWS | null = null
  const httpCalls: Array<Record<string, unknown>> = []

  // HTTP fallback client — used for the full-context retry after the WS error
  const fallbackResponses = [
    {
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: 'HTTP fallback result' }],
        },
      ],
    },
  ]
  const { client } = createOpenAIMockClient(fallbackResponses)
  const originalCreate = (
    client as unknown as { responses: { create: (...a: unknown[]) => unknown } }
  ).responses.create.bind(
    (
      client as unknown as {
        responses: { create: (...a: unknown[]) => unknown }
      }
    ).responses,
  )
  ;(
    client as unknown as { responses: { create: (...a: unknown[]) => unknown } }
  ).responses.create = async (...args: unknown[]) => {
    httpCalls.push(args[0] as Record<string, unknown>)
    return originalCreate(...args)
  }

  const result = await run(
    <Agent provider="openai" model={OPENAI_TEST_MODEL} stream={false}>
      <Tools>
        <Tool
          name="noop"
          description="No-op tool"
          parameters={z.object({})}
          handler={async () => 'done'}
        />
      </Tools>
      <Message role="user">Do something</Message>
    </Agent>,
    {
      providers: {
        openai: {
          client,
          websocket: true,
          [OPENAI_INTERNAL_WS_FACTORY]: () => {
            wsMock = new MockResponsesWS([
              // Turn 1 via WS: function_call to trigger a tool use
              makeWsResponse(1, [
                {
                  type: 'function_call',
                  call_id: 'call_ws_1',
                  name: 'noop',
                  arguments: '{}',
                },
              ]),
              // Turn 2 via WS (after tool result): previous_response_not_found error
              [
                {
                  type: 'error',
                  code: 'previous_response_not_found',
                  message: 'Previous response not found',
                  param: null,
                  sequence_number: 0,
                },
              ],
            ])
            return wsMock
          },
        } as OpenAIProviderConfigInternal,
      },
    },
  )

  expect(result.content).toBe('HTTP fallback result')
  expect(httpCalls.length).toBeGreaterThan(0)
})

test('createOpenAIAdapter WS: adapter.close() closes the WebSocket', async () => {
  let wsMock: MockResponsesWS | null = null

  const adapter = createOpenAIAdapter({
    websocket: true,
    _responsesWSFactory: () => {
      wsMock = new MockResponsesWS([
        makeWsResponse(1, [
          {
            type: 'message',
            content: [{ type: 'output_text', text: 'OK' }],
          },
        ]),
      ])
      return wsMock
    },
  })

  const { client } = createOpenAIMockClient([])
  const request = makeTurnRequest([
    { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
  ])

  await adapter.createTurn(client, request)

  expect(wsMock!.closed).toBe(false)
  adapter.close()
  expect(wsMock!.closed).toBe(true)
})

test('createOpenAIAdapter WS: adapter.close() resets continuation state', async () => {
  const wsMocks: MockResponsesWS[] = []

  const adapter = createOpenAIAdapter({
    websocket: true,
    _responsesWSFactory: () => {
      const ws = new MockResponsesWS([
        makeWsResponse(wsMocks.length + 1, [
          {
            type: 'message',
            content: [{ type: 'output_text', text: 'OK' }],
          },
        ]),
      ])
      wsMocks.push(ws)
      return ws
    },
  })

  const { client } = createOpenAIMockClient([])

  await adapter.createTurn(
    client,
    makeTurnRequest([
      { role: 'user', content: [{ type: 'text', text: 'First turn' }] },
    ]),
  )

  adapter.close()

  await adapter.createTurn(
    client,
    makeTurnRequest([
      { role: 'user', content: [{ type: 'text', text: 'Second turn' }] },
    ]),
  )

  expect(wsMocks).toHaveLength(2)
  expect(wsMocks[1]!.sentEvents).toHaveLength(1)

  // After close(), second turn should send full context with no previous_response_id
  const secondTurnEvent = wsMocks[1]!.sentEvents[0]!
  expect(secondTurnEvent.previous_response_id).toBeUndefined()

  const secondTurnInput = secondTurnEvent.input as unknown as Array<
    Record<string, unknown>
  >
  expect(secondTurnInput.length).toBeGreaterThan(0)
})

test('createOpenAIAdapter WS: resetChain() starts a new chain without closing websocket', async () => {
  let wsMock: MockResponsesWS | null = null

  const adapter = createOpenAIAdapter({
    websocket: true,
    _responsesWSFactory: () => {
      wsMock = new MockResponsesWS([
        makeWsResponse(1, [
          {
            type: 'message',
            content: [{ type: 'output_text', text: 'First response' }],
          },
        ]),
        makeWsResponse(2, [
          {
            type: 'message',
            content: [{ type: 'output_text', text: 'Second response' }],
          },
        ]),
      ])
      return wsMock
    },
  })

  const { client } = createOpenAIMockClient([])

  await adapter.createTurn(
    client,
    makeTurnRequest([
      { role: 'user', content: [{ type: 'text', text: 'First turn' }] },
    ]),
  )

  adapter.resetChain?.()

  await adapter.createTurn(
    client,
    makeTurnRequest([
      { role: 'user', content: [{ type: 'text', text: 'Second turn' }] },
    ]),
  )

  expect(wsMock!.closed).toBe(false)
  expect(wsMock!.sentEvents).toHaveLength(2)

  // After resetChain(), second turn sends full context with no previous_response_id
  const secondEvent = wsMock!.sentEvents[1]! as unknown as Record<
    string,
    unknown
  >
  expect(secondEvent.previous_response_id).toBeUndefined()
  const secondInput = secondEvent.input as Array<Record<string, unknown>>
  expect(secondInput).toEqual([
    expect.objectContaining({ role: 'user', content: 'Second turn' }),
  ])
})

test('createOpenAIAdapter WS: adapter.close() called automatically on handle.close()', async () => {
  let wsMock: MockResponsesWS | null = null

  const { client } = createOpenAIMockClient([])

  await run(
    <Agent provider="openai" model={OPENAI_TEST_MODEL} stream={true}>
      <Message role="user">Hello</Message>
    </Agent>,
    {
      providers: {
        openai: {
          client,
          websocket: true,
          [OPENAI_INTERNAL_WS_FACTORY]: () => {
            wsMock = new MockResponsesWS([
              makeWsResponse(1, [
                {
                  type: 'message',
                  content: [{ type: 'output_text', text: 'OK' }],
                },
              ]),
            ])
            return wsMock
          },
        } as OpenAIProviderConfigInternal,
      },
    },
  )

  // In batch mode, run() calls handle.close() in its finally block,
  // which calls cleanup() → adapter.close()
  expect(wsMock!.closed).toBe(true)
})

test('createOpenAIAdapter WS: websocket_connection_limit_reached retries with HTTP', async () => {
  let wsMock: MockResponsesWS | null = null
  const httpCalls: Array<Record<string, unknown>> = []

  const fallbackResponses = [
    {
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: 'HTTP fallback after limit' }],
        },
      ],
    },
  ]
  const { client } = createOpenAIMockClient(fallbackResponses)
  const originalCreate = (
    client as unknown as { responses: { create: (...a: unknown[]) => unknown } }
  ).responses.create.bind(
    (
      client as unknown as {
        responses: { create: (...a: unknown[]) => unknown }
      }
    ).responses,
  )
  ;(
    client as unknown as { responses: { create: (...a: unknown[]) => unknown } }
  ).responses.create = async (...args: unknown[]) => {
    httpCalls.push(args[0] as Record<string, unknown>)
    return originalCreate(...args)
  }

  const adapter = createOpenAIAdapter({
    websocket: true,
    _responsesWSFactory: () => {
      wsMock = new MockResponsesWS([
        // First real turn: connection limit error
        [
          {
            type: 'error',
            code: 'websocket_connection_limit_reached',
            message: 'Connection limit reached',
            param: null,
            sequence_number: 0,
          },
        ],
      ])
      return wsMock
    },
  })

  const request = makeTurnRequest([
    { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
  ])

  const result = await adapter.createTurn(client, request)

  expect(result.message.content).toEqual([
    { type: 'text', text: 'HTTP fallback after limit' },
  ])
  expect(wsMock!.closed).toBe(true)
  expect(httpCalls.length).toBeGreaterThan(0)
})

test('getErrorEventDetails extracts nested error fields', () => {
  // Nested error: no top-level message/code, only in error sub-object
  const result = getErrorEventDetails({
    error: { message: 'nested error message', code: 'nested_code' },
  })
  expect(result.message).toBe('nested error message')
  expect(result.code).toBe('nested_code')

  // Top-level fields take precedence
  const result2 = getErrorEventDetails({
    message: 'top level',
    code: 'top_code',
    error: { message: 'nested', code: 'nested_code' },
  })
  expect(result2.message).toBe('top level')
  expect(result2.code).toBe('top_code')

  // Fallback to JSON.stringify when no message available
  const result3 = getErrorEventDetails({ error: { code: 'only_code' } })
  expect(result3.message).toContain('only_code')
  expect(result3.code).toBe('only_code')
})
