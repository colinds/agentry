import { test, expect } from 'bun:test';
import { z } from 'zod';
import { render, defineTool, Agent, System, Tools, Tool, Message } from '../src/index.ts';
import { createMockClient, mockText, mockToolUse } from '@agentry/core';
import { TEST_MODEL } from '@agentry/shared';

test('render creates an agent and executes in batch mode', async () => {
  const client = createMockClient([
    { content: [mockText('Hello, world!')] },
  ]);

  const result = await render(
    <Agent model={TEST_MODEL} maxTokens={100} maxIterations={1} stream={false}>
      <System>You are a test assistant. Be very brief.</System>
      <Message role="user">Say hello in 3 words</Message>
    </Agent>,
    { client },
  );

  expect(result).toBeDefined();
  expect(result.content).toBe('Hello, world!');
  expect(result.usage.inputTokens).toBe(100);
  expect(result.usage.outputTokens).toBe(50);
  expect(result.stopReason).toBe('end_turn');
  expect(result.messages.length).toBeGreaterThanOrEqual(2);
});

test('render handles tools correctly', async () => {
  let toolCalled = false;
  const testTool = defineTool({
    name: 'get_info',
    description: 'Get some information',
    parameters: z.object({
      query: z.string(),
    }),
    handler: async ({ query }) => {
      toolCalled = true;
      return `Info about: ${query}`;
    },
  });

  const client = createMockClient([
    // First response: model calls the tool
    { content: [mockToolUse('get_info', { query: 'testing' })], stop_reason: 'tool_use' },
    // Second response: model responds with final text
    { content: [mockText('I found info about testing.')] },
  ]);

  const result = await render(
    <Agent model={TEST_MODEL} maxTokens={500} stream={false}>
      <System>You are a test assistant. Use the get_info tool.</System>
      <Tools>
        <Tool {...testTool} />
      </Tools>
      <Message role="user">Use the tool to get info about testing</Message>
    </Agent>,
    { client },
  );

  expect(toolCalled).toBe(true);
  expect(result.content).toBe('I found info about testing.');
  expect(result.messages.length).toBeGreaterThan(2);
});

test('interactive mode allows multiple turns', async () => {
  const client = createMockClient([
    { content: [mockText('Hi there!')] },
    { content: [mockText('One, two, three.')] },
  ]);

  const agent = await render(
    <Agent model={TEST_MODEL} maxTokens={200} stream={false}>
      <System>You are a test assistant. Be very concise.</System>
    </Agent>,
    { mode: 'interactive', client },
  );

  try {
    // send first message
    const result1 = await agent.sendMessage('Say hi');
    expect(result1.content).toBe('Hi there!');

    // check we have messages from the first turn
    expect(agent.messages.length).toBeGreaterThanOrEqual(2);

    // send second message
    const result2 = await agent.sendMessage('Count to three');
    expect(result2.content).toBe('One, two, three.');

    // messages should have accumulated
    expect(agent.messages.length).toBeGreaterThanOrEqual(4);
  } finally {
    agent.close();
  }
});

test('stream() accepts message parameter for first turn', async () => {
  const client = createMockClient([
    { content: [mockText('Hi there!')] },
  ]);

  const agent = await render(
    <Agent model={TEST_MODEL} maxTokens={200} stream={false}>
      <System>You are a test assistant. Be very concise.</System>
    </Agent>,
    { mode: 'interactive', client },
  );

  try {
    let result;

    // Use stream() with message parameter on first turn
    // The stream() method returns an async iterator that yields events
    // and finally returns the result
    for await (const event of agent.stream('Say hi')) {
      result = event;
    }

    // Verify message was added to conversation history
    expect(agent.messages.length).toBeGreaterThanOrEqual(2);
    expect(agent.messages[0]).toMatchObject({ role: 'user', content: 'Say hi' });
  } finally {
    agent.close();
  }
});

test('stream() works with message for subsequent turns', async () => {
  const client = createMockClient([
    { content: [mockText('Hi there!')] },
    { content: [mockText('One, two, three.')] },
  ]);

  const agent = await render(
    <Agent model={TEST_MODEL} maxTokens={200} stream={false}>
      <System>You are a test assistant. Be very concise.</System>
    </Agent>,
    { mode: 'interactive', client },
  );

  try {
    // First turn with stream() and message parameter
    for await (const event of agent.stream('Say hi')) {
      // consume stream
    }

    // Second turn with stream() and message parameter
    for await (const event of agent.stream('Count to three')) {
      // consume stream
    }

    // Verify both messages in history
    expect(agent.messages.length).toBeGreaterThanOrEqual(4);
    expect(agent.messages[0]).toMatchObject({ role: 'user', content: 'Say hi' });
    expect(agent.messages[2]).toMatchObject({ role: 'user', content: 'Count to three' });
  } finally {
    agent.close();
  }
});

test('stream() throws error when called without message on first turn', async () => {
  const client = createMockClient([]);

  const agent = await render(
    <Agent model={TEST_MODEL} maxTokens={200} stream={false}>
      <System>You are a test assistant. Be very concise.</System>
    </Agent>,
    { mode: 'interactive', client },
  );

  try {
    // Should throw error when no message provided
    let errorThrown = false;
    try {
      for await (const event of agent.stream()) {
        // Should not reach here
      }
    } catch (error: any) {
      errorThrown = true;
      expect(error.message).toContain('stream() requires a message parameter');
    }
    expect(errorThrown).toBe(true);
  } finally {
    agent.close();
  }
});

test('stream() throws error when called without message on subsequent turns', async () => {
  const client = createMockClient([
    { content: [mockText('Hi there!')] },
  ]);

  const agent = await render(
    <Agent model={TEST_MODEL} maxTokens={200} stream={false}>
      <System>You are a test assistant. Be very concise.</System>
    </Agent>,
    { mode: 'interactive', client },
  );

  try {
    // First turn with message
    for await (const event of agent.stream('Say hi')) {
      // consume stream
    }

    // Second turn without message should also throw
    let errorThrown = false;
    try {
      for await (const event of agent.stream()) {
        // Should not reach here
      }
    } catch (error: any) {
      errorThrown = true;
      expect(error.message).toContain('stream() requires a message parameter');
    }
    expect(errorThrown).toBe(true);
  } finally {
    agent.close();
  }
});

test('handles multiple tool calls in sequence', async () => {
  let callCount = 0;
  const counterTool = defineTool({
    name: 'increment',
    description: 'Increment the counter',
    parameters: z.object({}),
    handler: async () => {
      callCount++;
      return `Counter is now ${callCount}`;
    },
  });

  const client = createMockClient([
    // First call
    { content: [mockToolUse('increment', {}, 'tool_1')], stop_reason: 'tool_use' },
    // Second call
    { content: [mockToolUse('increment', {}, 'tool_2')], stop_reason: 'tool_use' },
    // Final response
    { content: [mockText('Done! Counter is 2.')] },
  ]);

  const result = await render(
    <Agent model={TEST_MODEL} maxTokens={500} stream={false}>
      <Tools>
        <Tool {...counterTool} />
      </Tools>
      <Message role="user">Increment twice</Message>
    </Agent>,
    { client },
  );

  expect(callCount).toBe(2);
  expect(result.content).toBe('Done! Counter is 2.');
});

test('respects maxIterations limit', async () => {
  const client = createMockClient([
    // Keep requesting tool use forever
    { content: [mockToolUse('test', {})], stop_reason: 'tool_use' },
  ]);

  const tool = defineTool({
    name: 'test',
    description: 'test',
    parameters: z.object({}),
    handler: async () => 'ok',
  });

  const result = await render(
    <Agent model={TEST_MODEL} maxTokens={100} maxIterations={3} stream={false}>
      <Tools>
        <Tool {...tool} />
      </Tools>
      <Message role="user">Test</Message>
    </Agent>,
    { client },
  );

  // Should stop after maxIterations even if model keeps calling tools
  expect(result.stopReason).toBe('tool_use');
});
