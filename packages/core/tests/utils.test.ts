import { test, expect } from 'bun:test';
import { diffProps } from '../src/reconciler/utils.ts';

test('diffProps detects changed primitive props', () => {
  const result = diffProps(
    { model: 'old-model', maxTokens: 100 },
    { model: 'new-model', maxTokens: 200 },
  );

  expect(result.hasChanges).toBe(true);
  expect(result.changes.model).toBe('new-model');
  expect(result.changes.maxTokens).toBe(200);
});

test('diffProps compares objects shallowly by content', () => {
  // Same content = no change (shallow equal compares values)
  const result1 = diffProps(
    { data: { foo: 'bar' } },
    { data: { foo: 'bar' } },
  );
  expect(result1.hasChanges).toBe(false);

  // Different content = change detected
  const result2 = diffProps(
    { data: { foo: 'bar' } },
    { data: { foo: 'baz' } },
  );
  expect(result2.hasChanges).toBe(true);
});

test('diffProps detects removed props', () => {
  const result = diffProps(
    { model: 'test', temperature: 0.7 },
    { model: 'test' }
  );

  expect(result.hasChanges).toBe(true);
  expect(result.changes.temperature).toBeUndefined();
  expect('temperature' in result.changes).toBe(true);
});

test('diffProps skips reserved props', () => {
  const result = diffProps(
    { children: 'old', key: '1', ref: {} },
    { children: 'new', key: '2', ref: {} },
  );

  expect(result.hasChanges).toBe(false);
  expect(result.changes).toEqual({});
});

test('diffProps skips callback props', () => {
  const result = diffProps(
    { onMessage: () => {}, onComplete: () => {}, onError: () => {} },
    { onMessage: () => {}, onComplete: () => {}, onError: () => {} },
  );

  expect(result.hasChanges).toBe(false);
});

test('diffProps detects model changes', () => {
  const result = diffProps({ model: 'old-model' }, { model: 'new-model' });

  expect(result.hasChanges).toBe(true);
  expect(result.changes.model).toBe('new-model');
});

test('diffProps detects client changes', () => {
  const oldClient = { apiKey: 'old' };
  const newClient = { apiKey: 'new' };

  const result = diffProps({ client: oldClient }, { client: newClient });

  expect(result.hasChanges).toBe(true);
  expect(result.changes.client).toBe(newClient);
});

test('diffProps returns hasChanges false when props are identical', () => {
  const obj = { foo: 'bar' };

  const result = diffProps(
    { model: 'test', maxTokens: 100, data: obj },
    { model: 'test', maxTokens: 100, data: obj },
  );

  expect(result.hasChanges).toBe(false);
  expect(result.changes).toEqual({});
});

