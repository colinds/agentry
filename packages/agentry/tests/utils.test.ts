import { test, expect } from 'bun:test'
import { diffProps } from '../src/reconciler/utils'

test('diffProps detects changed primitive props', () => {
  const result = diffProps(
    { model: 'old-model', maxTokens: 100 },
    { model: 'new-model', maxTokens: 200 },
  )

  expect(result.hasChanges).toBe(true)
  expect(result.changes.model).toBe('new-model')
  expect(result.changes.maxTokens).toBe(200)
})

test('diffProps compares objects deeply by content', () => {
  // same content = no change
  const result1 = diffProps({ data: { foo: 'bar' } }, { data: { foo: 'bar' } })
  expect(result1.hasChanges).toBe(false)

  // different content = change detected
  const result2 = diffProps({ data: { foo: 'bar' } }, { data: { foo: 'baz' } })
  expect(result2.hasChanges).toBe(true)
})

test('diffProps detects removed props', () => {
  const result = diffProps(
    { model: 'test', temperature: 0.7 },
    { model: 'test' },
  )

  expect(result.hasChanges).toBe(true)
  expect(result.changes.temperature).toBeUndefined()
  expect('temperature' in result.changes).toBe(true)
})

test('diffProps skips reserved props', () => {
  const result = diffProps(
    { children: 'old', key: '1', ref: {} },
    { children: 'new', key: '2', ref: {} },
  )

  expect(result.hasChanges).toBe(false)
  expect(result.changes).toEqual({})
})

test('diffProps skips callback props', () => {
  const result = diffProps(
    {
      onMessage: () => {},
      onComplete: () => {},
      onError: () => {},
      onStepFinish: () => {},
    },
    {
      onMessage: () => {},
      onComplete: () => {},
      onError: () => {},
      onStepFinish: () => {},
    },
  )

  expect(result.hasChanges).toBe(false)
})

test('diffProps detects model changes', () => {
  const result = diffProps({ model: 'old-model' }, { model: 'new-model' })

  expect(result.hasChanges).toBe(true)
  expect(result.changes.model).toBe('new-model')
})

test('diffProps detects client changes', () => {
  const oldClient = { apiKey: 'old' }
  const newClient = { apiKey: 'new' }

  const result = diffProps({ client: oldClient }, { client: newClient })

  expect(result.hasChanges).toBe(true)
  expect(result.changes.client).toBe(newClient)
})

test('diffProps returns hasChanges false when props are identical', () => {
  const obj = { foo: 'bar' }

  const result = diffProps(
    { model: 'test', maxTokens: 100, data: obj },
    { model: 'test', maxTokens: 100, data: obj },
  )

  expect(result.hasChanges).toBe(false)
  expect(result.changes).toEqual({})
})

test('diffProps detects nested compactionControl changes', () => {
  const result = diffProps(
    { compactionControl: { enabled: true, contextTokenThreshold: 100000 } },
    { compactionControl: { enabled: true, contextTokenThreshold: 200000 } },
  )

  expect(result.hasChanges).toBe(true)
  expect(result.changes.compactionControl).toEqual({
    enabled: true,
    contextTokenThreshold: 200000,
  })
})

test('diffProps detects deeply nested object changes', () => {
  const result = diffProps(
    { config: { nested: { deep: { value: 1 } } } },
    { config: { nested: { deep: { value: 2 } } } },
  )

  expect(result.hasChanges).toBe(true)
})

test('diffProps compares arrays by value', () => {
  // same array content = no change
  const result1 = diffProps(
    { stopSequences: ['stop1', 'stop2'] },
    { stopSequences: ['stop1', 'stop2'] },
  )
  expect(result1.hasChanges).toBe(false)

  // different array content = change detected
  const result2 = diffProps(
    { stopSequences: ['stop1', 'stop2'] },
    { stopSequences: ['stop1', 'stop3'] },
  )
  expect(result2.hasChanges).toBe(true)

  // different array length = change detected
  const result3 = diffProps(
    { stopSequences: ['stop1'] },
    { stopSequences: ['stop1', 'stop2'] },
  )
  expect(result3.hasChanges).toBe(true)
})

test('diffProps handles arrays of objects', () => {
  const result1 = diffProps(
    { items: [{ id: 1, name: 'a' }] },
    { items: [{ id: 1, name: 'a' }] },
  )
  expect(result1.hasChanges).toBe(false)

  const result2 = diffProps(
    { items: [{ id: 1, name: 'a' }] },
    { items: [{ id: 1, name: 'b' }] },
  )
  expect(result2.hasChanges).toBe(true)
})

test('diffProps handles null and undefined correctly', () => {
  // null to value
  const result1 = diffProps({ value: null }, { value: 'test' })
  expect(result1.hasChanges).toBe(true)

  // value to null
  const result2 = diffProps({ value: 'test' }, { value: null })
  expect(result2.hasChanges).toBe(true)

  // null to null
  const result3 = diffProps({ value: null }, { value: null })
  expect(result3.hasChanges).toBe(false)
})
