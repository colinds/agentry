import { test, expect, beforeEach, describe } from 'bun:test'
import { run, Agent, Message, Tools } from '../src'
import { CodeExecution, WebSearch, Memory } from '../src/anthropic'
import { createStepMockClient, mockText } from './utils'
import { createOpenAIMockClient } from './utils'
import { TEST_MODEL, OPENAI_TEST_MODEL } from '../src/constants'
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
      <Agent provider="anthropic" model={TEST_MODEL} maxTokens={100}>
        <Tools>
          <CodeExecution />
        </Tools>
        <Message role="user">run some code</Message>
      </Agent>,
      { client },
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
      <Agent provider="anthropic" model={TEST_MODEL} maxTokens={100}>
        <Tools>
          <WebSearch maxUses={5} allowedDomains={['example.com']} />
        </Tools>
        <Message role="user">search something</Message>
      </Agent>,
      { client },
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
      <Agent provider="anthropic" model={TEST_MODEL} maxTokens={100}>
        <Tools>
          <Memory onView={async () => 'contents'} />
        </Tools>
        <Message role="user">remember something</Message>
      </Agent>,
      { client },
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

describe('OpenAI', () => {
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
      { clients: { openai: client } },
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
      { clients: { openai: client } },
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
