import { describe, expect, test } from 'bun:test'
import { useState } from 'react'
import {
  diffResources,
  hasResourceChanges,
  narrateResourceDelta,
  snapshotResources,
} from '../src/execution/resourceDiff'
import { run, Type, Agent, System, Tools, Tool, Message } from '../src'
import { createStepMockModels, fauxText, fauxToolCall } from './utils'
import { ANTHROPIC_TEST_MODEL } from './constants'
import type { InternalTool } from '../src/types'

function tool(name: string, description = 'a tool', schema = {}): InternalTool {
  return {
    name,
    description,
    parameters: schema as never,
    jsonSchema: { type: 'object', properties: schema },
    handler: () => 'ok',
  }
}

describe('resource diff', () => {
  test('the first snapshot is not a change', () => {
    const delta = diffResources(null, snapshotResources([tool('a')]))
    expect(hasResourceChanges(delta)).toBe(false)
  })

  test('detects additions and removals', () => {
    const before = snapshotResources([tool('a'), tool('b')])
    const after = snapshotResources([tool('b'), tool('c')])
    const delta = diffResources(before, after)

    expect(delta.added.map((t) => t.name)).toEqual(['c'])
    expect(delta.removed.map((t) => t.name)).toEqual(['a'])
    expect(delta.updated).toEqual([])
  })

  test('detects a changed schema on a stable name', () => {
    const before = snapshotResources([tool('a', 'desc', { x: { type: 'string' } })])
    const after = snapshotResources([tool('a', 'desc', { x: { type: 'number' } })])

    expect(diffResources(before, after).updated.map((t) => t.name)).toEqual(['a'])
  })

  test('key ordering alone is not a change', () => {
    const before = snapshotResources([
      { ...tool('a'), jsonSchema: { type: 'object', a: 1, b: 2 } },
    ])
    const after = snapshotResources([
      { ...tool('a'), jsonSchema: { b: 2, type: 'object', a: 1 } },
    ])

    expect(hasResourceChanges(diffResources(before, after))).toBe(false)
  })

  test('narration names what changed', () => {
    const delta = diffResources(
      snapshotResources([tool('old')]),
      snapshotResources([tool('fresh', 'does a thing')]),
    )
    const text = narrateResourceDelta(delta)

    expect(text).toContain('New tools available: fresh (does a thing)')
    expect(text).toContain('No longer available: old')
  })
})

describe('name-keyed collection', () => {
  test('duplicate tool names fail loudly', async () => {
    const { models } = createStepMockModels([])

    await expect(
      run(
        <Agent provider="anthropic" model={ANTHROPIC_TEST_MODEL}>
          <System>Test</System>
          <Tools>
            <Tool
              name="dup"
              description="first"
              parameters={Type.Object({})}
              handler={() => 'a'}
            />
            <Tool
              name="dup"
              description="second"
              parameters={Type.Object({})}
              handler={() => 'b'}
            />
          </Tools>
          <Message role="user">Hi</Message>
        </Agent>,
        { models },
      ),
    ).rejects.toThrow(/Duplicate tool name\(s\): dup/)
  })
})

describe('turn-boundary rendering', () => {
  test('a tool unlocking another is announced on the next turn', async () => {
    const { models, controller } = createStepMockModels([
      { content: [fauxToolCall('unlock', {})] },
      { content: [fauxToolCall('secret', {})] },
      { content: [fauxText('done')] },
    ])

    function App() {
      const [unlocked, setUnlocked] = useState(false)
      return (
        <Agent
          provider="anthropic"
          model={ANTHROPIC_TEST_MODEL}
          maxTokens={100}
          stream={false}
        >
          <System>Test</System>
          <Tools>
            <Tool
              name="unlock"
              description="Unlock the secret tool"
              parameters={Type.Object({})}
              handler={() => {
                setUnlocked(true)
                return 'unlocked'
              }}
            />
            {unlocked ? (
              <Tool
                name="secret"
                description="The secret tool"
                parameters={Type.Object({})}
                handler={() => 'the secret'}
              />
            ) : null}
          </Tools>
          <Message role="user">Unlock then use the secret.</Message>
        </Agent>
      )
    }

    const runPromise = run(<App />, { models })

    // Turn 1: only `unlock` exists.
    await controller.waitForNextCall()
    expect(
      controller.peekNextCall()!.context.tools!.map((t) => t.name),
    ).toEqual(['unlock'])

    await controller.nextTurn()

    // Turn 2: the setState from the handler is visible at the turn boundary,
    // and the new tool is announced in the transcript.
    await controller.waitForNextCall()
    const secondCall = controller.peekNextCall()!
    expect(secondCall.context.tools!.map((t) => t.name).sort()).toEqual([
      'secret',
      'unlock',
    ])

    const narration = secondCall.context.messages.find(
      (m) =>
        m.role === 'user' &&
        typeof m.content === 'string' &&
        m.content.includes('[Available tools changed]'),
    )
    expect(narration).toBeDefined()
    expect(String((narration as { content: string }).content)).toContain(
      'New tools available: secret',
    )

    await controller.nextTurn()
    await controller.waitForNextCall()
    await controller.nextTurn()
    await runPromise
  })

  test('an unchanged tool set produces no narration', async () => {
    const { models, controller } = createStepMockModels([
      { content: [fauxToolCall('noop', {})] },
      { content: [fauxText('done')] },
    ])

    const runPromise = run(
      <Agent
        provider="anthropic"
        model={ANTHROPIC_TEST_MODEL}
        maxTokens={100}
        stream={false}
      >
        <System>Test</System>
        <Tools>
          <Tool
            name="noop"
            description="does nothing"
            parameters={Type.Object({})}
            handler={() => 'ok'}
          />
        </Tools>
        <Message role="user">Go</Message>
      </Agent>,
      { models },
    )

    await controller.nextTurn()
    await controller.waitForNextCall()

    const messages = controller.peekNextCall()!.context.messages
    const narration = messages.filter(
      (m) =>
        m.role === 'user' &&
        typeof m.content === 'string' &&
        m.content.includes('[Available tools changed]'),
    )
    expect(narration).toHaveLength(0)

    await controller.nextTurn()
    await runPromise
  })
})
