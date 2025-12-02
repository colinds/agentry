# Agentry

<div align="center">

**A React reconciler-based framework for declarative AI agent orchestration**

Treat agent systems like React treats UI—components: describe _what_ the system should be, the reconciler determines _how_ to execute it.

</div>

---

## What is Agentry?

Agentry brings React's declarative component model to AI agent orchestration. Just as React separates UI description from rendering, Agentry separates agent system description from execution.

Agentry uses a custom React reconciler to translate your JSX into agent execution plans.

## Quick Start

### Installation

```bash
bun add agentry react zod
```

### Your First Agent

```tsx
import { render, Agent, System, Tools, Tool, Message } from 'agentry'
import { z } from 'zod'

const result = await render(
  <Agent model="claude-haiku-4-5" maxTokens={1024}>
    <System>You are a helpful math assistant</System>
    <Tools>
      <Tool
        name="calculator"
        description="Perform calculations"
        parameters={z.object({
          operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
          a: z.number(),
          b: z.number(),
        })}
        handler={async ({ operation, a, b }) => {
          const ops = {
            add: a + b,
            subtract: a - b,
            multiply: a * b,
            divide: a / b,
          }
          return String(ops[operation])
        }}
      />
    </Tools>
    <Message role="user">What is 42 + 17?</Message>
  </Agent>,
)

console.log(result.content)
```

## Features

- **Type-safe tools** - Handler params inferred from Zod schemas
- **Declarative subagents** - Nest `<Agent>` components, auto-generate delegation tools
- **Dynamic tools via React state** - Add/remove tools during execution with `useState`
- **React hooks** - `useExecutionState()`, `useMessages()` for reactive state
- **Component composition** - Organize agent logic into reusable components
- **Streaming support** - Both pull (AsyncIterator) and push (EventEmitter) interfaces
- **Built-in tools** - `<WebSearch />`, `<CodeExecution />`, `<Memory />`, `<MCP />`

## Examples

See `packages/examples/src/` for comprehensive examples:

| Example                         | Description                             |
| ------------------------------- | --------------------------------------- |
| `basic.tsx`                     | Simple calculator tool                  |
| `interactive.tsx`               | Multi-turn conversations with streaming |
| `subagents.tsx`                 | Manager delegating to specialists       |
| `hooks.tsx`                     | Hooks, composition, and dynamic tools   |
| `dynamic-tools.tsx`             | Tools unlocked via state                |
| `web-search.tsx`                | Web search workflows                    |
| `mcp.tsx`                       | MCP server integration                  |
| `chatbot.tsx`                   | Terminal-based chatbot                  |
| `create-subagent.tsx`           | Dynamic subagent creation               |
| `create-ephemeral-subagent.tsx` | Ephemeral subagents                     |

Run an example:

```bash
echo "ANTHROPIC_API_KEY=your-key" > .env
bun run packages/examples/src/basic.tsx
```

## Core Concepts

### Batch vs Interactive Mode

**Batch mode** (default) - Runs to completion:

```tsx
const result = await render(<Agent>...</Agent>)
```

**Interactive mode** - Returns a handle for ongoing interaction:

```tsx
const agent = await render(<Agent>...</Agent>, { mode: 'interactive' })
await agent.sendMessage('Hello')
for await (const event of agent.stream('Tell me more')) {
  if (event.type === 'text') process.stdout.write(event.text)
}
agent.close()
```

### Subagents

Nested `<Agent>` components automatically become tools:

```tsx
<Agent name="manager" model="claude-haiku-4-5">
  <Tools>
    <Agent name="researcher" description="Research specialist">
      <System>You are a research expert.</System>
    </Agent>
  </Tools>
</Agent>
```

The manager can call `researcher(task)` and the framework automatically spawns and runs the child agent.

### Dynamic Tools

Tools can be added/removed during execution using React state:

```tsx
function DynamicAgent() {
  const [hasAdvanced, setHasAdvanced] = useState(false)
  return (
    <Agent model="claude-haiku-4-5">
      <Tools>
        <Tool
          name="unlock_advanced"
          parameters={z.object({})}
          handler={async () => {
            setHasAdvanced(true) // Adds new tool on next render
            return 'Unlocked!'
          }}
        />
        {hasAdvanced && <Tool name="advanced_analysis" ... />}
      </Tools>
    </Agent>
  )
}
```

## API Reference

### `render(element, options?)`

Renders an agent and returns a result or handle.

```tsx
// Batch mode
const result: AgentResult = await render(<Agent>...</Agent>)

// Interactive mode
const handle: AgentHandle = await render(<Agent>...</Agent>, {
  mode: 'interactive',
})
```

**Options:**

- `mode?: 'batch' | 'interactive'` - Execution mode (default: `'batch'`)
- `client?: Anthropic` - Custom Anthropic client

### Components

- **`<Agent>`** - Root container. Props: `model`, `name`, `description`, `maxTokens`, `temperature`, `stream`, `onComplete`, etc.
- **`<System>`** - System instructions. Props: `priority?`, `children`
- **`<Context>`** - Additional context. Props: `priority?`, `children`
- **`<Message>`** - Conversation message. Props: `role: 'user' | 'assistant'`, `children`
- **`<Tools>`** - Tool container. Props: `children`
- **`<Tool>`** - Custom tool. Props: `name`, `description`, `parameters` (Zod schema), `handler`
- **`<WebSearch />`** - Built-in web search. Props: `maxUses?`, `allowedDomains?`, `blockedDomains?`
- **`<CodeExecution />`** - Built-in code execution
- **`<Memory />`** - Built-in memory tool. Props: `onView?`, `onCreate?`, `onDelete?`, etc.
- **`<MCP />`** - MCP server connection. Props: `name`, `url`, `authorization_token?`

### Hooks

- **`useExecutionState()`** - Returns current execution state
- **`useMessages()`** - Returns conversation messages
- **`useAgentState()`** - Returns full agent state

### AgentHandle (Interactive Mode)

- `sendMessage(content: string): Promise<AgentResult>`
- `stream(message: string): AsyncGenerator<AgentStreamEvent, AgentResult>`
- `run(firstMessage?: string): Promise<AgentResult>`
- `abort(): void`
- `close(): void`
- Properties: `state`, `messages`, `isRunning`

### Utilities

- **`defineTool(options)`** - Define a tool programmatically
- **`createAgent(element, options?)`** - Create an agent handle without running

## Requirements

- Node.js 18+ or Bun
- React 19+
- TypeScript 5+
- Anthropic API Key

## Development

```bash
bun install
bun run typecheck
bun test
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
