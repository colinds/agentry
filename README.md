# Agentry 🤖 🏗️

<div align="center">

**Compose and reuse your AI agents like React components.**

</div>

---

[![npm version][npm-version-src]][npm-version-href]
[![GitHub Actions][github-actions-src]][github-actions-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]

## What is Agentry?

Agentry adapts React’s component model for AI agents. Define behavior declaratively, compose agents like you would components, and let the framework manage the flow and execution.

> [!WARNING]
> This library is in active development.

## Quick Start

### Installation

```bash
bun add agentry react zod
# Set one or both provider keys
export ANTHROPIC_API_KEY="sk-ant-***"
export OPENAI_API_KEY="sk-***"
```

Next, in your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "react",
    "module": "ESNext",
    "target": "ESNext",
    "moduleResolution": "bundler"
  }
}
```

### Creating an Agent

In `agent.tsx`:

```tsx
import { run, Agent, System, Tools, Tool, Message } from 'agentry'
import { anthropic } from 'agentry/anthropic'
import { z } from 'zod'

const result = await run(
  <Agent provider="anthropic" model="claude-haiku-4-5" maxTokens={1024}>
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
  {
    clients: { anthropic: anthropic() },
  },
)

console.log(result.content)
```

Run it:

```bash
bun run agent.tsx
```

## Features

- **Dynamic tools via React state** - Add/remove tools during execution with `useState`
- **React hooks** - `useExecutionState()`, `useMessages()` for reactive state
- **Declarative subagents** - Use `<AgentTool>` to create subagents with type-safe parameters
- **Type-safe tools** - Handler params inferred from Zod schemas
- **Streaming support** - Stream responses
- **Programmatic agent spawning** - Spawn and execute agents on-demand from tool handlers using `context.runAgent()`
- **Cross-provider subagents** - Mix providers across parent/subagent boundaries
- **Compaction control** - Automatic message compaction for long conversations to manage context window usage
- **Conditional rendering** - Use `<Condition>` to conditionally render agent components based on state or natural language intent
- **Structured outputs** - Use `strict` on tools
- **Prompt caching** - Supports Anthropic's prompt caching
- **Provider-specific built-ins** - Import built-ins from `agentry/anthropic` or `agentry/openai`
- **SDK-native tool shapes** - Built-ins reuse provider SDK types where available

## Providers

Agentry supports multiple providers with a single declarative API.

- Root `agentry` exports the provider-agnostic core (`run`, `Agent`, hooks, custom tools).
- Provider modules export provider clients and built-ins:
  - `agentry/anthropic`
  - `agentry/openai`
- Built-ins are treated as regular tools in execution (no per-provider capability matrix to maintain).

### Root + explicit provider

```tsx
import { run, Agent, Message } from 'agentry'
import { openai } from 'agentry/openai'

const result = await run(
  <Agent provider="openai" model="gpt-4.1-mini">
    <Message role="user">Hello</Message>
  </Agent>,
  {
    clients: { openai: openai() },
  },
)
```

### `createAI` defaults

```tsx
import { createAI, Agent, Message, Tools } from 'agentry'
import { anthropic, WebSearch } from 'agentry/anthropic'

const ai = createAI({
  clients: { anthropic: anthropic() },
})

const result = await ai.run(
  <Agent provider="anthropic" model="claude-sonnet-4-5" maxTokens={1024}>
    <Tools>
      <WebSearch maxUses={3} />
    </Tools>
    <Message role="user">Find the latest React release notes</Message>
  </Agent>,
)
```

### Cross-provider subagents

`<AgentTool>` and `context.runAgent(...)` can run subagents on a different provider than the parent:

```tsx
import { createAI, Agent, AgentTool, Message, Tools } from 'agentry'
import { openai } from 'agentry/openai'

const ai = createAI({
  clients: { openai: openai() },
})

await ai.run(
  <Agent provider="openai" model="gpt-4.1-mini">
    <Tools>
      <AgentTool
        name="claude_researcher"
        description="Research with Anthropic"
        parameters={z.object({ topic: z.string() })}
        agent={({ topic }) => (
          <Agent provider="anthropic" model="claude-sonnet-4-5">
            <Message role="user">Research: {topic}</Message>
          </Agent>
        )}
      />
    </Tools>
    <Message role="user">Use claude_researcher for React 19 updates.</Message>
  </Agent>,
)
```

## Examples

Want to see code? See [examples/](/packages/examples/src)

| Example                                                                              | Description                                |
| ------------------------------------------------------------------------------------ | ------------------------------------------ |
| [`demo.tsx`](packages/examples/src/demo.tsx)                                         | Company research with web search           |
| [`basic.tsx`](packages/examples/src/basic.tsx)                                       | Simple calculator tool                     |
| [`interactive.tsx`](packages/examples/src/interactive.tsx)                           | Multi-turn conversations with streaming    |
| [`subagents.tsx`](packages/examples/src/subagents.tsx)                               | Manager delegating to specialists          |
| [`hooks.tsx`](packages/examples/src/hooks.tsx)                                       | Hooks, composition, and dynamic tools      |
| [`web-search.tsx`](packages/examples/src/web-search.tsx)                             | Web search workflows                       |
| [`mcp.tsx`](packages/examples/src/mcp.tsx)                                           | MCP server integration                     |
| [`chatbot.tsx`](packages/examples/src/chatbot.tsx)                                   | Terminal-based chatbot                     |
| [`create-subagent.tsx`](packages/examples/src/create-subagent.tsx)                   | Dynamic subagent creation                  |
| [`anthropic/cache-ephemeral.tsx`](packages/examples/src/anthropic/cache-ephemeral.tsx) | Prompt caching with ephemeral content    |
| [`conditions.tsx`](packages/examples/src/conditions.tsx)                             | State-based and NL condition rendering     |
| [`anthropic/thinking.tsx`](packages/examples/src/anthropic/thinking.tsx)             | Extended thinking with interleaved support |
| [`workflow.tsx`](packages/examples/src/workflow.tsx)                                 | Interactive authentication workflow        |
| [`conversation-persistence.tsx`](packages/examples/src/conversation-persistence.tsx) | Conversation save/load                     |
| [`openai/basic.tsx`](packages/examples/src/openai/basic.tsx)                         | OpenAI Responses API basic usage           |
| [`cross-provider/subagents.tsx`](packages/examples/src/cross-provider/subagents.tsx) | OpenAI parent + Anthropic subagents        |

Run an example:

```bash
echo "ANTHROPIC_API_KEY=sk-ant-***" > .env
echo "OPENAI_API_KEY=sk-***" >> .env
bun run example:basic
# OpenAI examples:
bun run example:openai:basic
# provider-agnostic examples (set EXAMPLE_PROVIDER=openai if needed):
bun run example:chatbot
# Anthropic-specific examples:
bun run example:anthropic:thinking
```

## Core Concepts

### Batch vs Interactive Mode

**Batch mode** (default) - Runs to completion:

```tsx
const result = await run(<Agent provider="anthropic">...</Agent>, {
  clients: { anthropic: anthropic() },
})
```

**Interactive mode** - Returns a handle for ongoing interaction:

```tsx
const agent = await run(<Agent provider="anthropic">...</Agent>, {
  mode: 'interactive',
  clients: { anthropic: anthropic() },
})
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

## API Reference

### `run(element, options?)`

Runs an agent and returns a result or handle.

```tsx
// Batch mode
const result: AgentResult = await run(<Agent provider="anthropic">...</Agent>, {
  clients: { anthropic: anthropic() },
})

// Interactive mode
const handle: AgentHandle = await run(<Agent provider="anthropic">...</Agent>, {
  mode: 'interactive',
  clients: { anthropic: anthropic() },
})
```

**Options:**

- `mode?: 'batch' | 'interactive'` - Execution mode (default: `'batch'`)
- `client?: Anthropic | OpenAI` - Single provider client (backward-compatible shortcut)
- `clients?: { anthropic?: Anthropic; openai?: OpenAI }` - Provider client map
  - provider is chosen from `<Agent provider=\"...\">`
  - if omitted, provider clients are created from environment variables by default

### `createAI(defaults)`

Create a defaults-bound runner so you can use `ai.run(...)` and `ai.createAgent(...)`.

```tsx
import { createAI, Agent, Message } from 'agentry'
import { openai } from 'agentry/openai'

const ai = createAI({
  clients: { openai: openai() },
})

const result = await ai.run(
  <Agent provider="openai" model="gpt-5-mini">
    <Message role="user">Hello</Message>
  </Agent>,
)
```

### Components

Built-ins are provider-owned exports:

- `WebSearch` from `agentry/anthropic` or `agentry/openai`
- `CodeExecution` and `MCP` from `agentry/anthropic` or `agentry/openai`
- `Memory` from `agentry/anthropic`

#### `<Agent>`

| Prop                 | Type                                   | Description                                                                                                                                                                                              |
| -------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provider?`          | `'anthropic' \| 'openai'`             | AI provider for this agent                                                                                                                                                                               |
| `model`              | `string`                               | Provider model id (e.g. `claude-sonnet-4-5`, `gpt-4.1-mini`)                                                                                                                                              |
| `name?`              | `string`                               | Agent identifier                                                                                                                                                                                         |
| `description?`       | `string`                               | Agent description                                                                                                                                                                                        |
| `maxTokens?`         | `number`                               | Max output tokens (default: `4096`)                                                                                                                                                                      |
| `maxIterations?`     | `number`                               | Max tool call iterations (default: `20`)                                                                                                                                                                 |
| `stopSequences?`     | `string[]`                             | Stop sequences                                                                                                                                                                                           |
| `temperature?`       | `number`                               | Sampling temperature (0-1)                                                                                                                                                                               |
| `stream?`            | `boolean`                              | Enable streaming (default: `true`)                                                                                                                                                                       |
| `betas?`             | `string[]`                             | Additional Anthropic beta features to enable                                                                                                                                                             |
| `thinking?`          | `ThinkingConfig`                       | Extended thinking config: `{ type: 'enabled', budget_tokens: number, interleaved?: boolean }`. When enabled, `interleaved` defaults to `true`. Set `interleaved: false` to disable interleaved thinking. |
| `compactionControl?` | `CompactionControl`                    | Context compaction settings (see below)                                                                                                                                                                  |
| `onMessage?`         | `(event: AgentStreamEvent) => void`    | Stream event callback                                                                                                                                                                                    |
| `onComplete?`        | `(result: AgentResult) => void`        | Completion callback                                                                                                                                                                                      |
| `onError?`           | `(error: Error) => void`               | Error callback                                                                                                                                                                                           |
| `onStepFinish?`      | `(result: OnStepFinishResult) => void` | Step completion callback                                                                                                                                                                                 |

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
| `provider`  | `'anthropic' \| 'openai'`                                                  | Current provider              |
| `client?`   | `Anthropic \| OpenAI`                                                      | Current provider client       |
| `clients?`  | `{ anthropic?: Anthropic; openai?: OpenAI }`                               | Provider client map           |
| `model?`    | `string`                                                                   | Current agent's model         |
| `signal?`   | `AbortSignal`                                                              | Abort signal for cancellation |
| `metadata?` | `JsonObject`                                                               | Custom JSON-like metadata     |
| `runAgent`  | `(agent: ReactElement, options?: RunAgentOptions) => Promise<AgentResult>` | Run an agent programmatically |

**RunAgentOptions:**

| Field          | Type          | Description             |
| -------------- | ------------- | ----------------------- |
| `provider?`    | `'anthropic' \| 'openai'` | Override provider |
| `clients?`     | `{ anthropic?: Anthropic; openai?: OpenAI }` | Override client map |
| `model?`       | `string`      | Override parent's model |
| `maxTokens?`   | `number`      | Override max tokens     |
| `temperature?` | `number`      | Override temperature    |
| `signal?`      | `AbortSignal` | Custom abort signal     |

## Requirements

- Node.js 18+ or Bun
- React 19+
- TypeScript 5+
- Provider API key(s): Anthropic and/or OpenAI

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

<!-- prettier-ignore-start -->
<!-- badges -->

[npm-version-src]: https://img.shields.io/npm/v/agentry?style=flat-square
[npm-version-href]: https://npmjs.com/package/agentry

[npm-downloads-src]: https://img.shields.io/npm/dm/agentry?style=flat-square
[npm-downloads-href]: https://npmjs.com/package/agentry

[github-actions-src]: https://img.shields.io/github/actions/workflow/status/colinds/agentry/test.yml?style=flat-square&branch=main
[github-actions-href]: https://github.com/colinds/agentry/actions/workflows/test.yml?query=workflow:Test

<!-- prettier-ignore-end -->
