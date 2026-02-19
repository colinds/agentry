import { test, expect } from 'bun:test'
import { z } from 'zod'
import { run, Agent, Message, Tools, AgentTool } from '../src'
import { createOpenAIMockClient } from './utils'
import { TEST_MODEL } from '../src/constants'

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
  const { client: openaiClient } = createOpenAIMockClient([
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
})
