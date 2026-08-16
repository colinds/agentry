import { test, expect } from 'bun:test'
import { createAI, Agent, Message, AgentHandle } from '../src'
import { createStepMockModels, fauxText } from './utils'
import { ANTHROPIC_TEST_MODEL, OPENAI_TEST_MODEL } from './constants'

test('createAI default clients are used when no per-call override given', async () => {
  const { models, controller } = createStepMockModels([
    { content: [fauxText('Hello from default client')] },
  ])

  const ai = createAI({ models })

  const runPromise = ai.run(
    <Agent provider="anthropic" model={ANTHROPIC_TEST_MODEL} stream={false}>
      <Message role="user">Hello</Message>
    </Agent>,
  )

  await controller.nextTurn()
  const result = await runPromise
  expect(result.content).toBe('Hello from default client')
})

test('createAI per-call clients override default clients', async () => {
  const { models: defaultClient } = createStepMockModels([
    { content: [fauxText('Should not appear')] },
  ])
  const { models: overrideClient, controller } = createStepMockModels([
    { content: [fauxText('From override client')] },
  ])

  const ai = createAI({ models: defaultClient })

  const runPromise = ai.run(
    <Agent provider="anthropic" model={ANTHROPIC_TEST_MODEL} stream={false}>
      <Message role="user">Hello</Message>
    </Agent>,
    { models: overrideClient },
  )

  await controller.nextTurn()
  const result = await runPromise
  expect(result.content).toBe('From override client')
})

test('createAI per-call mode overrides default mode', async () => {
  // batch override should return AgentResult, not AgentHandle
  const { models: batchClient, controller } = createStepMockModels([
    { content: [fauxText('Batch result')] },
  ])
  const ai2 = createAI({ models: batchClient })
  const runPromise = ai2.run(
    <Agent provider="anthropic" model={ANTHROPIC_TEST_MODEL} stream={false}>
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
  const { models, controller } = createStepMockModels([
    { content: [fauxText('Interactive response')] },
  ])

  const ai = createAI({
    models,
    mode: 'interactive',
  })

  const handlePromise = ai.run(
    <Agent
      provider="anthropic"
      model={ANTHROPIC_TEST_MODEL}
      stream={false}
    ></Agent>,
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
  const { models, controller } = createStepMockModels([
    { content: [fauxText('From createAgent')] },
  ])

  const ai = createAI({ models })

  const agentHandle = ai.createAgent(
    <Agent provider="anthropic" model={ANTHROPIC_TEST_MODEL} stream={false}>
      <Message role="user">Hello</Message>
    </Agent>,
  )

  const runPromise = agentHandle.run()
  await controller.nextTurn()
  const result = await runPromise
  expect(result.content).toBe('From createAgent')
  agentHandle.close()
})

test('createAI default mode=interactive returns handle without explicit mode override', async () => {
  const { models } = createStepMockModels([])

  const ai = createAI({
    models,
    mode: 'interactive',
  })

  // TypeScript types the return as AgentResult (no per-call mode override),
  // but at runtime the merged defaults make it interactive → AgentHandle
  const result = (await ai.run(
    <Agent
      provider="anthropic"
      model={ANTHROPIC_TEST_MODEL}
      stream={false}
    ></Agent>,
  )) as unknown as AgentHandle

  expect(result).toBeInstanceOf(AgentHandle)
  expect(typeof result.sendMessage).toBe('function')
  result.close()
})

test('AgentHandle throws on provider change between sendMessage calls', async () => {
  const { models, controller } = createStepMockModels([
    { content: [fauxText('First response')] },
  ])

  const ai = createAI({
    models,
    mode: 'interactive',
  })

  const handle = (await ai.run(
    <Agent provider="anthropic" model={ANTHROPIC_TEST_MODEL} stream={false} />,
    { mode: 'interactive' },
  )) as AgentHandle

  // First sendMessage — sets initialProps
  const firstPromise = handle.sendMessage('Hello')
  await controller.nextTurn()
  await firstPromise

  // Mutate to a different provider
  handle.update(
    <Agent provider="openai" model={ANTHROPIC_TEST_MODEL} stream={false} />,
  )

  // Second sendMessage — should throw at the call site
  expect(handle.sendMessage('Hi again')).rejects.toThrow(
    /Agent provider cannot change between runs/,
  )

  handle.close()
})

test('AgentHandle throws on model change between sendMessage calls', async () => {
  const { models, controller } = createStepMockModels([
    { content: [fauxText('First response')] },
  ])

  const ai = createAI({
    models,
    mode: 'interactive',
  })

  const handle = (await ai.run(
    <Agent provider="anthropic" model={ANTHROPIC_TEST_MODEL} stream={false} />,
    { mode: 'interactive' },
  )) as AgentHandle

  // First sendMessage — sets initialProps
  const firstPromise = handle.sendMessage('Hello')
  await controller.nextTurn()
  await firstPromise

  // Mutate to a different model
  handle.update(
    <Agent provider="anthropic" model="claude-opus-4-5" stream={false} />,
  )

  // Second sendMessage — should throw at the call site
  expect(handle.sendMessage('Hi again')).rejects.toThrow(
    /Agent model cannot change between runs/,
  )

  handle.close()
})

test('createAI per-call models override the default collection', async () => {
  const { models: defaultModels } = createStepMockModels([])
  const { models: openaiModels, controller } = createStepMockModels(
    [{ content: [fauxText('OpenAI response')] }],
    { provider: 'openai', modelIds: [OPENAI_TEST_MODEL] },
  )

  const ai = createAI({ models: defaultModels })

  const runPromise = ai.run(
    <Agent provider="openai" model={OPENAI_TEST_MODEL} stream={false}>
      <Message role="user">Hello</Message>
    </Agent>,
    { models: openaiModels },
  )

  await controller.nextTurn()
  const result = await runPromise

  expect(result.content).toBe('OpenAI response')
})
