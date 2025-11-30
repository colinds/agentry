# Agentry Examples

This directory contains examples demonstrating different features of Agentry.

## Running Examples

```bash
# Set your API key in .env file at project root
echo "ANTHROPIC_API_KEY=your-key-here" > .env

# Run examples from project root
bun packages/examples/src/basic.tsx
bun packages/examples/src/interactive.tsx
bun packages/examples/src/web-search.tsx
bun packages/examples/src/subagents.tsx
bun packages/examples/src/chatbot.tsx
```

## Examples

### basic.tsx
Simple calculator tool in batch mode. Demonstrates:
- Tool definition with Zod schemas
- Type-safe tool parameters
- Batch execution (runs to completion)
- Basic agent configuration

### interactive.tsx
Interactive mode with streaming. Demonstrates:
- Interactive multi-turn conversations
- Streaming responses
- Built-in WebSearch tool
- Agent handle usage for ongoing interaction

### web-search.tsx
Real-world web search patterns with analysis workflows. Demonstrates:
- WebSearch built-in tool with different configurations
- Using search results to inform subsequent actions
- Component composition for organizing search capabilities
- useExecutionState() and useMessages() hooks
- Multi-step research and analysis pipelines
- Domain filtering and location-based search
- Tools for analyzing and comparing search results

### subagents.tsx
Nested agent delegation. Demonstrates:
- Declarative subagents (agents as tools)
- Settings inheritance and overrides
- Multi-agent orchestration
- Manager-specialist pattern

### chatbot.tsx
Simple interactive chatbot. Demonstrates:
- Interactive mode with multi-turn conversations
- Real-time streaming responses
- Custom tools (calculator) integrated into chat
- Simple readline-based terminal interface
- Error handling and graceful exit

```bash
bun packages/examples/src/chatbot.tsx
```

## Key Concepts

### Batch vs Interactive Mode

**Batch mode** (default):
```tsx
const result = await render(<Agent>...</Agent>);
// Runs to completion, returns final result
```

**Interactive mode**:
```tsx
const agent = await render(<Agent>...</Agent>, { mode: 'interactive' });
await agent.sendMessage('Hello');
await agent.sendMessage('Follow-up');
agent.close();
```

### Tool Definition

Define type-safe tools with Zod schemas:

```tsx
import { defineTool } from '@agentry/runtime';
import { z } from 'zod';

const myTool = defineTool({
  name: 'my_tool',
  description: 'Does something useful',
  parameters: z.object({
    input: z.string().describe('The input'),
    count: z.number().optional().default(5),
  }),
  handler: async ({ input, count }) => {
    // Parameters are fully typed!
    return `Processed ${input} ${count} times`;
  },
});

// Use in agent
<Agent model="claude-haiku-4-5-20250514">
  <Tools>
    <Tool {...myTool} />
  </Tools>
</Agent>
```

### Subagents

Nested `<Agent>` components automatically become tools:

```tsx
<Agent name="manager" model="claude-haiku-4-5-20250514">
  <Tools>
    <Agent
      name="researcher"
      description="Research specialist"
    >
      <System>You are a research expert.</System>
    </Agent>
  </Tools>
</Agent>
```

The manager can call `researcher(task, context?)` and the framework automatically spawns the child agent, runs it independently, and returns the result.

### Settings Inheritance

Child agents inherit settings from parents:
- `stream`, `temperature`, `stopSequences` → inherited as-is
- `maxTokens`, `maxIterations` → halved for children
- Can override any inherited setting explicitly

```tsx
<Agent maxTokens={4096} temperature={0.7}>
  {/* Inherits: maxTokens=2048, temperature=0.7 */}
  <Agent name="child1" />

  {/* Override: temperature=0.3, still inherits maxTokens=2048 */}
  <Agent name="child2" temperature={0.3} />
</Agent>
```

### Streaming

In interactive mode, you can stream responses. **Note:** `stream()` always requires a message parameter.

```tsx
const agent = await render(<Agent stream={true}>...</Agent>, { mode: 'interactive' });

// Stream with a message (message parameter is required)
for await (const event of agent.stream('What is 2+2?')) {
  if (event.type === 'text') {
    process.stdout.write(event.text);
  } else if (event.type === 'tool_use_start') {
    console.log(`\nCalling tool: ${event.toolName}`);
  }
}

// Continue conversation (always pass a message)
for await (const event of agent.stream('What about 3+3?')) {
  if (event.type === 'text') {
    process.stdout.write(event.text);
  }
}

// Or use sendMessage() for non-streaming
const result = await agent.sendMessage('Final question');
```

### System Prompts and Context

System prompts and context support priorities for compaction:

```tsx
<Agent model="claude-haiku-4-5-20250514">
  <System priority={1000}>Core instructions (high priority)</System>
  <Context priority={500}>User info (medium priority)</Context>
  <System priority={100}>Optional guidelines (low priority)</System>
</Agent>
```

Higher priority content survives longer when context needs to be compacted.

## Model Selection

All examples use `claude-haiku-4-5-20250514` which is Anthropic's most cost-effective Claude 4.5 model. For production use, you may want to use:
- `claude-haiku-4-5-20250514` - Fastest and most cost-effective
- `claude-sonnet-4-5-20250514` - Highest capability and performance

## Next Steps

- Check out the [main README](../../README.md) for architecture details
- Explore the [package source code](../) to see implementation
- Build your own multi-agent workflows!
