# Agentry 🤖 🏗️

<div align="center">

**Compose and reuse your AI agents like React components.**

</div>

---

## What is Agentry?

Agentry adapts React’s component model for AI agents. Define behavior declaratively, compose agents like you would components, and let the framework manage the flow and execution.

> 🚧 **WIP:** This library is still in its early stages and should not be used in any sort of production environment at this time.

> ⚠️ Agentry currently only supports Anthropic models.

## Quick Start

### Installation

```bash
bun add agentry react zod
```

### Creating an Agent

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

- **Dynamic tools via React state** - Add/remove tools during execution with `useState`
- **React hooks** - `useExecutionState()`, `useMessages()` for reactive state
- **Declarative subagents** - Use `<AgentTool>` to create subagents with type-safe parameters
- **Type-safe tools** - Handler params inferred from Zod schemas
- **Streaming support** - Stream responses
- **Programmatic agent spawning** - Spawn and execute agents on-demand from tool handlers using `context.runAgent()`
- **Compaction control** - Automatic message compaction for long conversations to manage context window usage
- **Conditional rendering** - Use `<Condition>` to conditionally render agent components based on state or natural language intent
- **Structured outputs** - Use `strict` on tools
- **Prompt caching** - Supports Anthropic's prompt caching
- **Built-in tools** - `<WebSearch />`, `<CodeExecution />`, `<Memory />`, `<MCP />`

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

### State-Driven Tools

Tools can be added/removed during execution using React state:

```tsx
function DynamicAgent() {
  const [hasAdvanced, setHasAdvanced] = useState(false)
  return (
    <Agent model="claude-haiku-4-5">
      <System>
        You are a helpful assistant that can analyze technical and business content.
        You can unlock advanced analysis tools by calling the unlock_advanced tool.
      </System>
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
      <Message role="user">Analyze the following content: {input.content}</Message>
    </Agent>
  )
}
```

### Conditions

> ⚠️ **Experimental:** `<Condition />` is experimental and might change in future versions.

Use `<Condition>` to conditionally render agent components based on state or natural language intent. Conditions support both boolean and natural language evaluation:

```tsx
function AuthAgent() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isPremium, setIsPremium] = useState(false)

  return (
    <Agent model="claude-haiku-4-5">
      {/* Boolean condition */}
      <Condition when={!isAuthenticated}>
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
      </Condition>

      <Condition when={isAuthenticated}>
        <System>You are authenticated</System>
        <Tools>
          <Tool name="protected_action" ... />
        </Tools>

        {/* Nested condition - only accessible when authenticated AND premium */}
        <Condition when={isPremium}>
          <System>Premium features enabled</System>
          <Tools>
            <Tool name="premium_feature" ... />
          </Tools>
        </Condition>
      </Condition>

      {/* Natural language condition - evaluated via LLM */}
      <Condition when="user wants to do math or calculations">
        <Tools>
          <Tool name="calculate" ... />
        </Tools>
      </Condition>
    </Agent>
  )
}
```

Conditions are evaluated before each API call:

- Boolean conditions (`when={boolean}`) are checked first
- Natural language conditions (`when="..."`) are evaluated via LLM

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

## Examples

See `packages/examples/src/` for comprehensive examples:

| Example                                                                                | Description                             |
| -------------------------------------------------------------------------------------- | --------------------------------------- |
| [`basic.tsx`](packages/examples/src/basic.tsx)                                         | Simple calculator tool                  |
| [`interactive.tsx`](packages/examples/src/interactive.tsx)                             | Multi-turn conversations with streaming |
| [`subagents.tsx`](packages/examples/src/subagents.tsx)                                 | Manager delegating to specialists       |
| [`hooks.tsx`](packages/examples/src/hooks.tsx)                                         | Hooks, composition, and dynamic tools   |
| [`dynamic-tools.tsx`](packages/examples/src/dynamic-tools.tsx)                         | Tools unlocked via state                |
| [`web-search.tsx`](packages/examples/src/web-search.tsx)                               | Web search workflows                    |
| [`mcp.tsx`](packages/examples/src/mcp.tsx)                                             | MCP server integration                  |
| [`chatbot.tsx`](packages/examples/src/chatbot.tsx)                                     | Terminal-based chatbot                  |
| [`create-subagent.tsx`](packages/examples/src/create-subagent.tsx)                     | Dynamic subagent creation               |
| [`create-ephemeral-subagent.tsx`](packages/examples/src/create-ephemeral-subagent.tsx) | Ephemeral subagents                     |
| [`programmatic-spawn.tsx`](packages/examples/src/programmatic-spawn.tsx)               | Programmatic agent spawning from tools  |
| [`cache-ephemeral.tsx`](packages/examples/src/cache-ephemeral.tsx)                     | Prompt caching with ephemeral content   |
| [`router.tsx`](packages/examples/src/router-demo.tsx)                                  | Conditional routing with state and NL   |

Run an example:

```bash
echo "ANTHROPIC_API_KEY=your-key" > .env
bun run example:basic
```

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

#### `<Agent>`

| Prop                 | Type                                         | Description                                  |
| -------------------- | -------------------------------------------- | -------------------------------------------- |
| `model`              | `string`                                     | Claude model (e.g. `claude-sonnet-4-5`)      |
| `name?`              | `string`                                     | Agent identifier                             |
| `description?`       | `string`                                     | Agent description                            |
| `maxTokens?`         | `number`                                     | Max output tokens (default: `4096`)          |
| `maxIterations?`     | `number`                                     | Max tool call iterations (default: `20`)     |
| `stopSequences?`     | `string[]`                                   | Stop sequences                               |
| `temperature?`       | `number`                                     | Sampling temperature (0-1)                   |
| `stream?`            | `boolean`                                    | Enable streaming (default: `true`)           |
| `betas?`             | `string[]`                                   | Additional Anthropic beta features to enable |
| `thinking?`          | `{ type: 'enabled', budget_tokens: number }` | Extended thinking config                     |
| `compactionControl?` | `CompactionControl`                          | Context compaction settings (see below)      |
| `onMessage?`         | `(event: AgentStreamEvent) => void`          | Stream event callback                        |
| `onComplete?`        | `(result: AgentResult) => void`              | Completion callback                          |
| `onError?`           | `(error: Error) => void`                     | Error callback                               |
| `onStepFinish?`      | `(result: OnStepFinishResult) => void`       | Step completion callback                     |

**CompactionControl:**

| Field                    | Type      | Description                                      |
| ------------------------ | --------- | ------------------------------------------------ |
| `enabled`                | `boolean` | Enable/disable compaction                        |
| `contextTokenThreshold?` | `number`  | Token threshold to trigger (default: `100000`)   |
| `model?`                 | `string`  | Model for summarization (default: agent's model) |
| `summaryPrompt?`         | `string`  | Custom summary prompt                            |

#### `<System>` / `<Context>`

| Prop       | Type          | Description                              |
| ---------- | ------------- | ---------------------------------------- |
| `children` | `ReactNode`   | Content                                  |
| `cache?`   | `'ephemeral'` | Mark as non-cacheable for prompt caching |

#### `<Message>`

| Prop       | Type                    | Description     |
| ---------- | ----------------------- | --------------- |
| `role`     | `'user' \| 'assistant'` | Message role    |
| `children` | `ReactNode`             | Message content |

#### `<Tools>`

| Prop       | Type        | Description     |
| ---------- | ----------- | --------------- |
| `children` | `ReactNode` | Tool components |

#### `<Tool>`

| Prop          | Type                                                   | Description                                   |
| ------------- | ------------------------------------------------------ | --------------------------------------------- |
| `name`        | `string`                                               | Tool name                                     |
| `description` | `string`                                               | Description for the model                     |
| `parameters`  | `ZodSchema`                                            | Zod schema for input validation               |
| `strict?`     | `boolean`                                              | Enable structured outputs (auto-enables beta) |
| `handler`     | `(input, context: ToolContext) => Promise<ToolResult>` | Tool handler                                  |

#### `<AgentTool>`

| Prop          | Type                             | Description                     |
| ------------- | -------------------------------- | ------------------------------- |
| `name`        | `string`                         | Tool name                       |
| `description` | `string`                         | Description for the model       |
| `parameters`  | `ZodSchema`                      | Zod schema for input validation |
| `agent`       | `(input) => ReactElement<Agent>` | Function returning the Agent    |

#### `<Condition>`

| Prop       | Type                | Description                                            |
| ---------- | ------------------- | ------------------------------------------------------ |
| `when`     | `boolean \| string` | Condition (boolean or NL description evaluated by LLM) |
| `children` | `ReactNode`         | Content to render when condition is true               |

#### `<WebSearch>`

| Prop              | Type                                                                      | Description                    |
| ----------------- | ------------------------------------------------------------------------- | ------------------------------ |
| `maxUses?`        | `number`                                                                  | Max searches allowed           |
| `allowedDomains?` | `string[]`                                                                | Restrict to these domains      |
| `blockedDomains?` | `string[]`                                                                | Block these domains            |
| `userLocation?`   | `{ city?: string, region?: string, country?: string, timezone?: string }` | Location for localized results |

#### `<CodeExecution>`

No props. Enables sandboxed code execution.

#### `<Memory>`

| Prop            | Type                                                                                     | Description                 |
| --------------- | ---------------------------------------------------------------------------------------- | --------------------------- |
| `onView?`       | `(input: { path: string, view_range?: [number, number] }) => Promise<string>`            | View file/directory handler |
| `onCreate?`     | `(input: { path: string, file_text: string }) => Promise<string>`                        | Create file handler         |
| `onStrReplace?` | `(input: { path: string, old_str: string, new_str: string }) => Promise<string>`         | Replace text handler        |
| `onInsert?`     | `(input: { path: string, insert_line: number, insert_text: string }) => Promise<string>` | Insert text handler         |
| `onDelete?`     | `(input: { path: string }) => Promise<string>`                                           | Delete file handler         |
| `onRename?`     | `(input: { old_path: string, new_path: string }) => Promise<string>`                     | Rename/move handler         |

#### `<MCP>`

| Prop                   | Type                                              | Description           |
| ---------------------- | ------------------------------------------------- | --------------------- |
| `name`                 | `string`                                          | Server name           |
| `url`                  | `string`                                          | SSE endpoint URL      |
| `authorization_token?` | `string`                                          | Auth token            |
| `tool_configuration?`  | `{ enabled?: boolean, allowed_tools?: string[] }` | Tool filtering config |

### Hooks

| Hook                  | Returns              | Description             |
| --------------------- | -------------------- | ----------------------- |
| `useExecutionState()` | `AgentState`         | Current execution state |
| `useMessages()`       | `BetaMessageParam[]` | Conversation messages   |
| `useAgentState()`     | `AgentStoreState`    | Full agent state        |

### AgentHandle (Interactive Mode)

| Method / Property      | Type                                                        | Description                     |
| ---------------------- | ----------------------------------------------------------- | ------------------------------- |
| `sendMessage(content)` | `(string) => Promise<AgentResult>`                          | Send a message and get response |
| `stream(message)`      | `(string) => AsyncGenerator<AgentStreamEvent, AgentResult>` | Stream a response               |
| `run(firstMessage?)`   | `(string?) => Promise<AgentResult>`                         | Run agent to completion         |
| `abort()`              | `() => void`                                                | Abort current execution         |
| `close()`              | `() => void`                                                | Clean up resources              |
| `state`                | `AgentState`                                                | Current execution state         |
| `messages`             | `BetaMessageParam[]`                                        | Conversation history            |
| `isRunning`            | `boolean`                                                   | Whether agent is processing     |

### Utilities

| Function                         | Description                                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------------------------- |
| `defineTool(options)`            | Define a tool programmatically. Options: `name`, `description`, `parameters`, `strict?`, `handler` |
| `defineAgentTool(options)`       | Define a subagent tool. Options: `name`, `description`, `parameters`, `agent`                      |
| `createAgent(element, options?)` | Create an agent handle without running                                                             |

### ToolContext

Tool handlers receive a `context` object:

| Property    | Type                                                                       | Description                   |
| ----------- | -------------------------------------------------------------------------- | ----------------------------- |
| `agentName` | `string`                                                                   | Name of the current agent     |
| `client`    | `Anthropic`                                                                | Anthropic client instance     |
| `model?`    | `string`                                                                   | Current agent's model         |
| `signal?`   | `AbortSignal`                                                              | Abort signal for cancellation |
| `metadata?` | `Record<string, unknown>`                                                  | Custom metadata               |
| `runAgent`  | `(agent: ReactElement, options?: RunAgentOptions) => Promise<AgentResult>` | Run an agent programmatically |

**RunAgentOptions:**

| Field          | Type          | Description             |
| -------------- | ------------- | ----------------------- |
| `model?`       | `string`      | Override parent's model |
| `maxTokens?`   | `number`      | Override max tokens     |
| `temperature?` | `number`      | Override temperature    |
| `signal?`      | `AbortSignal` | Custom abort signal     |

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

## FAQ

### Why call it "Agentry"?

Agent 🤖 + Gantry 🏗️

### Why make this?

I wanted to build an AI Agent and was exploring different ways to represent one. I started sketching it out in React and realized the component model made composition and structure really intuitive. React's concepts like hooks, lifecycles, and state made developing the functionality straightforward. Since I wanted it to feel just like writing React, it was the perfect excuse to dig into how the React Reconciler works under the hood and how I could use it for this project.

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
