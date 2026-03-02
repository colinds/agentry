import { test, expect, beforeEach, describe } from 'bun:test'
import { run, Agent, Message, Tools } from '../src'
import { CodeExecution, WebSearch, Memory, MCP } from '../src/anthropic'
import { MCP as OpenAIMCP } from '../src/openai'
import { createStepMockClient, mockText } from './utils'
import { createOpenAIMockClient } from './utils'
import {
  ANTHROPIC_TEST_MODEL,
  OPENAI_TEST_MODEL,
  ANTHROPIC_BETAS,
} from '../src/constants'
import { resetSharedDefaultClients } from '../src/providers/clientResolver'

beforeEach(() => {
  resetSharedDefaultClients()
})

describe('Anthropic', () => {
  test('CodeExecution is sent with versioned wire type', async () => {
    const { client, controller } = createStepMockClient([
      { content: [mockText('done')] },
    ])

    const runPromise = run(
      <Agent provider="anthropic" model={ANTHROPIC_TEST_MODEL} maxTokens={100}>
        <Tools>
          <CodeExecution />
        </Tools>
        <Message role="user">run some code</Message>
      </Agent>,
      { providers: { anthropic: { client } } },
    )

    await controller.waitForNextCall()
    const call = controller.peekNextCall()
    const tools = call!.params.tools as Array<{ type: string }>
    expect(tools.some((t) => t.type === 'code_execution_20250825')).toBe(true)

    await controller.nextTurn()
    await runPromise
  })

  test('WebSearch is sent with versioned wire type', async () => {
    const { client, controller } = createStepMockClient([
      { content: [mockText('done')] },
    ])

    const runPromise = run(
      <Agent provider="anthropic" model={ANTHROPIC_TEST_MODEL} maxTokens={100}>
        <Tools>
          <WebSearch maxUses={5} allowedDomains={['example.com']} />
        </Tools>
        <Message role="user">search something</Message>
      </Agent>,
      { providers: { anthropic: { client } } },
    )

    await controller.waitForNextCall()
    const call = controller.peekNextCall()
    const tools = call!.params.tools as Array<{
      type: string
      max_uses?: number
      allowed_domains?: string[]
    }>
    const wsTool = tools.find((t) => t.type === 'web_search_20250305')
    expect(wsTool).toBeDefined()
    expect(wsTool?.max_uses).toBe(5)
    expect(wsTool?.allowed_domains).toEqual(['example.com'])

    await controller.nextTurn()
    await runPromise
  })

  test('Memory is sent with versioned wire type (memoryHandlers stripped)', async () => {
    const { client, controller } = createStepMockClient([
      { content: [mockText('done')] },
    ])

    const runPromise = run(
      <Agent provider="anthropic" model={ANTHROPIC_TEST_MODEL} maxTokens={100}>
        <Tools>
          <Memory onView={async () => 'contents'} />
        </Tools>
        <Message role="user">remember something</Message>
      </Agent>,
      { providers: { anthropic: { client } } },
    )

    await controller.waitForNextCall()
    const call = controller.peekNextCall()
    const tools = call!.params.tools as Array<Record<string, unknown>>
    const memTool = tools.find((t) => t['type'] === 'memory_20250818')
    expect(memTool).toBeDefined()
    expect(memTool!['memoryHandlers']).toBeUndefined()

    await controller.nextTurn()
    await runPromise
  })
})

describe('Anthropic beta headers', () => {
  test('CodeExecution sends CODE_EXECUTION beta', async () => {
    const { client, controller } = createStepMockClient([
      { content: [mockText('done')] },
    ])

    const runPromise = run(
      <Agent provider="anthropic" model={ANTHROPIC_TEST_MODEL} maxTokens={100}>
        <Tools>
          <CodeExecution />
        </Tools>
        <Message role="user">run code</Message>
      </Agent>,
      { providers: { anthropic: { client } } },
    )

    await controller.waitForNextCall()
    const call = controller.peekNextCall()
    const betas = call!.params.betas as string[] | undefined
    expect(betas).toContain(ANTHROPIC_BETAS.CODE_EXECUTION)

    await controller.nextTurn()
    await runPromise
  })

  test('Memory sends CONTEXT_MANAGEMENT beta', async () => {
    const { client, controller } = createStepMockClient([
      { content: [mockText('done')] },
    ])

    const runPromise = run(
      <Agent provider="anthropic" model={ANTHROPIC_TEST_MODEL} maxTokens={100}>
        <Tools>
          <Memory onView={async () => 'contents'} />
        </Tools>
        <Message role="user">remember something</Message>
      </Agent>,
      { providers: { anthropic: { client } } },
    )

    await controller.waitForNextCall()
    const call = controller.peekNextCall()
    const betas = call!.params.betas as string[] | undefined
    expect(betas).toContain(ANTHROPIC_BETAS.CONTEXT_MANAGEMENT)

    await controller.nextTurn()
    await runPromise
  })

  test('MCP sends MCP_CLIENT beta and mcp_servers param', async () => {
    const { client, controller } = createStepMockClient([
      { content: [mockText('done')] },
    ])

    const runPromise = run(
      <Agent provider="anthropic" model={ANTHROPIC_TEST_MODEL} maxTokens={100}>
        <MCP name="filesystem" url="https://mcp.example.com/sse" />
        <Message role="user">use mcp</Message>
      </Agent>,
      { providers: { anthropic: { client } } },
    )

    await controller.waitForNextCall()
    const call = controller.peekNextCall()
    const betas = call!.params.betas as string[] | undefined
    const mcpServers = call!.params.mcp_servers as
      | Array<Record<string, unknown>>
      | undefined
    expect(betas).toContain(ANTHROPIC_BETAS.MCP_CLIENT)
    expect(mcpServers).toBeDefined()
    expect(mcpServers!.some((s) => s['name'] === 'filesystem')).toBe(true)

    await controller.nextTurn()
    await runPromise
  })
})

describe('OpenAI', () => {
  test('MCP maps to mcp tool type', async () => {
    const { client, calls } = createOpenAIMockClient([
      {
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: 'done' }],
          },
        ],
      },
    ])

    await run(
      <Agent provider="openai" model={OPENAI_TEST_MODEL} maxTokens={100}>
        <OpenAIMCP name="filesystem" url="https://mcp.example.com/sse" />
        <Message role="user">use mcp</Message>
      </Agent>,
      { providers: { openai: { client } } },
    )

    const tools = calls[0]!['tools'] as Array<{
      type: string
      server_label?: string
      server_url?: string
    }>
    const mcpTool = tools.find((t) => t.type === 'mcp')
    expect(mcpTool).toBeDefined()
    expect(mcpTool!.server_label).toBe('filesystem')
    expect(mcpTool!.server_url).toBe('https://mcp.example.com/sse')
  })

  test('CodeExecution maps to code_interpreter', async () => {
    const { client, calls } = createOpenAIMockClient([
      {
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: 'done' }],
          },
        ],
      },
    ])

    await run(
      <Agent provider="openai" model={OPENAI_TEST_MODEL} maxTokens={100}>
        <Tools>
          <CodeExecution />
        </Tools>
        <Message role="user">run some code</Message>
      </Agent>,
      { providers: { openai: { client } } },
    )

    const tools = calls[0]!['tools'] as Array<{ type: string }>
    expect(tools.some((t) => t.type === 'code_interpreter')).toBe(true)
  })

  test('WebSearch maps to web_search', async () => {
    const { client, calls } = createOpenAIMockClient([
      {
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: 'done' }],
          },
        ],
      },
    ])

    await run(
      <Agent provider="openai" model={OPENAI_TEST_MODEL} maxTokens={100}>
        <Tools>
          <WebSearch allowedDomains={['example.com']} />
        </Tools>
        <Message role="user">search something</Message>
      </Agent>,
      { providers: { openai: { client } } },
    )

    const tools = calls[0]!['tools'] as Array<{
      type: string
      filters?: { allowed_domains?: string[] }
    }>
    const wsTool = tools.find((t) => t.type === 'web_search')
    expect(wsTool).toBeDefined()
    expect(wsTool?.filters?.allowed_domains).toEqual(['example.com'])
  })
})
