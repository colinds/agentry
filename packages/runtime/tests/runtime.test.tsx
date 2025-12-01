import { test, expect } from 'bun:test';
import { z } from 'zod';
import { render, defineTool, Agent, System, Tools, Tool, Message } from '../src/index.ts';
import { createStepMockClient, mockText, mockToolUse } from '@agentry/core';
import { TEST_MODEL } from '@agentry/shared';

test('render creates an agent and executes in batch mode', async () => {
  const { client, controller } = createStepMockClient([
    { content: [mockText('Hello, world!')] },
  ]);

  const runPromise = render(
    <Agent model={TEST_MODEL} maxTokens={100} maxIterations={1} stream={false}>
      <System>You are a test assistant. Be very brief.</System>
      <Message role="user">Say hello in 3 words</Message>
    </Agent>,
    { client },
  );

  await controller.nextTurn();
  const result = await runPromise;

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

  const { client, controller } = createStepMockClient([
    // First response: model calls the tool
    { content: [mockToolUse('get_info', { query: 'testing' })], stop_reason: 'tool_use' },
    // Second response: model responds with final text
    { content: [mockText('I found info about testing.')] },
  ]);

  const runPromise = render(
    <Agent model={TEST_MODEL} maxTokens={500} stream={false}>
      <System>You are a test assistant. Use the get_info tool.</System>
      <Tools>
        <Tool {...testTool} />
      </Tools>
      <Message role="user">Use the tool to get info about testing</Message>
    </Agent>,
    { client },
  );

  await controller.nextTurn();
  await controller.waitForNextCall();
  await controller.nextTurn();
  const result = await runPromise;

  expect(toolCalled).toBe(true);
  expect(result.content).toBe('I found info about testing.');
  expect(result.messages.length).toBeGreaterThan(2);
});

test('interactive mode allows multiple turns', async () => {
  const { client, controller } = createStepMockClient([
    { content: [mockText('Hi there!')] },
    { content: [mockText('One, two, three.')] },
  ]);

  const agentPromise = render(
    <Agent model={TEST_MODEL} maxTokens={200} stream={false}>
      <System>You are a test assistant. Be very concise.</System>
    </Agent>,
    { mode: 'interactive', client },
  );

  const agent = await agentPromise;

  try {
    // send first message
    const sendPromise1 = agent.sendMessage('Say hi');
    await controller.nextTurn();
    const result1 = await sendPromise1;
    expect(result1.content).toBe('Hi there!');

    // check we have messages from the first turn
    expect(agent.messages.length).toBeGreaterThanOrEqual(2);

    // send second message
    const sendPromise2 = agent.sendMessage('Count to three');
    await controller.nextTurn();
    const result2 = await sendPromise2;
    expect(result2.content).toBe('One, two, three.');

    // messages should have accumulated
    expect(agent.messages.length).toBeGreaterThanOrEqual(4);
  } finally {
    agent.close();
  }
});

test('stream() accepts message parameter for first turn', async () => {
  const { client, controller } = createStepMockClient([
    { content: [mockText('Hi there!')] },
  ]);

  const agentPromise = render(
    <Agent model={TEST_MODEL} maxTokens={200} stream={false}>
      <System>You are a test assistant. Be very concise.</System>
    </Agent>,
    { mode: 'interactive', client },
  );

  const agent = await agentPromise;

  try {
    let result;

    // Use stream() with message parameter on first turn
    // The stream() method returns an async iterator that yields events
    // and finally returns the result
    const streamPromise = (async () => {
      for await (const event of agent.stream('Say hi')) {
        result = event;
      }
    })();
    await controller.nextTurn();
    await streamPromise;

    // Verify message was added to conversation history
    expect(agent.messages.length).toBeGreaterThanOrEqual(2);
    expect(agent.messages[0]).toMatchObject({ role: 'user', content: 'Say hi' });
  } finally {
    agent.close();
  }
});

test('stream() works with message for subsequent turns', async () => {
  const { client, controller } = createStepMockClient([
    { content: [mockText('Hi there!')] },
    { content: [mockText('One, two, three.')] },
  ]);

  const agentPromise = render(
    <Agent model={TEST_MODEL} maxTokens={200} stream={false}>
      <System>You are a test assistant. Be very concise.</System>
    </Agent>,
    { mode: 'interactive', client },
  );

  const agent = await agentPromise;

  try {
    // First turn with stream() and message parameter
    const streamPromise1 = (async () => {
      for await (const event of agent.stream('Say hi')) {
        // consume stream
      }
    })();
    await controller.nextTurn();
    await streamPromise1;

    // Second turn with stream() and message parameter
    const streamPromise2 = (async () => {
      for await (const event of agent.stream('Count to three')) {
        // consume stream
      }
    })();
    await controller.nextTurn();
    await streamPromise2;

    // Verify both messages in history
    expect(agent.messages.length).toBeGreaterThanOrEqual(4);
    expect(agent.messages[0]).toMatchObject({ role: 'user', content: 'Say hi' });
    expect(agent.messages[2]).toMatchObject({ role: 'user', content: 'Count to three' });
  } finally {
    agent.close();
  }
});

test('stream() throws error when called without message on first turn', async () => {
  const { client } = createStepMockClient([]);

  const agentPromise = render(
    <Agent model={TEST_MODEL} maxTokens={200} stream={false}>
      <System>You are a test assistant. Be very concise.</System>
    </Agent>,
    { mode: 'interactive', client },
  );

  const agent = await agentPromise;

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
  const { client, controller } = createStepMockClient([
    { content: [mockText('Hi there!')] },
  ]);

  const agentPromise = render(
    <Agent model={TEST_MODEL} maxTokens={200} stream={false}>
      <System>You are a test assistant. Be very concise.</System>
    </Agent>,
    { mode: 'interactive', client },
  );

  const agent = await agentPromise;

  try {
    // First turn with message
    const streamPromise1 = (async () => {
      for await (const event of agent.stream('Say hi')) {
        // consume stream
      }
    })();
    await controller.nextTurn();
    await streamPromise1;

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

  const { client, controller } = createStepMockClient([
    // First call
    { content: [mockToolUse('increment', {}, 'tool_1')], stop_reason: 'tool_use' },
    // Second call
    { content: [mockToolUse('increment', {}, 'tool_2')], stop_reason: 'tool_use' },
    // Final response
    { content: [mockText('Done! Counter is 2.')] },
  ]);

  const runPromise = render(
    <Agent model={TEST_MODEL} maxTokens={500} stream={false}>
      <Tools>
        <Tool {...counterTool} />
      </Tools>
      <Message role="user">Increment twice</Message>
    </Agent>,
    { client },
  );

  await controller.nextTurn();
  await controller.waitForNextCall();
  await controller.nextTurn();
  await controller.waitForNextCall();
  await controller.nextTurn();
  const result = await runPromise;

  expect(callCount).toBe(2);
  expect(result.content).toBe('Done! Counter is 2.');
});

test('respects maxIterations limit', async () => {
  const { client, controller } = createStepMockClient([
    // Keep requesting tool use forever
    { content: [mockToolUse('test', {})], stop_reason: 'tool_use' },
  ]);

  const tool = defineTool({
    name: 'test',
    description: 'test',
    parameters: z.object({}),
    handler: async () => 'ok',
  });

  const runPromise = render(
    <Agent model={TEST_MODEL} maxTokens={100} maxIterations={3} stream={false}>
      <Tools>
        <Tool {...tool} />
      </Tools>
      <Message role="user">Test</Message>
    </Agent>,
    { client },
  );

  // Step through maxIterations (3 turns)
  await controller.nextTurn();
  await controller.waitForNextCall();
  await controller.nextTurn();
  await controller.waitForNextCall();
  await controller.nextTurn();
  const result = await runPromise;

  // Should stop after maxIterations even if model keeps calling tools
  expect(result.stopReason).toBe('tool_use');
});
