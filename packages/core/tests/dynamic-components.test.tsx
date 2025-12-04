import { test, expect } from 'bun:test'
import { useState } from 'react'
import { z } from 'zod'
import { run } from '../src/index.ts'
import { defineTool } from '@agentry/core/tools'
import { Agent, System, Tools, Tool, Message } from '@agentry/components'
import {
  createStepMockClient,
  mockText,
  mockToolUse,
} from '@agentry/core/test-utils'
import { TEST_MODEL } from '@agentry/shared'

test('state changes trigger reconciler updates', async () => {
  let updateCount = 0

  function StateUpdateAgent() {
    const [count, setCount] = useState(0)

    const incrementTool = defineTool({
      name: 'increment',
      description: 'Increment counter',
      parameters: z.object({}),
      handler: async () => {
        setCount((prev) => prev + 1)
        updateCount++
        return `Count: ${count + 1}`
      },
    })

    return (
      <Agent model={TEST_MODEL} stream={false}>
        <System>Counter is at {count}</System>
        <Tools>
          <Tool {...incrementTool} />
        </Tools>
        <Message role="user">Increment twice</Message>
      </Agent>
    )
  }

  const { client, controller } = createStepMockClient([
    { content: [mockToolUse('increment', {})], stop_reason: 'tool_use' },
    { content: [mockToolUse('increment', {})], stop_reason: 'tool_use' },
    { content: [mockText('Done incrementing')] },
  ])

  const runPromise = run(<StateUpdateAgent />, { client })

  await controller.nextTurn()
  await controller.waitForNextCall()
  await controller.nextTurn()
  await controller.waitForNextCall()
  await controller.nextTurn()

  const result = await runPromise

  expect(updateCount).toBe(2)
  expect(result.content).toBe('Done incrementing')
})
