import { describe, expect, test } from 'bun:test'
import { describeContextUsage } from '../src/execution/contextUsage'
import { createAgent, Type, Agent, System, Tools, Tool, Message } from '../src'
import { createStepMockModels, fauxText } from './utils'
import { ANTHROPIC_TEST_MODEL } from './constants'
import type { AgentInstance } from '../src/instances/types'
import type { InternalTool } from '../src/types'
import type { JsonValue } from '../src/types/json'
import { userMessage } from '../src/types/messages'

function tool(
  name: string,
  description: string,
  props: Record<string, JsonValue>,
): InternalTool {
  return {
    name,
    description,
    parameters: props as never,
    jsonSchema: { type: 'object', properties: props },
    handler: () => 'ok',
  }
}

function agentWith(tools: InternalTool[], system: string[]): AgentInstance {
  return {
    systemParts: system.map((content) => ({ content })),
    tools: new Map(tools.map((t) => [t.name, t])),
  } as unknown as AgentInstance
}

describe('describeContextUsage', () => {
  test('attributes usage across system, tools and messages', () => {
    const usage = describeContextUsage({
      agent: agentWith(
        [tool('search', 'Search the web', { q: { type: 'string' } })],
        ['You are helpful'],
      ),
      messages: [userMessage('hello there')],
      contextWindow: 200_000,
    })

    const names = usage.sections.map((s) => s.name)
    expect(names).toEqual(['system', 'tools', 'messages'])

    for (const section of usage.sections) {
      expect(section.tokens).toBeGreaterThan(0)
      expect(section.share).toBeGreaterThan(0)
    }

    expect(usage.estimatedUsed).toBe(
      usage.sections.reduce((sum, s) => sum + s.tokens, 0),
    )
    // Shares are relative to the estimate, so they sum to ~1.
    const shareSum = usage.sections.reduce((sum, s) => sum + (s.share ?? 0), 0)
    expect(shareSum).toBeCloseTo(1, 5)
    expect(usage.messageCount).toBe(1)
  })

  test('ranks tools by cost, largest first', () => {
    // Tool definitions ride on every request, so an expensive schema is a
    // fixed tax — this ordering is the point of the whole report.
    const usage = describeContextUsage({
      agent: agentWith(
        [
          tool('tiny', 'x', {}),
          tool('huge', 'y'.repeat(500), {
            a: { type: 'string', description: 'z'.repeat(400) },
          }),
        ],
        [],
      ),
      messages: [],
    })

    expect(usage.tools.map((t) => t.name)).toEqual(['huge', 'tiny'])
    expect(usage.tools[0]!.tokens).toBeGreaterThan(usage.tools[1]!.tokens)
  })

  test('omits window-relative figures when the window is unknown', () => {
    const usage = describeContextUsage({
      agent: agentWith([], ['sys']),
      messages: [],
    })

    expect(usage.contextWindow).toBeUndefined()
    expect(usage.free).toBeUndefined()
    expect(usage.reportedInputTokens).toBeUndefined()
  })
})

describe('handle.describeContext', () => {
  test('is undefined before a run, and populated after', async () => {
    const { models, controller } = createStepMockModels([
      { content: [fauxText('done')] },
    ])

    const handle = createAgent(
      <Agent
        provider="anthropic"
        model={ANTHROPIC_TEST_MODEL}
        maxTokens={100}
        stream={false}
      >
        <System>You are a helpful assistant with tools</System>
        <Tools>
          <Tool
            name="calculate"
            description="Evaluate an arithmetic expression"
            parameters={Type.Object({ expression: Type.String() })}
            handler={() => 'ok'}
          />
        </Tools>
        <Message role="user">Hi</Message>
      </Agent>,
      { models },
    )

    // The tool set is only known after a render.
    expect(handle.describeContext()).toBeUndefined()

    const runPromise = handle.run()
    await controller.nextTurn()
    await runPromise

    const usage = handle.describeContext()!
    expect(usage).toBeDefined()
    expect(usage.tools.map((t) => t.name)).toEqual(['calculate'])
    expect(usage.contextWindow).toBeGreaterThan(0)

    // The provider-reported figure is the trustworthy absolute; the estimate
    // understates it because provider-side scaffolding is invisible here.
    expect(usage.reportedInputTokens).toBeGreaterThan(0)
    expect(usage.free).toBe(usage.contextWindow! - usage.reportedInputTokens!)
    expect(usage.sections.find((s) => s.name === 'system')!.tokens).toBeGreaterThan(0)

    handle.close()
  })
})
