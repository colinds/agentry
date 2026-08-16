import { test, expect } from 'bun:test'
import { useState } from 'react'
import { Type } from 'typebox'
import { run } from '../src'
import { defineTool } from '../src/tools'
import { Agent, System, Tools, Tool, Message } from '../src'
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
