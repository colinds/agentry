import { test, expect } from 'bun:test';
import { createSubagentInstance } from './instances/createInstance.ts';

test('createSubagentInstance requires name', () => {
  expect(() => {
    createSubagentInstance({
      model: 'claude-sonnet-4-5-20250514',
      // no name provided
    } as Parameters<typeof createSubagentInstance>[0]);
  }).toThrow('Child agents must have a name');
});

test('createSubagentInstance creates correct structure', () => {
  const subagent = createSubagentInstance({
    model: 'claude-sonnet-4-5-20250514',
    name: 'researcher',
    description: 'A research agent',
    maxTokens: 1000,
  } as Parameters<typeof createSubagentInstance>[0]);

  expect(subagent.type).toBe('subagent');
  expect(subagent.name).toBe('researcher');
  expect(subagent.description).toBe('A research agent');
  expect(subagent.props.model).toBe('claude-sonnet-4-5-20250514');
  expect(subagent.props.maxTokens).toBe(1000);
  expect(subagent.systemParts).toEqual([]);
  expect(subagent.tools).toEqual([]);
});

test('subagent defaults to non-streaming', () => {
  const subagent = createSubagentInstance(
    {
      model: 'claude-sonnet-4-5-20250514',
      name: 'test',
    } as Parameters<typeof createSubagentInstance>[0],
    {},
  );

  expect(subagent.props.stream).toBe(false);
  expect(subagent.props.maxTokens).toBe(2048);
  expect(subagent.props.maxIterations).toBe(5);
});

test('subagent inherits stream setting from parent', () => {
  const subagent = createSubagentInstance(
    {
      model: 'claude-sonnet-4-5-20250514',
      name: 'test',
    } as Parameters<typeof createSubagentInstance>[0],
    { stream: true },
  );

  expect(subagent.props.stream).toBe(true);
});

test('subagent inherits temperature from parent', () => {
  const subagent = createSubagentInstance(
    {
      model: 'claude-sonnet-4-5-20250514',
      name: 'test',
    } as Parameters<typeof createSubagentInstance>[0],
    { temperature: 0.9 },
  );

  expect(subagent.props.temperature).toBe(0.9);
});

test('subagent halves maxTokens from parent', () => {
  const subagent = createSubagentInstance(
    {
      model: 'claude-sonnet-4-5-20250514',
      name: 'test',
    } as Parameters<typeof createSubagentInstance>[0],
    { maxTokens: 4096 },
  );

  expect(subagent.props.maxTokens).toBe(2048);
});

test('subagent can override inherited settings', () => {
  const subagent = createSubagentInstance(
    {
      model: 'claude-sonnet-4-5-20250514',
      name: 'test',
      stream: false,
      temperature: 0.5,
    } as Parameters<typeof createSubagentInstance>[0],
    { stream: true, temperature: 0.9 },
  );

  expect(subagent.props.stream).toBe(false);
  expect(subagent.props.temperature).toBe(0.5);
});
