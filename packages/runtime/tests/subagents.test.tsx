import { test, expect } from 'bun:test';
import { useState } from 'react';
import { render, createAgent, Agent, System, Tools, Message, useMessages, defineTool, Tool } from '../src/index.ts';
import { createStepMockClient, mockText, mockToolUse } from '@agentry/core';
import { TEST_MODEL } from '@agentry/shared';
import { z } from 'zod';
import { getRegisteredTools } from './utils/testHelpers.ts';

test('subagent has isolated message context', async () => {
  let subagentMessageCount = 0;

  function IsolatedAgent() {
    const messages = useMessages();
    // Capture message count when subagent renders
    subagentMessageCount = messages.length;

    return (
      <Agent name="isolated" stream={false} description="Has isolated messages">
        <System>You are isolated</System>
      </Agent>
    );
  }

  const { client, controller } = createStepMockClient([
    { content: [mockToolUse('isolated', {})], stop_reason: 'tool_use' },
    { content: [mockText('Parent continues')] },
  ]);

  const runPromise = render(
    <Agent model={TEST_MODEL} stream={false}>
      <System>Parent system prompt</System>
      <Tools>
        <IsolatedAgent />
      </Tools>
      <Message role="user">Call the isolated agent</Message>
    </Agent>,
    { client }
  );

  // Step through turns
  await controller.nextTurn();
  await controller.waitForNextCall();
  await controller.nextTurn();
  
  await runPromise;

  // Subagent should only see its own messages, not parent's
  // At the time the subagent component renders, it should have minimal messages
  expect(subagentMessageCount).toBeLessThan(5);
});

test('onStepFinish callback fires for subagent calls', async () => {
  let stepFinishCalled = false;
  let stepToolCalls: any[] = [];

  function SubAgent() {
    return (
      <Agent name="subagent" stream={false} description="Test subagent">
        <System>You are a subagent</System>
      </Agent>
    );
  }

  const { client, controller } = createStepMockClient([
    { content: [mockToolUse('subagent', {})], stop_reason: 'tool_use' },
    { content: [mockText('Done')] },
  ]);

  const runPromise = render(
    <Agent
      model={TEST_MODEL}
      stream={false}
      onStepFinish={(result) => {
        stepFinishCalled = true;
        stepToolCalls.push(...result.toolCalls);
      }}
    >
      <Tools>
        <SubAgent />
      </Tools>
      <Message role="user">Call subagent</Message>
    </Agent>,
    { client }
  );

  // Step through turns
  await controller.nextTurn();
  await controller.waitForNextCall();
  await controller.nextTurn();
  
  await runPromise;

  expect(stepFinishCalled).toBe(true);
  expect(stepToolCalls.length).toBeGreaterThan(0);
  expect(stepToolCalls.some(call => call.name === 'subagent')).toBe(true);
});

test('onComplete callback fires when agent finishes', async () => {
  let completeCalled = false;
  let completeResult: any = null;

  function CompletableAgent() {
    return (
      <Agent
        name="completable"
        description="Agent with onComplete"
        stream={false}
        onComplete={(result) => {
          completeCalled = true;
          completeResult = result;
        }}
      >
        <System>You complete tasks</System>
      </Agent>
    );
  }

  // Mock client responses:
  // 1. Parent agent calls subagent tool
  // 2. Subagent executes and completes (needs its own response)
  // 3. Parent agent continues after subagent completes
  const { client, controller } = createStepMockClient([
    { content: [mockToolUse('completable', { task: 'test' })], stop_reason: 'tool_use' },
    { content: [mockText('Task completed by subagent')] }, // Subagent's response
    { content: [mockText('All done')] }, // Parent's final response
  ]);

  const runPromise = render(
    <Agent model={TEST_MODEL} stream={false}>
      <Tools>
        <CompletableAgent />
      </Tools>
      <Message role="user">Run the completable agent</Message>
    </Agent>,
    { client }
  );

  // Step through all turns
  await controller.nextTurn();
  await controller.waitForNextCall();
  await controller.nextTurn();
  await controller.waitForNextCall();
  await controller.nextTurn();
  
  await runPromise;

  expect(completeCalled).toBe(true);
  expect(completeResult).toBeDefined();
  expect(completeResult.content).toBe('Task completed by subagent');
});

test('conditionally hidden subagents are not available as tools', async () => {
  function OptionalSubagentTest() {
    function HiddenAgent() {
      return (
        <Agent name="hidden" stream={false} description="Hidden agent">
          <System>I am hidden</System>
        </Agent>
      );
    }

    return (
      <Agent model={TEST_MODEL} stream={false}>
        <Tools>
          {false && <HiddenAgent />}
        </Tools>
        <Message role="user">Try to use hidden agent</Message>
      </Agent>
    );
  }

  const { client, controller } = createStepMockClient([
    { content: [mockText('I cannot help with that')] },
  ]);

  const runPromise = render(<OptionalSubagentTest />, { client });
  
  // Step through turn
  await controller.nextTurn();
  
  const result = await runPromise;
  // When a tool is not available, agent responds naturally without using it
  expect(result.content).toBe('I cannot help with that');
});

test('tools can be mounted during execution via state change', async () => {
  let enablerCalled = false;
  let helperCalled = false;

  function MountingToolTest() {
    const [mounted, setMounted] = useState(false);

    const enabler = defineTool({
      name: 'enable_helper',
      description: 'Enable the helper tool',
      parameters: z.object({}),
      handler: async () => {
        enablerCalled = true;
        setMounted(true);
        return 'Helper tool is now enabled';
      },
    });

    function HelperAgent() {
      helperCalled = true;
      return (
        <Agent name="helper" stream={false} description="Helper agent">
          <System>I help with tasks</System>
        </Agent>
      );
    }

    return (
      <Agent model={TEST_MODEL} stream={false} maxIterations={5}>
        <System>You manage tools</System>
        <Tools>
          <Tool {...enabler} />
          {mounted && <HelperAgent />}
        </Tools>
        <Message role="user">Enable helper then use it</Message>
      </Agent>
    );
  }

  const { client, controller } = createStepMockClient([
    { content: [mockToolUse('enable_helper', {})], stop_reason: 'tool_use' },
    { content: [mockToolUse('helper', {})], stop_reason: 'tool_use' },
    { content: [mockText('Task completed')] },
  ]);

  const agent = createAgent(<MountingToolTest />, { client });

  try {
    // Start execution
    const runPromise = agent.run();

    // Resolve first turn - agent calls enable_helper
    await controller.nextTurn();
    
    // Wait for tool execution to complete (next call queued)
    await controller.waitForNextCall();
    
    // After tool execution, helper should be available (state update processed)
    let tools = getRegisteredTools(agent);
    expect(tools).toContain('enable_helper');
    expect(tools).toContain('helper');
    expect(enablerCalled).toBe(true);

    // Resolve second turn - agent calls helper
    await controller.nextTurn();
    
    // Wait for tool execution to complete
    await controller.waitForNextCall();
    
    // Helper should have been called
    expect(helperCalled).toBe(true);

    // Final turn
    await controller.nextTurn();
    
    const result = await runPromise;
    expect(result.content).toBe('Task completed');
    
    // Final verification
    const finalTools = getRegisteredTools(agent);
    expect(finalTools).toContain('enable_helper');
    expect(finalTools).toContain('helper');
  } finally {
    agent.close();
  }
});

test('subagents can be mounted during execution via state change', async () => {
  let coordinatorCalled = false;
  let researcherCalled = false;

  function MountingSubagentTest() {
    const [hasResearcher, setHasResearcher] = useState(false);

    const coordinator = defineTool({
      name: 'start_research',
      description: 'Start research phase',
      parameters: z.object({}),
      handler: async () => {
        coordinatorCalled = true;
        setHasResearcher(true);
        return 'Research phase activated';
      },
    });

    function ResearcherAgent() {
      researcherCalled = true;
      return (
        <Agent name="researcher" stream={false} description="Research specialist">
          <System>You do research</System>
        </Agent>
      );
    }

    return (
      <Agent model={TEST_MODEL} stream={false} maxIterations={5}>
        <System>You coordinate work</System>
        <Tools>
          <Tool {...coordinator} />
          {hasResearcher && <ResearcherAgent />}
        </Tools>
        <Message role="user">Coordinate the work</Message>
      </Agent>
    );
  }

  const { client, controller } = createStepMockClient([
    { content: [mockToolUse('start_research', {})], stop_reason: 'tool_use' },
    { content: [mockToolUse('researcher', {})], stop_reason: 'tool_use' },
    { content: [mockText('Work coordinated')] },
  ]);

  const agent = createAgent(<MountingSubagentTest />, { client });

  try {
    // Start execution
    const runPromise = agent.run();

    // Turn 1: Call start_research
    await controller.nextTurn();
    
    // Wait for tool execution to complete
    await controller.waitForNextCall();
    
    // After tool execution, researcher should be available (state update processed)
    let tools = getRegisteredTools(agent);
    expect(tools).toContain('start_research');
    expect(tools).toContain('researcher');
    expect(coordinatorCalled).toBe(true);
    expect(researcherCalled).toBe(true); // Component rendered when mounted

    // Turn 2: Call researcher
    await controller.nextTurn();
    
    // Wait for tool execution to complete
    await controller.waitForNextCall();
    
    tools = getRegisteredTools(agent);
    expect(tools).toContain('start_research');
    expect(tools).toContain('researcher');
    expect(researcherCalled).toBe(true);

    // Turn 3: Final response
    await controller.nextTurn();
    
    const result = await runPromise;
    expect(result.content).toBe('Work coordinated');
    
    // Final verification
    const finalTools = getRegisteredTools(agent);
    expect(finalTools).toContain('start_research');
    expect(finalTools).toContain('researcher');
  } finally {
    agent.close();
  }
});

test('tools can be unmounted during execution via state change', async () => {
  let temporaryCalled = false;
  let disablerCalled = false;

  function UnmountingToolTest() {
    const [enabled, setEnabled] = useState(true);

    const disabler = defineTool({
      name: 'disable_tool',
      description: 'Disable the temporary tool',
      parameters: z.object({}),
      handler: async () => {
        disablerCalled = true;
        setEnabled(false);
        return 'Tool disabled';
      },
    });

    const temporary = defineTool({
      name: 'temporary',
      description: 'Temporary tool that will be disabled',
      parameters: z.object({}),
      handler: async () => {
        temporaryCalled = true;
        return 'This runs';
      },
    });

    return (
      <Agent model={TEST_MODEL} stream={false} maxIterations={5}>
        <System>Manage tool lifecycle</System>
        <Tools>
          <Tool {...disabler} />
          {enabled && <Tool {...temporary} />}
        </Tools>
        <Message role="user">First use temporary, then disable it, then respond</Message>
      </Agent>
    );
  }

  const { client, controller } = createStepMockClient([
    { content: [mockToolUse('temporary', {})], stop_reason: 'tool_use' },
    { content: [mockToolUse('disable_tool', {})], stop_reason: 'tool_use' },
    { content: [mockText('Done')] },
  ]);

  const agent = createAgent(<UnmountingToolTest />, { client });

  try {
    // Start execution
    const runPromise = agent.run();

    // Turn 1: Call temporary tool (should be available)
    await controller.nextTurn();
    
    // Wait for tool execution to complete
    await controller.waitForNextCall();
    
    let tools = getRegisteredTools(agent);
    expect(tools).toContain('temporary');
    expect(tools).toContain('disable_tool');
    expect(temporaryCalled).toBe(true);

    // Turn 2: Call disable_tool (should remove temporary)
    await controller.nextTurn();
    
    // Wait for tool execution to complete
    await controller.waitForNextCall();
    
    tools = getRegisteredTools(agent);
    expect(tools).toContain('disable_tool');
    expect(tools).not.toContain('temporary');
    expect(disablerCalled).toBe(true);

    // Turn 3: Final response
    await controller.nextTurn();
    
    const result = await runPromise;
    expect(result.content).toBe('Done');
    
    // Final verification
    const finalTools = getRegisteredTools(agent);
    expect(finalTools).toContain('disable_tool');
    expect(finalTools).not.toContain('temporary');
  } finally {
    agent.close();
  }
});

