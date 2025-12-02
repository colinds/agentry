import { test, expect } from 'bun:test'
import { useState } from 'react'
import { z } from 'zod'
import { render } from '../src/index.ts'
import { defineTool } from '@agentry/core/tools'
import { Agent, System, Tools, Tool, Message } from '@agentry/components'
import {
  createStepMockClient,
  mockText,
  mockToolUse,
} from '@agentry/core/test-utils'
import { TEST_MODEL } from '@agentry/shared'

function EphemeralAgent({ onComplete }: { onComplete: () => void }) {
  return (
    <Agent
      name="ephemeral"
      description="Removes itself after completion"
      onComplete={onComplete}
    >
      <System>You are temporary</System>
    </Agent>
  )
}

test('self-removing subagent via onComplete', async () => {
  function SelfRemovingSubagent() {
    const [hasAgent, setHasAgent] = useState(true)

    return (
      <Agent model={TEST_MODEL} stream={false}>
        <System>Manager</System>
        <Tools>
          {hasAgent && <EphemeralAgent onComplete={() => setHasAgent(false)} />}
        </Tools>
        <Message role="user">Use the ephemeral agent</Message>
      </Agent>
    )
  }

  const { client, controller } = createStepMockClient([
    { content: [mockToolUse('ephemeral', {})], stop_reason: 'tool_use' },
    { content: [mockText('Ephemeral agent completed')] },
  ])

  const runPromise = render(<SelfRemovingSubagent />, { client })

  await controller.nextTurn()
  await controller.waitForNextCall()
  await controller.nextTurn()

  const result = await runPromise

  expect(result.content).toBe('Ephemeral agent completed')
})

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

  const runPromise = render(<StateUpdateAgent />, { client })

  await controller.nextTurn()
  await controller.waitForNextCall()
  await controller.nextTurn()
  await controller.waitForNextCall()
  await controller.nextTurn()

  const result = await runPromise

  expect(updateCount).toBe(2)
  expect(result.content).toBe('Done incrementing')
})
