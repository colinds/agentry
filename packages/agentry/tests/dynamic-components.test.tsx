import { test, expect } from 'bun:test'
import { useState } from 'react'
import { Type } from 'typebox'
import { run } from '../src'
import { defineTool } from '../src/tools'
import {
  Agent,
  System,
  Context,
  Condition,
  Tools,
  Tool,
  AgentTool,
  Message,
} from '../src'
import { createStepMockModels, fauxText, fauxToolCall } from './utils'
import { ANTHROPIC_TEST_MODEL } from './constants'

test('state changes trigger reconciler updates', async () => {
  let updateCount = 0

  function StateUpdateAgent() {
    const [count, setCount] = useState(0)

    const incrementTool = defineTool({
      name: 'increment',
      description: 'Increment counter',
      parameters: Type.Object({}),
      handler: async () => {
        setCount((prev) => prev + 1)
        updateCount++
        return `Count: ${count + 1}`
      },
    })

    return (
      <Agent provider="anthropic" model={ANTHROPIC_TEST_MODEL} stream={false}>
        <System>Counter is at {count}</System>
        <Tools>
          <Tool {...incrementTool} />
        </Tools>
        <Message role="user">Increment twice</Message>
      </Agent>
    )
  }

  const { models, controller } = createStepMockModels([
    { content: [fauxToolCall('increment', {})] },
    { content: [fauxToolCall('increment', {})] },
    { content: [fauxText('Done incrementing')] },
  ])

  const runPromise = run(<StateUpdateAgent />, {
    models,
  })

  await controller.nextTurn()
  await controller.waitForNextCall()
  await controller.nextTurn()
  await controller.waitForNextCall()
  await controller.nextTurn()

  const result = await runPromise

  expect(updateCount).toBe(2)
  expect(result.content).toBe('Done incrementing')
})

test('dynamic <System>/<Context> text reaches the model', async () => {
  // `children` is a reserved prop, so diffProps never reports it — these
  // elements were frozen at their first render until commitUpdate special-cased
  // them.
  const { models, controller } = createStepMockModels([
    { content: [fauxToolCall('flip', {})] },
    { content: [fauxText('done')] },
  ])
  function App() {
    const [mode, setMode] = useState('ALPHA')
    return (
      <Agent provider="anthropic" model={ANTHROPIC_TEST_MODEL} maxTokens={100} stream={false}>
        <System>Current mode is {mode}.</System>
        <Context>ctx {mode}</Context>
        <Tools>
          <Tool name="flip" description="flip" parameters={Type.Object({})}
            handler={() => { setMode('BETA'); return 'ok' }} />
        </Tools>
        <Message role="user">go</Message>
      </Agent>
    )
  }
  const p = run(<App />, { models })
  await controller.waitForNextCall()
  expect(controller.peekNextCall()!.context.systemPrompt).toContain('ALPHA')
  await controller.nextTurn()
  await controller.waitForNextCall()
  const second = controller.peekNextCall()!.context.systemPrompt!
  expect(second).toContain('BETA')
  expect(second).toContain('ctx BETA')
  expect(second).not.toContain('ALPHA')
  await controller.nextTurn()
  await p
})

test('an updating <System> does not erase nested system parts', async () => {
  // rebuildSystemPrompt used to walk only top-level children while collectChild
  // recursed, so any update erased nested parts.
  const { models, controller } = createStepMockModels([
    { content: [fauxToolCall('bump', {})] },
    { content: [fauxText('done')] },
  ])
  function App() {
    const [n, setN] = useState(0)
    return (
      <Agent provider="anthropic" model={ANTHROPIC_TEST_MODEL} maxTokens={100} stream={false}>
        <System>base {n}</System>
        <Condition when={true}>
          <System>CONDITIONAL-BLOCK</System>
        </Condition>
        <Tools>
          <Tool name="bump" description="bump" parameters={Type.Object({})}
            handler={() => { setN(1); return 'ok' }} />
        </Tools>
        <Message role="user">go</Message>
      </Agent>
    )
  }
  const p = run(<App />, { models })
  await controller.waitForNextCall()
  const first = controller.peekNextCall()!.context.systemPrompt!
  expect(first).toContain('base 0')
  expect(first).toContain('CONDITIONAL-BLOCK')
  await controller.nextTurn()
  await controller.waitForNextCall()
  const second = controller.peekNextCall()!.context.systemPrompt!
  console.error('TURN2 SYSTEM:', JSON.stringify(second))
  expect(second).toContain('base 1')
  expect(second).toContain('CONDITIONAL-BLOCK')
  await controller.nextTurn()
  await p
})

test('a Tool directly inside an ACTIVE condition is collected mid-run', async () => {
  const { models, controller } = createStepMockModels([
    { content: [fauxToolCall('bump', {})] },
    { content: [fauxText('done')] },
  ])
  function App() {
    const [n, setN] = useState(0)
    return (
      <Agent provider="anthropic" model={ANTHROPIC_TEST_MODEL} maxTokens={100} stream={false}>
        <System>t</System>
        <Tools>
          <Tool name="bump" description="b" parameters={Type.Object({})}
            handler={() => { setN(1); return 'ok' }} />
        </Tools>
        <Condition when={true}>
          {n >= 1 ? <Tool name="extra" description="e" parameters={Type.Object({})} handler={() => 'x'} /> : null}
        </Condition>
        <Message role="user">go</Message>
      </Agent>
    )
  }
  const p = run(<App />, { models })
  await controller.waitForNextCall()
  await controller.nextTurn()
  await controller.waitForNextCall()
  const names = controller.peekNextCall()!.context.tools!.map((t) => t.name)
  expect(names).toContain('extra')
  await controller.nextTurn(); await p
})

test('a Tool appearing in <Tools> under an INACTIVE condition is not offered', async () => {
  const { models, controller } = createStepMockModels([
    { content: [fauxToolCall('bump', {})] },
    { content: [fauxText('done')] },
  ])
  function App() {
    const [n, setN] = useState(0)
    return (
      <Agent provider="anthropic" model={ANTHROPIC_TEST_MODEL} maxTokens={100} stream={false}>
        <System>t</System>
        <Tools>
          <Tool name="bump" description="b" parameters={Type.Object({})}
            handler={() => { setN(1); return 'ok' }} />
        </Tools>
        <Condition when={false}>
          <Tools>
            {n >= 1 ? <Tool name="secret" description="s" parameters={Type.Object({})} handler={() => 'x'} /> : null}
          </Tools>
        </Condition>
        <Message role="user">go</Message>
      </Agent>
    )
  }
  const p = run(<App />, { models })
  await controller.waitForNextCall()
  await controller.nextTurn()
  await controller.waitForNextCall()
  const names = controller.peekNextCall()!.context.tools!.map((t) => t.name)
  expect(names).not.toContain('secret')
  await controller.nextTurn(); await p
})

test('<AgentTool> description updates reach the model', async () => {
  const { models, controller } = createStepMockModels([
    { content: [fauxToolCall('bump', {})] },
    { content: [fauxText('done')] },
  ])
  function App() {
    const [n, setN] = useState(0)
    return (
      <Agent provider="anthropic" model={ANTHROPIC_TEST_MODEL} maxTokens={100} stream={false}>
        <System>t</System>
        <Tools>
          <Tool name="bump" description="b" parameters={Type.Object({})}
            handler={() => { setN(1); return 'ok' }} />
          <AgentTool name="helper" description={`helper v${n}`}
            parameters={Type.Object({})}
            agent={() => (
              <Agent name="helper"><System>N IS {n}</System></Agent>
            )} />
        </Tools>
        <Message role="user">go</Message>
      </Agent>
    )
  }
  const p = run(<App />, { models })
  await controller.waitForNextCall()
  expect(
    controller.peekNextCall()!.context.tools!.find((t) => t.name === 'helper')!.description,
  ).toBe('helper v0')
  await controller.nextTurn()
  await controller.waitForNextCall()
  const desc = controller.peekNextCall()!.context.tools!.find((t) => t.name === 'helper')!.description
  expect(desc).toBe('helper v1')
  await controller.nextTurn(); await p
})

test('a conditional <Message> is not re-pushed when conditions change', async () => {
  const { models, controller } = createStepMockModels([
    { content: [fauxToolCall('flip', {})] },
    { content: [fauxToolCall('flip', {})] },
    { content: [fauxText('done')] },
  ])
  function App() {
    const [n, setN] = useState(0)
    return (
      <Agent provider="anthropic" model={ANTHROPIC_TEST_MODEL} maxTokens={100} stream={false}>
        <System>t</System>
        <Tools>
          <Tool name="flip" description="f" parameters={Type.Object({})}
            handler={() => { setN((v) => v + 1); return 'ok' }} />
        </Tools>
        {/* always active: it must be collected exactly once, ever */}
        <Condition when={true}>
          <Message role="user">CONDITIONAL MESSAGE</Message>
        </Condition>
        {/* this one flips, which is what triggers recollectAll */}
        <Condition when={n % 2 === 1}>
          <System>ODD</System>
        </Condition>
        <Message role="user">go</Message>
      </Agent>
    )
  }
  const p = run(<App />, { models })
  await controller.nextTurn()
  await controller.nextTurn()
  await controller.waitForNextCall()
  const msgs = controller.peekNextCall()!.context.messages
  const count = msgs.filter((m) =>
    JSON.stringify(m).includes('CONDITIONAL MESSAGE'),
  ).length
  expect(count).toBe(1)
  await controller.nextTurn(); await p
})

test('relocating a tool mid-run does not trip a false duplicate', async () => {
  const { models, controller } = createStepMockModels([
    { content: [fauxToolCall('bump', {})] },
    { content: [fauxText('done')] },
  ])
  function App() {
    const [moved, setMoved] = useState(false)
    const extra = (
      <Tool name="extra" description="e" parameters={Type.Object({})} handler={() => 'x'} />
    )
    return (
      <Agent provider="anthropic" model={ANTHROPIC_TEST_MODEL} maxTokens={100} stream={false}>
        <System>t</System>
        {moved ? extra : null}
        <Tools>
          <Tool name="bump" description="b" parameters={Type.Object({})}
            handler={() => { setMoved(true); return 'ok' }} />
          {moved ? null : extra}
        </Tools>
        <Message role="user">go</Message>
      </Agent>
    )
  }
  const p = run(<App />, { models })
  await controller.waitForNextCall()
  await controller.nextTurn()
  await controller.waitForNextCall()
  const names = controller.peekNextCall()!.context.tools!.map((t) => t.name)
  expect(names).toContain('extra')
  await controller.nextTurn(); await p
})
