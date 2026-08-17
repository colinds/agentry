import { test, expect } from 'bun:test'
import { run, type AgentResult } from '../src'
import { Agent, System, Tools, Tool, Message } from '../src'
import {
  createStepMockModels,
  createMultiProviderMockModels,
  fauxText,
  fauxToolCall,
  
} from './utils'
import { Type } from 'typebox'
import { ANTHROPIC_TEST_MODEL, OPENAI_TEST_MODEL } from './constants'

test('runAgent executes subagent and returns result', async () => {
  const { models, controller } = createStepMockModels([
    {
      content: [fauxToolCall('spawn_researcher', { topic: 'AI' })],
    },
    {
      content: [fauxText('AI research findings')],
    },
    {
      content: [fauxText('Research completed successfully')],
    },
  ])

  const runPromise = run(
    <Agent provider="anthropic" model={ANTHROPIC_TEST_MODEL}>
      <System>Test agent with spawn capability</System>
      <Tools>
        <Tool
          name="spawn_researcher"
          description="Spawn a research agent"
          parameters={Type.Object({ topic: Type.String() })}
          handler={async (input, context) => {
            const spawnedResult = await context.runAgent(
              <Agent name="researcher">
                <System>You are a research expert.</System>
                <Message role="user">Research topic: {input.topic}</Message>
              </Agent>,
            )
            return `Research result: ${spawnedResult.content}`
          }}
        />
      </Tools>
      <Message role="user">Research AI technologies</Message>
    </Agent>,
    { models },
  )

  await controller.nextTurn() // Parent tool use
  await controller.waitForNextCall()
  await controller.nextTurn() // Subagent execution
  await controller.waitForNextCall()
  await controller.nextTurn() // Parent completion

  const result = await runPromise
  expect(result.content).toBe('Research completed successfully')
})

test('runAgent supports parallel spawning', async () => {
  const { models, controller } = createStepMockModels([
    {
      content: [fauxToolCall('parallel_analyze', { content: 'test' })],
    },
    {
      content: [fauxText('Technical analysis complete')],
    },
    {
      content: [fauxText('Business analysis complete')],
    },
    {
      content: [fauxText('All analyses complete')],
    },
  ])

  const runPromise = run(
    <Agent provider="anthropic" model={ANTHROPIC_TEST_MODEL}>
      <System>Parallel analysis coordinator</System>
      <Tools>
        <Tool
          name="parallel_analyze"
          description="Analyze content in parallel"
          parameters={Type.Object({ content: Type.String() })}
          handler={async (input, context) => {
            const [techResult, bizResult] = await Promise.all([
              context.runAgent(
                <Agent name="tech">
                  <System>Technical analyst</System>
                  <Message role="user">Analyze: {input.content}</Message>
                </Agent>,
              ),
              context.runAgent(
                <Agent name="biz">
                  <System>Business analyst</System>
                  <Message role="user">Analyze: {input.content}</Message>
                </Agent>,
              ),
            ])

            return `Tech: ${techResult.content}, Biz: ${bizResult.content}`
          }}
        />
      </Tools>
      <Message role="user">Analyze this content</Message>
    </Agent>,
    { models },
  )

  await controller.nextTurn() // Parent tool use
  await controller.waitForNextCall()
  await controller.nextTurn() // Tech subagent
  await controller.waitForNextCall()
  await controller.nextTurn() // Biz subagent
  await controller.waitForNextCall()
  await controller.nextTurn() // Parent completion

  const result = await runPromise
  expect(result.content).toBe('All analyses complete')
})

test('runAgent respects custom model option', async () => {
  const { models, controller } = createStepMockModels([
    {
      content: [fauxToolCall('spawn_tool', {})],
    },
    {
      content: [fauxText('Response')],
    },
    {
      content: [fauxText('Done')],
    },
  ])

  const runPromise = run(
    <Agent provider="anthropic" model={ANTHROPIC_TEST_MODEL}>
      <System>Test</System>
      <Tools>
        <Tool
          name="spawn_tool"
          description="Test"
          parameters={Type.Object({})}
          handler={async (input, context) => {
            await context.runAgent(
              <Agent name="spawned">
                <System>Test</System>
                <Message role="user">Test</Message>
              </Agent>,
              {
                model: 'claude-opus-4',
              },
            )
            return 'ok'
          }}
        />
      </Tools>
      <Message role="user">Test</Message>
    </Agent>,
    { models },
  )

  await controller.nextTurn()
  await controller.waitForNextCall()
  await controller.nextTurn()
  await controller.waitForNextCall()
  await controller.nextTurn()

  await runPromise

  // The mock records the resolved model for every call; the spawned agent is
  // the second one.
  const history = controller.getCallHistory()
  expect(history[1]?.model.id).toBe('claude-opus-4')
})

test('runAgent respects custom maxTokens option', async () => {
  const { models, controller } = createStepMockModels([
    {
      content: [fauxToolCall('spawn_tool', {})],
    },
    {
      content: [fauxText('Response')],
    },
    {
      content: [fauxText('Done')],
    },
  ])


  const runPromise = run(
    <Agent provider="anthropic" model={ANTHROPIC_TEST_MODEL} maxTokens={4096}>
      <System>Test</System>
      <Tools>
        <Tool
          name="spawn_tool"
          description="Test"
          parameters={Type.Object({})}
          handler={async (input, context) => {
            await context.runAgent(
              <Agent name="spawned">
                <System>Test</System>
                <Message role="user">Test</Message>
              </Agent>,
              {
                maxTokens: 1024,
              },
            )
            return 'ok'
          }}
        />
      </Tools>
      <Message role="user">Test</Message>
    </Agent>,
    { models },
  )

  await controller.nextTurn()
  await controller.waitForNextCall()
  await controller.nextTurn()
  await controller.waitForNextCall()
  await controller.nextTurn()

  await runPromise

  const spawned = controller
    .getCallHistory()
    .find((call) => call.options?.maxTokens === 1024)
  expect(spawned).toBeDefined()
})

test('runAgent handles errors gracefully', async () => {
  // The middle turn is the spawned agent's, scripted to fail. pi reports
  // failures as `stopReason: 'error'`, which the seam turns back into a throw
  // so the tool handler's try/catch sees it.
  const { models, controller } = createStepMockModels([
    {
      content: [fauxToolCall('spawn_tool', {})],
    },
    {
      content: '',
      stopReason: 'error',
      errorMessage: 'Subagent execution failed',
    },
    {
      content: [fauxText('Error caught: Subagent execution failed')],
    },
  ])

  const runPromise = run(
    <Agent provider="anthropic" model={ANTHROPIC_TEST_MODEL}>
      <System>Test error handling</System>
      <Tools>
        <Tool
          name="spawn_tool"
          description="Test"
          parameters={Type.Object({})}
          handler={async (input, context) => {
            try {
              await context.runAgent(
                <Agent name="failing">
                  <System>Test</System>
                  <Message role="user">Test</Message>
                </Agent>,
              )
              return 'Should not reach here'
            } catch (error) {
              return `Error caught: ${(error as Error).message}`
            }
          }}
        />
      </Tools>
      <Message role="user">Test error handling</Message>
    </Agent>,
    { models },
  )

  await controller.nextTurn() // Parent tool use
  await controller.nextTurn() // Spawned agent, fails
  await controller.waitForNextCall()
  await controller.nextTurn() // Parent completion

  const result = await runPromise
  expect(result.content).toContain('Error caught: Subagent execution failed')
})

test('runAgent returns full AgentResult', async () => {
  let capturedResult: AgentResult | null = null

  const { models, controller } = createStepMockModels([
    {
      content: [fauxToolCall('spawn_tool', {})],
    },
    {
      content: [fauxText('Subagent response')],
    },
    {
      content: [fauxText('Done')],
    },
  ])

  const runPromise = run(
    <Agent provider="anthropic" model={ANTHROPIC_TEST_MODEL}>
      <System>Test</System>
      <Tools>
        <Tool
          name="spawn_tool"
          description="Test"
          parameters={Type.Object({})}
          handler={async (input, context) => {
            const result = await context.runAgent(
              <Agent name="spawned">
                <System>Test</System>
                <Message role="user">Test</Message>
              </Agent>,
            )
            capturedResult = result
            return 'ok'
          }}
        />
      </Tools>
      <Message role="user">Test</Message>
    </Agent>,
    { models },
  )

  await controller.nextTurn()
  await controller.waitForNextCall()
  await controller.nextTurn()
  await controller.waitForNextCall()
  await controller.nextTurn()

  await runPromise

  expect(capturedResult).not.toBeNull()
  const result = capturedResult!
  expect(result.content).toBe('Subagent response')
  expect(result.messages).toBeDefined()
  expect(result.usage).toBeDefined()
  expect(result.stopReason).toBe('stop')
})

test('runAgent with conditional agent selection', async () => {
  const { models, controller } = createStepMockModels([
    {
      content: [fauxToolCall('conditional_spawn', { complexity: 'high' })],
    },
    {
      content: [fauxText('Expert analysis')],
    },
    {
      content: [fauxText('Analysis complete')],
    },
  ])

  const runPromise = run(
    <Agent provider="anthropic" model={ANTHROPIC_TEST_MODEL}>
      <System>Conditional spawner</System>
      <Tools>
        <Tool
          name="conditional_spawn"
          description="Spawn agent based on complexity"
          parameters={Type.Object({
            complexity: Type.Union([Type.Literal('high'), Type.Literal('low')]),
          })}
          handler={async (input, context) => {
            const agentResult = await context.runAgent(
              input.complexity === 'high' ? (
                <Agent name="expert">
                  <System>Expert analyst</System>
                  <Message role="user">Deep analysis required</Message>
                </Agent>
              ) : (
                <Agent name="general">
                  <System>General analyst</System>
                  <Message role="user">Basic analysis</Message>
                </Agent>
              ),
            )

            return `Result: ${agentResult.content}`
          }}
        />
      </Tools>
      <Message role="user">Analyze with high complexity</Message>
    </Agent>,
    { models },
  )

  await controller.nextTurn()
  await controller.waitForNextCall()
  await controller.nextTurn()
  await controller.waitForNextCall()
  await controller.nextTurn()

  const result = await runPromise
  expect(result.content).toBe('Analysis complete')
})

test('context.runAgent can target a different provider', async () => {
  // One collection carrying two scripted providers: the parent runs on
  // anthropic, the spawned subagent on openai.
  const { models, controllers } = createMultiProviderMockModels(
    {
      anthropic: [
        { content: [fauxToolCall('cross_provider_task', { query: 'test' })] },
        { content: [fauxText('Combined result')] },
      ],
      openai: [{ content: [fauxText('OpenAI sub-result')] }],
    },
    { anthropic: ANTHROPIC_TEST_MODEL, openai: OPENAI_TEST_MODEL },
  )

  const anthropic = controllers.anthropic!
  const openai = controllers.openai!

  let capturedSubResult = ''

  const runPromise = run(
    <Agent provider="anthropic" model={ANTHROPIC_TEST_MODEL} stream={false}>
      <Tools>
        <Tool
          name="cross_provider_task"
          description="Run a task using OpenAI"
          parameters={Type.Object({ query: Type.String() })}
          handler={async (input, context) => {
            const subResult = await context.runAgent(
              <Agent provider="openai" model={OPENAI_TEST_MODEL} stream={false}>
                <Message role="user">Process: {input.query}</Message>
              </Agent>,
              { provider: 'openai', model: OPENAI_TEST_MODEL },
            )
            capturedSubResult = subResult.content ?? ''
            return `OpenAI processed: ${subResult.content}`
          }}
        />
      </Tools>
      <Message role="user">Run cross-provider task</Message>
    </Agent>,
    { models },
  )

  await anthropic.nextTurn()
  await openai.nextTurn()
  await anthropic.waitForNextCall()
  await anthropic.nextTurn()

  const result = await runPromise
  expect(result.content).toBe('Combined result')
  expect(capturedSubResult).toBe('OpenAI sub-result')

  // the subagent really did go through the openai provider
  expect(openai.getCallHistory()[0]?.model.provider).toBe('openai')
})
