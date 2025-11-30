# Agentry

A **React reconciler-based framework** for declarative AI agent orchestration. Treat agent systems like React treats UI—components describe *what* the system should be, the reconciler determines *how* to execute it.

## Philosophy

Separate React's reconciliation from agent execution (inspired by react-three-fiber). Messages flow reactively, execution happens outside React's scheduler.

## Quick Start

```tsx
import { render, defineTool, Agent, System, Tools, Tool } from '@agentry/runtime';
import { z } from 'zod';

// define type-safe tools
const calculator = defineTool({
  name: 'calculator',
  description: 'Perform calculations',
  parameters: z.object({
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
    a: z.number(),
    b: z.number(),
  }),
  handler: async ({ operation, a, b }) => {
    // params are fully typed!
    const ops = {
      add: a + b,
      subtract: a - b,
      multiply: a * b,
      divide: b !== 0 ? a / b : NaN,
    };
    return String(ops[operation]);
  },
});

// batch mode - runs to completion
const result = await render(
  <Agent model="claude-sonnet-4-5-20250514" maxTokens={1024}>
    <System>You are a helpful math assistant</System>
    <Tools>
      <Tool {...calculator} />
    </Tools>
  </Agent>
);

console.log(result.content);
```

## Features

✅ **Type-safe tools** - Handler params inferred from Zod schemas
✅ **Declarative subagents** - Nest `<Agent>` components, auto-generate delegation tools
✅ **Dynamic tool updates** - Add/remove tools during execution via `context.updateTools()`
✅ **Clean JSX API** - Declarative component tree
✅ **Streaming support** - Both pull (AsyncIterator) and push (EventEmitter) interfaces
✅ **Token management** - SDK CompactionControl for long conversations
✅ **Built-in tools** - WebSearch, context-management, MCP support
✅ **Mock testing** - Test without API costs using `createMockClient()`

## Installation

```bash
bun add @agentry/runtime react zod
```

## Package Structure

- `@agentry/core` - Types, reconciler, execution engine
- `@agentry/components` - React components (`<Agent>`, `<Tool>`, `<System>`, etc.)
- `@agentry/runtime` - Public API (`render()`, `AgentHandle`)

## Examples

### Declarative Subagents

Nested `<Agent>` components automatically become tools. **Settings propagate automatically**:

```tsx
import { render, Agent, System, Tools } from '@agentry/runtime';

const result = await render(
  <Agent
    model="claude-sonnet-4-5-20250514"
    name="manager"
    stream={false}        // propagates to all children
    temperature={0.7}     // propagates to all children
    maxTokens={4096}      // children get half (2048)
  >
    <System>You are a project manager who delegates to specialists</System>

    <Tools>
      {/* child agent becomes a tool: researcher(task, context?) */}
      {/* inherits: stream=false, temperature=0.7, maxTokens=2048 */}
      <Agent
        name="researcher"
        model="claude-sonnet-4-5-20250514"
        description="Deep research specialist"
      >
        <System>You are a research expert. Provide thorough analysis.</System>
        <Tools><WebSearch /></Tools>
      </Agent>

      {/* can override inherited settings */}
      <Agent
        name="coder"
        model="claude-sonnet-4-5-20250514"
        description="Code generation specialist"
        temperature={0.3}  // override: use lower temperature for coding
      >
        <System>You are a coding expert. Write production-ready code.</System>
      </Agent>
    </Tools>

    <Message role="user">
      Research React reconcilers, then generate an example implementation
    </Message>
  </Agent>
);

// Manager delegates: "Use researcher to learn about reconcilers"
// Researcher runs independently with inherited settings, returns text
// Manager uses that to inform: "Use coder to implement based on research"
```

### Dynamic Tool Updates

Tools can add new tools during execution:

```tsx
const learnTool = defineTool({
  name: 'learn_skill',
  parameters: z.object({ skill: z.string() }),
  handler: async ({ skill }, context) => {
    // create a new tool on the fly
    const newTool = defineTool({
      name: `use_${skill}`,
      description: `Apply the ${skill} skill`,
      parameters: z.object({ input: z.string() }),
      handler: async ({ input }) => `Applied ${skill} to: ${input}`,
    });

    // inject into running agent
    context.updateTools?.([{ type: 'add', tool: newTool }]);

    return `Learned ${skill}. New tool 'use_${skill}' available.`;
  },
});

<Agent model="claude-sonnet-4-5-20250514">
  <Tools><Tool {...learnTool} /></Tools>
  <Message role="user">
    Learn web scraping, then use it to scrape example.com
  </Message>
</Agent>

// Turn 1: Calls learn_skill, adds use_web_scraping tool
// Turn 2: Calls use_web_scraping (now available)
```

### Testing Without API Costs

```tsx
import { createMockClient, mockText, mockToolUse } from '@agentry/runtime';

const mockClient = createMockClient([
  { content: [mockToolUse('search', { query: 'test' })], stop_reason: 'tool_use' },
  { content: [mockText('Results found')] },
]);

const result = await render(
  <Agent model="claude-sonnet-4-5-20250514">
    <Tools><Tool {...searchTool} /></Tools>
  </Agent>,
  { client: mockClient }  // no API calls made
);
```

### More Examples

See the `examples/` directory:

- `basic.tsx` - Simple calculator tool with batch mode
- `interactive.tsx` - Interactive mode with streaming

Run an example:

```bash
# set your API key
echo "ANTHROPIC_API_KEY=your-key-here" > .env

# run an example
bun examples/basic.tsx
```

## Development

```bash
# install dependencies
bun install

# type check
bun tsc --noEmit

# run tests
bun test
```
