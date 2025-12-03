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
- **Declarative subagents** - Use `<AgentTool>` to create subagents with type-safe parameters
- **Programmatic agent spawning** - Spawn and execute agents on-demand from tool handlers using `context.spawnAgent()`
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
| `programmatic-spawn.tsx`        | Programmatic agent spawning from tools  |

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

Create subagents using `<AgentTool>` with type-safe parameters:

```tsx
<Agent name="manager" model="claude-haiku-4-5">
  <Tools>
    <AgentTool
      name="researcher"
      description="Research specialist"
      parameters={z.object({
        topic: z.string().describe('The topic to research'),
      })}
      agent={(input) => (
        <Agent name="researcher">
          <System>You are a research expert.</System>
          <Message role="user">Research: {input.topic}</Message>
        </Agent>
      )}
    />
  </Tools>
</Agent>
```

The manager can call `researcher(topic="...")` and the framework spawns and runs the subagent with the provided parameters.

### Programmatic Agent Spawning

Spawn agents programmatically from within tool handlers using `context.spawnAgent()`. This allows for conditional agent creation, parallel execution, and dynamic agent selection based on runtime data:

```tsx
<Agent model="claude-haiku-4-5">
  <Tools>
    <Tool
      name="analyze_code"
      description="Analyze code by spawning a specialist agent"
      parameters={z.object({
        code: z.string(),
        language: z.enum(['python', 'typescript', 'rust']),
      })}
      handler={async (input, context) => {
        // Spawn different agents based on language
        const result = await context.spawnAgent(
          input.language === 'python' ? (
            <Agent name="python-expert">
              <System>You are a Python expert</System>
              <Message role="user">Analyze: {input.code}</Message>
            </Agent>
          ) : (
            <Agent name="typescript-expert">
              <System>You are a TypeScript expert</System>
              <Message role="user">Analyze: {input.code}</Message>
            </Agent>
          ),
        )
        return result.content
      }}
    />
  </Tools>
</Agent>
```

You can also spawn multiple agents in parallel:

```tsx
handler={async (input, context) => {
  const [techResult, bizResult] = await Promise.all([
    context.spawnAgent(<TechnicalAnalyst content={input.content} />),
    context.spawnAgent(<BusinessAnalyst content={input.content} />),
  ])
  return `Tech: ${techResult.content}\nBiz: ${bizResult.content}`
}}
```

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
- **`<Tool>`** - Custom tool. Props: `name`, `description`, `parameters` (Zod schema), `handler`. The handler receives `(input, context)` where `context` includes `spawnAgent()` for programmatic agent spawning
- **`<AgentTool>`** - Subagent tool. Props: `name`, `description`, `parameters` (Zod schema), `agent` (function that receives parsed params and returns `<Agent>` JSX)
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
- **`defineAgentTool(options)`** - Define a subagent tool programmatically
- **`createAgent(element, options?)`** - Create an agent handle without running
- **`createSpawnAgent(context)`** - Create a `spawnAgent` function bound to an execution context (used internally by ToolContext)

### ToolContext

Tool handlers receive a `context` object with the following properties:

- `agentName: string` - Name of the current agent
- `client: Anthropic` - Anthropic client instance
- `model?: Model` - Current agent's model
- `signal?: AbortSignal` - Abort signal for cancellation
- `metadata?: Record<string, unknown>` - Custom metadata
- `spawnAgent(agent, options?): Promise<AgentResult>` - Spawn and execute an agent programmatically

**Example:**

```tsx
<Tool
  name="research"
  handler={async (input, context) => {
    const result = await context.spawnAgent(
      <Agent name="researcher">
        <System>You are a research expert</System>
        <Message role="user">Research: {input.topic}</Message>
      </Agent>,
      { maxTokens: 2048 }, // Optional: override configuration
    )
    return result.content
  }}
/>
```

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
