# Agentry

A **React reconciler-based framework** for declarative AI agent orchestration. Treat agent systems like React treats UI—components describe *what* the system should be, the reconciler determines *how* to execute it.

## Philosophy

Separate React's reconciliation from agent execution (inspired by react-three-fiber). Messages flow reactively, execution happens outside React's scheduler.

## Quick Start

```tsx
import { render, Agent, System, Tools, Tool } from '@agentry/runtime';
import { z } from 'zod';

const result = await render(
  <Agent model="claude-haiku-4-5" maxTokens={1024}>
    <System>You are a helpful math assistant</System>
    <Tools>
      <Tool
        name="calculator"
        description="Perform calculations"
        inputSchema={z.object({
          operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
          a: z.number(),
          b: z.number(),
        })}
        handler={async ({ operation, a, b }) => {
          const ops = { add: a + b, subtract: a - b, multiply: a * b, divide: a / b };
          return String(ops[operation]);
        }}
      />
    </Tools>
  </Agent>
);

console.log(result.content);
```

## Features

- **Type-safe tools** - Handler params inferred from Zod schemas
- **Declarative subagents** - Nest `<Agent>` components, auto-generate delegation tools
- **Dynamic tools via React state** - Add/remove tools during execution with `useState`
- **React hooks** - `useExecutionState()`, `useMessages()` for reactive state
- **Component composition** - Organize agent logic into reusable components
- **Streaming support** - Both pull (AsyncIterator) and push (EventEmitter) interfaces

## Installation

```bash
bun add @agentry/runtime react zod
```

## Package Structure

- `@agentry/core` - Types, reconciler, execution engine
- `@agentry/components` - React components (`<Agent>`, `<Tool>`, `<System>`, etc.)
- `@agentry/runtime` - Public API (`render()`, `AgentHandle`, hooks)
- `@agentry/shared` - Shared constants

## Examples

### Inline Tool Definition

Define tools directly in JSX with `inputSchema`:

```tsx
<Tool
  name="get_weather"
  description="Get weather for a location"
  inputSchema={z.object({
    location: z.string().describe('City name'),
  })}
  handler={async ({ location }) => {
    return `Weather in ${location}: 72°F, sunny`;
  }}
/>
```

### Dynamic Tools with React State

Tools can be added/removed during execution using React's state:

```tsx
function DynamicAgent() {
  const [hasAdvanced, setHasAdvanced] = useState(false);

  return (
    <Agent model="claude-haiku-4-5">
      <Tools>
        <Tool
          name="unlock_advanced"
          description="Unlock advanced features"
          inputSchema={z.object({})}
          handler={async () => {
            setHasAdvanced(true);  // Triggers re-render, adds new tool
            return 'Advanced features unlocked!';
          }}
        />
        {hasAdvanced && (
          <Tool
            name="advanced_analysis"
            description="Perform advanced analysis"
            inputSchema={z.object({ data: z.string() })}
            handler={async ({ data }) => `Analysis of: ${data}`}
          />
        )}
      </Tools>
    </Agent>
  );
}
```

### Hooks for State Tracking

Access agent state from within components:

```tsx
import { useExecutionState, useMessages } from '@agentry/runtime';

function ExecutionMonitor() {
  const state = useExecutionState();
  const messages = useMessages();

  useEffect(() => {
    console.log(`Status: ${state.status}, Messages: ${messages.length}`);
  }, [state.status, messages.length]);

  return null;
}

// Use inside Agent tree
<Agent model="claude-haiku-4-5">
  <ExecutionMonitor />
  <System>You are helpful</System>
</Agent>
```

### Declarative Subagents

Nested `<Agent>` components automatically become tools:

```tsx
<Agent model="claude-haiku-4-5" name="manager" maxTokens={4096}>
  <System>You delegate to specialists</System>
  <Tools>
    {/* Becomes a tool: researcher(task) */}
    <Agent
      name="researcher"
      description="Research specialist"
      temperature={0.7}
    >
      <System>You are a research expert.</System>
    </Agent>

    {/* Becomes a tool: coder(task) */}
    <Agent
      name="coder"
      description="Code generation specialist"
      temperature={0.3}
    >
      <System>You write clean code.</System>
    </Agent>
  </Tools>
</Agent>
```

### More Examples

See `packages/examples/src/`:

| Example | Description |
|---------|-------------|
| `basic.tsx` | Simple calculator tool |
| `hooks.tsx` | Hooks, composition, subagents, dynamic tools |
| `dynamic-tools.tsx` | Tools unlocked via state |
| `subagents.tsx` | Manager delegating to specialists |
| `interactive.tsx` | Multi-turn conversations |

Run an example:

```bash
echo "ANTHROPIC_API_KEY=your-key" > .env
bun run packages/examples/src/hooks.tsx
```

## Development

```bash
bun install
bun tsc --noEmit
```

## Project Structure

```
packages/
├── core/           # Reconciler, execution engine, types
├── components/     # React components
├── runtime/        # Public API, hooks
├── shared/         # Shared constants
└── examples/       # Example agents
```
