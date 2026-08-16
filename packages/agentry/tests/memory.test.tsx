import { describe, expect, test } from 'bun:test'
import { defineMemoryTool } from '../src/tools/defineMemoryTool'
import { run, Agent, System, Message, Memory } from '../src'
import { createStepMockModels, fauxText, fauxToolCall } from './utils'
import { ANTHROPIC_TEST_MODEL } from '../src/constants'
import type { MemoryHandlers, ToolContext } from '../src/types'

const toolContext = {} as ToolContext

function memoryStore() {
  const files = new Map<string, string>()
  const handlers: MemoryHandlers = {
    onView: ({ path }) => files.get(path) ?? `No such file: ${path}`,
    onCreate: ({ path, file_text }) => {
      files.set(path, file_text)
      return `Created ${path}`
    },
    onStrReplace: ({ path, old_str, new_str }) => {
      const current = files.get(path) ?? ''
      files.set(path, current.replace(old_str, new_str))
      return `Updated ${path}`
    },
    onDelete: ({ path }) => {
      files.delete(path)
      return `Deleted ${path}`
    },
  }
  return { files, handlers }
}

describe('memory tool', () => {
  test('exposes the command union as JSON Schema', () => {
    const tool = defineMemoryTool({})
    expect(tool.name).toBe('memory')
    expect(tool.jsonSchema).toMatchObject({
      type: 'object',
      required: ['command'],
    })
    const props = (tool.jsonSchema as { properties: Record<string, unknown> })
      .properties
    expect((props.command as { enum: string[] }).enum.sort()).toEqual([
      'create',
      'delete',
      'insert',
      'rename',
      'str_replace',
      'view',
    ])
  })

  test('dispatches create and view through the handlers', async () => {
    const { files, handlers } = memoryStore()
    const tool = defineMemoryTool(handlers)

    await tool.handler(
      { command: 'create', path: 'notes.md', file_text: 'colour: blue' },
      toolContext,
    )
    expect(files.get('notes.md')).toBe('colour: blue')

    const viewed = await tool.handler(
      { command: 'view', path: 'notes.md' },
      toolContext,
    )
    expect(viewed).toBe('colour: blue')
  })

  test('rejects an unknown command as a recoverable string', async () => {
    const tool = defineMemoryTool(memoryStore().handlers)
    const result = await tool.handler({ command: 'nope' }, toolContext)
    expect(String(result)).toContain('invalid memory command')
  })

  test('reports a missing handler rather than throwing', async () => {
    const tool = defineMemoryTool({})
    const result = await tool.handler(
      { command: 'view', path: 'x' },
      toolContext,
    )
    expect(String(result)).toContain('Missing onView handler')
  })
})

describe('<Memory> in an agent', () => {
  test('registers a memory tool the model can call', async () => {
    const { files, handlers } = memoryStore()

    const { models, controller } = createStepMockModels([
      {
        content: [
          fauxToolCall('memory', {
            command: 'create',
            path: 'fact.txt',
            file_text: 'the sky is blue',
          }),
        ],
      },
      { content: [fauxText('Noted.')] },
    ])

    const runPromise = run(
      <Agent
        provider="anthropic"
        model={ANTHROPIC_TEST_MODEL}
        maxTokens={100}
        stream={false}
      >
        <System>You can remember things.</System>
        <Memory handlers={handlers} />
        <Message role="user">Remember that the sky is blue.</Message>
      </Agent>,
      { models },
    )

    await controller.waitForNextCall()
    expect(
      controller.peekNextCall()!.context.tools!.map((t) => t.name),
    ).toContain('memory')

    await controller.nextTurn()
    await controller.waitForNextCall()
    await controller.nextTurn()
    await runPromise

    // The handler actually ran, cross-provider, with no server-side tool.
    expect(files.get('fact.txt')).toBe('the sky is blue')
  })
})
