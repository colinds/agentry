import { test, expect } from 'bun:test'
import { run, type AgentResult } from '../src'
import { Agent, System, Tools, Tool, Message } from '../src'
import { createStepMockClient, mockText, mockToolUse } from '../src/test-utils'
import { z } from 'zod'
import { TEST_MODEL } from '../src/constants'

test('runAgent executes subagent and returns result', async () => {
  const { client, controller } = createStepMockClient([
    {
      content: [mockToolUse('spawn_researcher', { topic: 'AI' })],
      stop_reason: 'tool_use',
    },
    {
      content: [mockText('AI research findings')],
      stop_reason: 'end_turn',
    },
    {
      content: [mockText('Research completed successfully')],
      stop_reason: 'end_turn',
    },
  ])

  const runPromise = run(
    <Agent model={TEST_MODEL}>
      <System>Test agent with spawn capability</System>
      <Tools>
        <Tool
          name="spawn_researcher"
          description="Spawn a research agent"
          parameters={z.object({ topic: z.string() })}
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
    { client },
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
  const { client, controller } = createStepMockClient([
    {
      content: [mockToolUse('parallel_analyze', { content: 'test' })],
      stop_reason: 'tool_use',
    },
    {
      content: [mockText('Technical analysis complete')],
      stop_reason: 'end_turn',
    },
    {
      content: [mockText('Business analysis complete')],
      stop_reason: 'end_turn',
    },
    {
      content: [mockText('All analyses complete')],
      stop_reason: 'end_turn',
    },
  ])

  const runPromise = run(
    <Agent model={TEST_MODEL}>
      <System>Parallel analysis coordinator</System>
      <Tools>
        <Tool
          name="parallel_analyze"
          description="Analyze content in parallel"
          parameters={z.object({ content: z.string() })}
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
    { client },
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
  let capturedModel: string | undefined

  const { client, controller } = createStepMockClient([
    {
      content: [mockToolUse('spawn_tool', {})],
      stop_reason: 'tool_use',
    },
    {
      content: [mockText('Response')],
      stop_reason: 'end_turn',
    },
    {
      content: [mockText('Done')],
      stop_reason: 'end_turn',
    },
  ])

  // Spy on the client to capture the model used (check both create and stream)
  // We'll capture the model from the second call (spawned agent)
  let callCount = 0
  const originalCreate = client.beta.messages.create.bind(client.beta.messages)
  const originalStream = client.beta.messages.stream.bind(client.beta.messages)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client.beta.messages.create = (async (params: any, options?: any) => {
    callCount++
    // Second call should be the spawned agent
    if (callCount === 2 && !capturedModel) {
      capturedModel = params.model
    }
    return originalCreate(params, options)
  }) as typeof client.beta.messages.create

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client.beta.messages.stream = ((params: any, options?: any) => {
    callCount++
    // Second call should be the spawned agent
    if (callCount === 2 && !capturedModel) {
      capturedModel = params.model
    }
    return originalStream(params, options)
  }) as typeof client.beta.messages.stream

  const runPromise = run(
    <Agent model={TEST_MODEL}>
      <System>Test</System>
      <Tools>
        <Tool
          name="spawn_tool"
          description="Test"
          parameters={z.object({})}
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
    { client },
  )

  await controller.nextTurn()
  await controller.waitForNextCall()
  await controller.nextTurn()
  await controller.waitForNextCall()
  await controller.nextTurn()

  await runPromise
  expect(capturedModel).toBe('claude-opus-4')
})

test('runAgent respects custom maxTokens option', async () => {
  let capturedMaxTokens: number | undefined

  const { client, controller } = createStepMockClient([
    {
      content: [mockToolUse('spawn_tool', {})],
      stop_reason: 'tool_use',
    },
    {
      content: [mockText('Response')],
      stop_reason: 'end_turn',
    },
    {
      content: [mockText('Done')],
      stop_reason: 'end_turn',
    },
  ])

  // We'll capture maxTokens from the spawned agent call
  // The spawned agent uses create() (streaming disabled), parent might use stream()
  // So we capture the first create() call that has system === 'Test' and max_tokens !== 4096
  const originalCreate = client.beta.messages.create.bind(client.beta.messages)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client.beta.messages.create = (async (params: any, options?: any) => {
    // Capture if it's the spawned agent (has Test system and not the parent's maxTokens)
    if (
      !capturedMaxTokens &&
      params.system === 'Test' &&
      params.max_tokens !== 4096
    ) {
      capturedMaxTokens = params.max_tokens
    }
    return originalCreate(params, options)
  }) as typeof client.beta.messages.create

  const runPromise = run(
    <Agent model={TEST_MODEL} maxTokens={4096}>
      <System>Test</System>
      <Tools>
        <Tool
          name="spawn_tool"
          description="Test"
          parameters={z.object({})}
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
    { client },
  )

  await controller.nextTurn()
  await controller.waitForNextCall()
  await controller.nextTurn()
  await controller.waitForNextCall()
  await controller.nextTurn()

  await runPromise
  expect(capturedMaxTokens).toBe(1024)
})

test('runAgent handles errors gracefully', async () => {
  const { client, controller } = createStepMockClient([
    {
      content: [mockToolUse('spawn_tool', {})],
      stop_reason: 'tool_use',
    },
    {
      content: [mockText('Error caught: Subagent execution failed')],
      stop_reason: 'end_turn',
    },
  ])

  // Override create to make the spawned agent fail
  // The spawned agent uses create() (streaming disabled), identify it by system prompt
  const originalCreate = client.beta.messages.create.bind(client.beta.messages)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client.beta.messages.create = (async (params: any, options?: any) => {
    // The spawned agent has system === 'Test' and uses create() (not stream)
    if (params.system === 'Test') {
      // Reject immediately - this will be caught by the handler
      throw new Error('Subagent execution failed')
    }
    return originalCreate(params, options)
  }) as typeof client.beta.messages.create

  const runPromise = run(
    <Agent model={TEST_MODEL}>
      <System>Test error handling</System>
      <Tools>
        <Tool
          name="spawn_tool"
          description="Test"
          parameters={z.object({})}
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
    { client },
  )

  await controller.nextTurn() // Parent tool use
  // The spawned agent call will fail immediately (thrown error)
  // The error will be caught in the handler and the tool will return the error message
  // The handler completes synchronously, so the parent can continue immediately
  // Wait for parent's next call after tool execution (with error message)
  await controller.waitForNextCall()
  await controller.nextTurn() // Parent completion

  const result = await runPromise
  expect(result.content).toContain('Error caught: Subagent execution failed')
})

test('runAgent returns full AgentResult', async () => {
  let capturedResult: AgentResult | null = null

  const { client, controller } = createStepMockClient([
    {
      content: [mockToolUse('spawn_tool', {})],
      stop_reason: 'tool_use',
    },
    {
      content: [mockText('Subagent response')],
      stop_reason: 'end_turn',
    },
    {
      content: [mockText('Done')],
      stop_reason: 'end_turn',
    },
  ])

  const runPromise = run(
    <Agent model={TEST_MODEL}>
      <System>Test</System>
      <Tools>
        <Tool
          name="spawn_tool"
          description="Test"
          parameters={z.object({})}
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
    { client },
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
  expect(result.stopReason).toBe('end_turn')
})

test('runAgent with conditional agent selection', async () => {
  const { client, controller } = createStepMockClient([
    {
      content: [mockToolUse('conditional_spawn', { complexity: 'high' })],
      stop_reason: 'tool_use',
    },
    {
      content: [mockText('Expert analysis')],
      stop_reason: 'end_turn',
    },
    {
      content: [mockText('Analysis complete')],
      stop_reason: 'end_turn',
    },
  ])

  const runPromise = run(
    <Agent model={TEST_MODEL}>
      <System>Conditional spawner</System>
      <Tools>
        <Tool
          name="conditional_spawn"
          description="Spawn agent based on complexity"
          parameters={z.object({
            complexity: z.enum(['high', 'low']),
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
    { client },
  )

  await controller.nextTurn()
  await controller.waitForNextCall()
  await controller.nextTurn()
  await controller.waitForNextCall()
  await controller.nextTurn()

  const result = await runPromise
  expect(result.content).toBe('Analysis complete')
})
