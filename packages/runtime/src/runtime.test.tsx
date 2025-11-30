import { test, expect } from 'bun:test';
import { z } from 'zod';
import { render, defineTool, Agent, System, Tools, Tool, Message } from './index.ts';

// simple mock tool for testing
const mockTool = defineTool({
  name: 'mock_tool',
  description: 'A mock tool for testing',
  parameters: z.object({
    input: z.string(),
  }),
  handler: async ({ input }) => {
    return `Mocked response for: ${input}`;
  },
});

test('render creates an agent and executes in batch mode', async () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.log('Skipping runtime test - ANTHROPIC_API_KEY not set');
    return;
  }

  const result = await render(
    <Agent model="claude-sonnet-4-5-20250514" maxTokens={100} maxIterations={1}>
      <System>You are a test assistant. Be very brief.</System>
      <Message role="user">Say hello in 3 words</Message>
    </Agent>,
  );

  expect(result).toBeDefined();
  expect(result.content).toBeDefined();
  expect(typeof result.content).toBe('string');
  expect(result.content.length).toBeGreaterThan(0);
  expect(result.usage.inputTokens).toBeGreaterThan(0);
  expect(result.usage.outputTokens).toBeGreaterThan(0);
  expect(result.stopReason).toBeDefined();
  expect(result.messages.length).toBeGreaterThanOrEqual(2); // at least user + assistant

  console.log('✓ Batch mode result:', result.content);
  console.log('✓ Usage:', result.usage);
}, 30000);

test('render handles tools correctly', async () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.log('Skipping runtime test - ANTHROPIC_API_KEY not set');
    return;
  }

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

  const result = await render(
    <Agent model="claude-sonnet-4-5-20250514" maxTokens={500}>
      <System>You are a test assistant. Use the get_info tool.</System>
      <Tools>
        <Tool {...testTool} />
      </Tools>
      <Message role="user">Use the tool to get info about testing</Message>
    </Agent>,
  );

  expect(toolCalled).toBe(true);
  expect(result.content).toBeDefined();
  expect(result.messages.length).toBeGreaterThan(2); // user, assistant with tool use, tool result, assistant response

  console.log('✓ Tool was called:', toolCalled);
  console.log('✓ Final response:', result.content);
}, 30000);

test('interactive mode allows multiple turns', async () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.log('Skipping runtime test - ANTHROPIC_API_KEY not set');
    return;
  }

  const agent = await render(
    <Agent model="claude-sonnet-4-5-20250514" maxTokens={200} stream={false}>
      <System>You are a test assistant. Be very concise (under 10 words).</System>
    </Agent>,
    { mode: 'interactive' },
  );

  try {
    // send first message
    const result1 = await agent.sendMessage('Say hi');
    expect(result1.content).toBeDefined();
    expect(result1.content.length).toBeGreaterThan(0);

    console.log('✓ Turn 1:', result1.content);

    // check we have messages from the first turn
    expect(agent.messages.length).toBeGreaterThanOrEqual(2);

    // send second message
    const result2 = await agent.sendMessage('Count to three');
    expect(result2.content).toBeDefined();

    console.log('✓ Turn 2:', result2.content);

    // messages should have accumulated
    expect(agent.messages.length).toBeGreaterThanOrEqual(4);
  } finally {
    agent.close();
  }
}, 60000);
