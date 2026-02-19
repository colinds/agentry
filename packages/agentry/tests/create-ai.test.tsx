import { test, expect } from 'bun:test'
import { createAI, Agent, Message } from '../src'
import { createStepMockClient, mockText, createOpenAIMockClient } from './utils'
import { TEST_MODEL, OPENAI_TEST_MODEL } from '../src/constants'

test('createAI default clients are used when no per-call override given', async () => {
  const { client, controller } = createStepMockClient([
    { content: [mockText('Hello from default client')] },
  ])

  const ai = createAI({ clients: { anthropic: client } })

  const runPromise = ai.run(
    <Agent provider="anthropic" model={TEST_MODEL} stream={false}>
      <Message role="user">Hello</Message>
    </Agent>,
  )

  await controller.nextTurn()
  const result = await runPromise
  expect(result.content).toBe('Hello from default client')
})

test('createAI per-call clients override default clients', async () => {
  const { client: defaultClient } = createStepMockClient([
    { content: [mockText('Should not appear')] },
  ])
  const { client: overrideClient, controller } = createStepMockClient([
    { content: [mockText('From override client')] },
  ])

  const ai = createAI({ clients: { anthropic: defaultClient } })

  const runPromise = ai.run(
    <Agent provider="anthropic" model={TEST_MODEL} stream={false}>
      <Message role="user">Hello</Message>
    </Agent>,
    { clients: { anthropic: overrideClient } },
  )

  await controller.nextTurn()
  const result = await runPromise
  expect(result.content).toBe('From override client')
})

test('createAI per-call mode overrides default mode', async () => {
  const { client } = createStepMockClient([])

  const ai = createAI({ clients: { anthropic: client }, mode: 'interactive' })

  // batch override should return AgentResult, not AgentHandle
  const { client: batchClient, controller } = createStepMockClient([
    { content: [mockText('Batch result')] },
  ])
  const ai2 = createAI({ clients: { anthropic: batchClient } })
  const runPromise = ai2.run(
    <Agent provider="anthropic" model={TEST_MODEL} stream={false}>
      <Message role="user">Run in batch</Message>
    </Agent>,
    { mode: 'batch' },
  )
  await controller.nextTurn()
  const result = await runPromise
  expect(result.content).toBe('Batch result')
  expect(typeof result.content).toBe('string')
})

test('createAI interactive mode returns a handle', async () => {
  const { client, controller } = createStepMockClient([
    { content: [mockText('Interactive response')] },
  ])

  const ai = createAI({
    clients: { anthropic: client },
    mode: 'interactive',
  })

  const handlePromise = ai.run(
    <Agent provider="anthropic" model={TEST_MODEL} stream={false}></Agent>,
    { mode: 'interactive' },
  )

  const handle = await handlePromise
  expect(handle).toBeDefined()
  expect(typeof handle.sendMessage).toBe('function')

  const sendPromise = handle.sendMessage('Hello')
  await controller.nextTurn()
  const result = await sendPromise
  expect(result.content).toBe('Interactive response')

  handle.close()
})

test('createAI createAgent uses merged clients', async () => {
  const { client, controller } = createStepMockClient([
    { content: [mockText('From createAgent')] },
  ])

  const ai = createAI({ clients: { anthropic: client } })

  const agentHandle = ai.createAgent(
    <Agent provider="anthropic" model={TEST_MODEL} stream={false}>
      <Message role="user">Hello</Message>
    </Agent>,
  )

  const runPromise = agentHandle.run()
  await controller.nextTurn()
  const result = await runPromise
  expect(result.content).toBe('From createAgent')
  agentHandle.close()
})

test('createAI multi-provider: per-call client overrides default for that provider', async () => {
  const { client: anthropicDefault } = createStepMockClient([])
  const { client: openaiClient } = createOpenAIMockClient([
    {
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: 'OpenAI response' }],
        },
      ],
    },
  ])

  const ai = createAI({ clients: { anthropic: anthropicDefault } })

  const result = await ai.run(
    <Agent provider="openai" model={OPENAI_TEST_MODEL} stream={false}>
      <Message role="user">Hello</Message>
    </Agent>,
    { clients: { openai: openaiClient } },
  )

  expect(result.content).toBe('OpenAI response')
})
