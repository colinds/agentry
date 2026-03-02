import { test, expect } from 'bun:test'
import { emitSyntheticEvents } from '../src/providers/syntheticEvents'
import type { AgentStreamEvent } from '../src/types/agent'
import type { AgentContentBlock } from '../src/types/messages'

function collectEvents(
  content: AgentContentBlock[],
  stopReason: string | null = 'end_turn',
): AgentStreamEvent[] {
  const events: AgentStreamEvent[] = []
  emitSyntheticEvents(content, stopReason, (e) => events.push(e))
  return events
}

test('single text block — accumulated equals block text', () => {
  const events = collectEvents([{ type: 'text', text: 'Hello world' }])

  expect(events).toHaveLength(2)
  expect(events[0]).toEqual({
    type: 'text',
    text: 'Hello world',
    accumulated: 'Hello world',
  })
  expect(events[1]).toEqual({
    type: 'message_complete',
    stopReason: 'end_turn',
  })
})

test('multiple text blocks — accumulated grows across blocks', () => {
  const events = collectEvents([
    { type: 'text', text: 'Hello ' },
    { type: 'text', text: 'world' },
  ])

  expect(events).toHaveLength(3)
  expect(events[0]).toEqual({
    type: 'text',
    text: 'Hello ',
    accumulated: 'Hello ',
  })
  expect(events[1]).toEqual({
    type: 'text',
    text: 'world',
    accumulated: 'Hello world',
  })
  expect(events[2]).toEqual({
    type: 'message_complete',
    stopReason: 'end_turn',
  })
})

test('mixed content — correct event types in order', () => {
  const events = collectEvents([
    { type: 'thinking', thinking: 'Let me think...' },
    { type: 'text', text: 'Answer: ' },
    { type: 'tool_use', id: 'tool_1', name: 'search', input: { q: 'test' } },
    { type: 'text', text: '42' },
  ])

  expect(events.map((e) => e.type)).toEqual([
    'thinking',
    'text',
    'tool_use_start',
    'text',
    'message_complete',
  ])

  // Verify thinking event
  expect(events[0]).toEqual({ type: 'thinking', text: 'Let me think...' })

  // Verify accumulated across text blocks (skipping thinking and tool_use)
  const textEvents = events.filter(
    (e): e is Extract<AgentStreamEvent, { type: 'text' }> => e.type === 'text',
  )
  expect(textEvents[0]!.accumulated).toBe('Answer: ')
  expect(textEvents[1]!.accumulated).toBe('Answer: 42')

  // Verify tool_use_start
  expect(events[2]).toEqual({
    type: 'tool_use_start',
    toolName: 'search',
    toolId: 'tool_1',
  })
})

test('empty content — only message_complete', () => {
  const events = collectEvents([])

  expect(events).toHaveLength(1)
  expect(events[0]).toEqual({
    type: 'message_complete',
    stopReason: 'end_turn',
  })
})

test('message_complete always last with correct stopReason', () => {
  const events = collectEvents([{ type: 'text', text: 'done' }], 'tool_use')

  const last = events[events.length - 1]!
  expect(last).toEqual({ type: 'message_complete', stopReason: 'tool_use' })
})

test('null stop_reason becomes unknown', () => {
  const events = collectEvents([{ type: 'text', text: 'hi' }], null)

  const last = events[events.length - 1]!
  expect(last).toEqual({ type: 'message_complete', stopReason: 'unknown' })
})

test('tool_result blocks are ignored', () => {
  const events = collectEvents([
    { type: 'text', text: 'result' },
    {
      type: 'tool_result',
      tool_use_id: 'tool_1',
      content: 'output',
      is_error: false,
    },
  ])

  expect(events.map((e) => e.type)).toEqual(['text', 'message_complete'])
})
