# Agentry

<div align="center">

**A React reconciler-based framework for declarative AI agent orchestration**

Compose and reuse AI agents like React components.

</div>

---

## What is Agentry?

Agentry brings React's declarative component model to AI agent orchestration. You can design your agent's behavior declaratively and the framework will handle the execution.

> 🚧 **WIP:** This library is still in its early stages and should not be used in any sort of production environment. This project was more of a learning exercise for me to understand how the React reconciler works.

> ⚠️ Agentry currently only supports Anthropic models.

## Quick Start

### Installation

```bash
bun add agentry react zod
```

### Your First Agent

```tsx
import { run, Agent, System, Tools, Tool, Message } from 'agentry'
import { z } from 'zod'

const result = await run(
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
- **Programmatic agent spawning** - Spawn and execute agents on-demand from tool handlers using `context.runAgent()`
- **Conditional routing** (experimental) - Use `<Router>` and `<Route>` to conditionally render agent components based on state or natural language intent
- **Dynamic tools via React state** - Add/remove tools during execution with `useState`
- **Compaction control** - Automatic message compaction for long conversations to manage context window usage
- **React hooks** - `useExecutionState()`, `useMessages()` for reactive state
- **Component composition** - Organize agent logic into reusable components
- **Streaming support** - Both pull (AsyncIterator) and push (EventEmitter) interfaces
- **Prompt caching** - Supports Anthropic's prompt caching
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
| `cache-ephemeral.tsx`           | Prompt caching with ephemeral content   |
| `router.tsx`                    | Conditional routing with state and NL   |

Run an example:

```bash
echo "ANTHROPIC_API_KEY=your-key" > .env
bun run packages/examples/src/basic.tsx
```

## Core Concepts

### Batch vs Interactive Mode

**Batch mode** (default) - Runs to completion:

```tsx
const result = await run(<Agent>...</Agent>)
```

**Interactive mode** - Returns a handle for ongoing interaction:

```tsx
const agent = await run(<Agent>...</Agent>, { mode: 'interactive' })
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

Spawn agents programmatically from within tool handlers using `context.runAgent()`. This allows for conditional agent creation, parallel execution, and dynamic agent selection based on runtime data:

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
        const result = await context.runAgent(
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
    context.runAgent(<TechnicalAnalyst content={input.content} />),
    context.runAgent(<BusinessAnalyst content={input.content} />),
  ])
  return `Tech: ${techResult.content}\nBiz: ${bizResult.content}`
}}
```

### Conditional Routing

> ⚠️ **Experimental:** Router functionality is experimental and might change in future versions.

Use `<Router>` and `<Route>` to conditionally render agent components (tools, system prompts, context) based on state or natural language intent. Routes support both boolean conditions and natural language descriptions:

```tsx
function AuthAgent() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  return (
    <Agent model="claude-haiku-4-5">
      <Router>
        {/* Boolean route - evaluated synchronously */}
        <Route when={!isAuthenticated}>
          <System>Please authenticate first</System>
          <Tools>
            <Tool
              name="authenticate"
              handler={async () => {
                setIsAuthenticated(true)
                return 'Authenticated!'
              }}
            />
          </Tools>
        </Route>

        {/* Boolean route - authenticated state */}
        <Route when={isAuthenticated}>
          <System>You are authenticated</System>
          <Tools>
            <Tool name="protected_action" ... />
          </Tools>
        </Route>

        {/* Natural language route - evaluated via LLM */}
        <Route when="user wants to do math or calculations">
          <Tools>
            <Tool name="calculate" ... />
          </Tools>
        </Route>
      </Router>
    </Agent>
  )
}
```

Routes are evaluated before each API call:

- Boolean routes (`when={boolean}`) are checked first
- Natural language routes (`when="..."`) are evaluated via LLM
- Multiple routes can be active simultaneously (parallel routing)
- Active routes' children are collected into the agent configuration

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

### Prompt Caching

Use `cache="ephemeral"` on `<System>` or `<Context>` components to mark dynamic content that shouldn't be cached.

```tsx
<Agent model="claude-sonnet-4-5">
  {/* Stable instructions - will be cached */}
  <System>You are a helpful assistant. Always be concise and accurate.</System>

  {/* Dynamic context - NOT cached (ephemeral) */}
  <Context cache="ephemeral">
    Current user: {user.name}
    Current time: {new Date().toISOString()}
  </Context>

  <Message role="user">What's my name?</Message>
</Agent>
```

### Compaction Control

For long-running conversations, you can enable automatic message compaction to manage context window usage. When the token threshold is exceeded, the framework automatically summarizes previous messages:

```tsx
<Agent
  model="claude-haiku-4-5"
  compactionControl={{
    enabled: true,
    contextTokenThreshold: 100000, // Compact when total tokens exceed this
    model: 'claude-haiku-4-5', // Optional: model to use for summarization
    summaryPrompt: 'Summarize the conversation so far', // Optional: custom prompt
  }}
>
  <System>You are a helpful assistant</System>
  <Message role="user">Start a long conversation...</Message>
</Agent>
```

**CompactionControl options:**

- `enabled: boolean` - Enable/disable compaction
- `contextTokenThreshold?: number` - Token threshold to trigger compaction (default: 100000)
- `model?: Model` - Model to use for summarization (defaults to agent's model)
- `summaryPrompt?: string` - Custom prompt for summarization (optional)

## API Reference

### `run(element, options?)`

Runs an agent and returns a result or handle.

```tsx
// Batch mode
const result: AgentResult = await run(<Agent>...</Agent>)

// Interactive mode
const handle: AgentHandle = await run(<Agent>...</Agent>, {
  mode: 'interactive',
})
```

**Options:**

- `mode?: 'batch' | 'interactive'` - Execution mode (default: `'batch'`)
- `client?: Anthropic` - Custom Anthropic client

### Components

- **`<Agent>`** - Root container. Props: `model`, `name`, `description`, `maxTokens`, `temperature`, `stream`, `onComplete`, `compactionControl`, etc.
- **`<System>`** - System instructions. Props: `children`, `cache?: 'ephemeral'`
- **`<Context>`** - Additional context. Props: `children`, `cache?: 'ephemeral'`
- **`<Message>`** - Conversation message. Props: `role: 'user' | 'assistant'`, `children`
- **`<Tools>`** - Tool container. Props: `children`
- **`<Tool>`** - Custom tool. Props: `name`, `description`, `parameters` (Zod schema), `handler`. The handler receives `(input, context)` where `context` includes `runAgent()` for programmatic agent spawning
- **`<AgentTool>`** - Subagent tool. Props: `name`, `description`, `parameters` (Zod schema), `agent` (function that receives parsed params and returns `<Agent>` JSX)
- **`<Router>`** - Conditional routing container. Props: `children`
- **`<Route>`** - Conditional route. Props: `when: boolean | string`, `children`. Boolean routes evaluate synchronously; string routes are evaluated via LLM based on conversation context
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
- **`createRunAgent(context)`** - Create a `runAgent` function bound to an execution context (used internally by ToolContext)

### ToolContext

Tool handlers receive a `context` object with the following properties:

- `agentName: string` - Name of the current agent
- `client: Anthropic` - Anthropic client instance
- `model?: Model` - Current agent's model
- `signal?: AbortSignal` - Abort signal for cancellation
- `metadata?: Record<string, unknown>` - Custom metadata
- `runAgent(agent, options?): Promise<AgentResult>` - Run an agent programmatically

**Example:**

```tsx
<Tool
  name="research"
  handler={async (input, context) => {
    const result = await context.runAgent(
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
