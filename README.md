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
- **Structured outputs** - Use `strict` on tools for guaranteed schema compliance
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

#### `<Agent>`

| Prop                 | Type                                         | Description                              |
| -------------------- | -------------------------------------------- | ---------------------------------------- |
| `model`              | `string`                                     | Claude model (e.g. `claude-sonnet-4-5`)  |
| `name?`              | `string`                                     | Agent identifier                         |
| `description?`       | `string`                                     | Agent description                        |
| `maxTokens?`         | `number`                                     | Max output tokens (default: `4096`)      |
| `maxIterations?`     | `number`                                     | Max tool call iterations (default: `20`) |
| `stopSequences?`     | `string[]`                                   | Stop sequences                           |
| `temperature?`       | `number`                                     | Sampling temperature (0-1)               |
| `stream?`            | `boolean`                                    | Enable streaming (default: `true`)       |
| `betas?`             | `string[]`                                   | Additional beta features to enable       |
| `thinking?`          | `{ type: 'enabled', budget_tokens: number }` | Extended thinking config                 |
| `compactionControl?` | `CompactionControl`                          | Context compaction settings (see below)  |
| `onMessage?`         | `(event: AgentStreamEvent) => void`          | Stream event callback                    |
| `onComplete?`        | `(result: AgentResult) => void`              | Completion callback                      |
| `onError?`           | `(error: Error) => void`                     | Error callback                           |
| `onStepFinish?`      | `(result: OnStepFinishResult) => void`       | Step completion callback                 |

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

#### `<Router>`

| Prop       | Type        | Description      |
| ---------- | ----------- | ---------------- |
| `children` | `ReactNode` | Route components |

#### `<Route>`

| Prop       | Type                | Description                                            |
| ---------- | ------------------- | ------------------------------------------------------ |
| `when`     | `boolean \| string` | Condition (boolean or NL description evaluated by LLM) |
| `children` | `ReactNode`         | Route content (tools, system, context)                 |

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

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
