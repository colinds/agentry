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

> [!NOTE]
> Supports ~35 providers through [pi](https://pi.dev) — Anthropic, OpenAI, Google,
> Bedrock, Groq, xAI, OpenRouter, DeepSeek, Mistral, Cerebras, and any
> OpenAI-compatible endpoint.

## Quick Start

### Installation

```bash
bun add agentry react

# credentials come from the environment; set whichever providers you use
export ANTHROPIC_API_KEY="sk-ant-***"
export OPENAI_API_KEY="sk-***"
```

No provider SDK to install and no client to construct — [pi](https://pi.dev)
resolves providers, models and credentials.

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
import { run, Type, Agent, System, Tools, Tool, Message } from 'agentry'

const result = await run(
  <Agent provider="anthropic" model="claude-haiku-4-5" maxTokens={1024}>
    <System>You are a helpful math assistant</System>
    <Tools>
      <Tool
        name="calculator"
        description="Perform calculations"
        parameters={Type.Object({
          operation: Type.Union([
            Type.Literal('add'),
            Type.Literal('subtract'),
            Type.Literal('multiply'),
            Type.Literal('divide'),
          ]),
          a: Type.Number(),
          b: Type.Number(),
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

Run it:

```bash
bun run agent.tsx
```

## Features

- **Dynamic tools via React state** - Add/remove tools during execution with `useState`
- **React hooks** - `useExecutionState()`, `useMessages()` for reactive state
- **Declarative subagents** - Use `<AgentTool>` to create subagents with type-safe parameters
- **Type-safe tools** - Handler params inferred from TypeBox schemas
- **Streaming support** - Stream responses
- **~35 providers** - Selected by string; no SDK or client to wire up
- **MCP** - `<MCP>` connects to any MCP server, on every provider
- **Programmatic agent spawning** - Spawn and execute agents on-demand from tool handlers using `context.runAgent()`
- **Cross-provider subagents** - Mix providers across parent/subagent boundaries
- **Compaction control** - Summarizes older turns while keeping recent ones verbatim
- **Conditional rendering** - Use `<Condition>` to conditionally render agent components based on state or natural language intent
- **Structured outputs** - Use `strict` on tools
- **Cost tracking** - `result.usage.costUSD` plus a per-category breakdown
- **Context inspection** - `handle.describeContext()` reports what is filling the window

## Providers

Agentry supports every provider [pi](https://pi.dev) does, through a single
declarative API. `provider` and `model` are plain strings resolved against pi's
catalog — there is one entry point and no per-provider module.

```tsx
<Agent provider="anthropic" model="claude-haiku-4-5" />
<Agent provider="openai" model="gpt-5-mini" />
<Agent provider="groq" model="llama-3.3-70b-versatile" />
```

Credentials are read from the environment. To restrict which providers are
available, or to register a custom one, build a pi `Models` collection and pass
it to `run`/`createAI`:

```tsx
import { createModels } from '@earendil-works/pi-ai'
import { anthropicProvider } from '@earendil-works/pi-ai/providers/anthropic'

const models = createModels()
models.setProvider(anthropicProvider())

await run(<Agent provider="anthropic" model="claude-haiku-4-5" />, { models })
```

### Reusable instance

```tsx
import { createAI, Agent, Message } from 'agentry'

// Bind defaults once; every run inherits them.
const ai = createAI({ mode: 'batch' })

const result = await ai.run(
  <Agent provider="anthropic" model="claude-sonnet-4-5" maxTokens={1024}>
    <Message role="user">Summarize the latest React release notes</Message>
  </Agent>,
)
```

## Examples

Want to see code? See [examples/](/packages/examples/src)

| Example                                                                                | Description                                               |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| [`demo.tsx`](packages/examples/src/demo.tsx)                                           | Company research with nested subagents                    |
| [`basic.tsx`](packages/examples/src/basic.tsx)                                         | Simple calculator tool                                    |
| [`interactive.tsx`](packages/examples/src/interactive.tsx)                             | Multi-turn conversations with streaming                   |
| [`subagents.tsx`](packages/examples/src/subagents.tsx)                                 | Manager delegating to specialists                         |
| [`hooks.tsx`](packages/examples/src/hooks.tsx)                                         | Hooks, composition, and dynamic tools                     |
| [`chatbot.tsx`](packages/examples/src/chatbot.tsx)                                     | Terminal-based chatbot                                    |
| [`create-subagent.tsx`](packages/examples/src/create-subagent.tsx)                     | Dynamic subagent creation                                 |
| [`conditions.tsx`](packages/examples/src/conditions.tsx)                               | State-based and NL condition rendering                    |
| [`anthropic/thinking.tsx`](packages/examples/src/anthropic/thinking.tsx)               | Extended thinking with interleaved support                |
| [`workflow.tsx`](packages/examples/src/workflow.tsx)                                   | Interactive authentication workflow                       |
| [`conversation-persistence.tsx`](packages/examples/src/conversation-persistence.tsx)   | Conversation save/load                                    |
| [`openai/basic.tsx`](packages/examples/src/openai/basic.tsx)                           | OpenAI Responses API basic usage                          |
| [`cross-provider/subagents.tsx`](packages/examples/src/cross-provider/subagents.tsx)   | OpenAI parent + Anthropic subagents                       |
| [`openai/codex-subagent.tsx`](packages/examples/src/openai/codex-subagent.tsx)         | OpenAI Codex subagent                                     |
| [`compaction.tsx`](packages/examples/src/compaction.tsx)                               | Context compaction demo                                   |
| [`mcp.tsx`](packages/examples/src/mcp.tsx)                                             | Connect to an MCP server and use its tools                |
| [`multi-provider.tsx`](packages/examples/src/multi-provider.tsx)                       | Parent and subagent on different providers                |

Run an example:

```bash
echo "ANTHROPIC_API_KEY=sk-ant-***" > .env
# echo "OPENAI_API_KEY=sk-***" >> .env
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
const result = await run(<Agent provider="anthropic">...</Agent>)
```

**Interactive mode** - Returns a handle for ongoing interaction:

```tsx
const agent = await run(<Agent provider="anthropic">...</Agent>, {
  mode: 'interactive',
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
<Agent name="manager" provider="anthropic" model="claude-haiku-4-5">
  <Tools>
    <AgentTool
      name="researcher"
      description="Research specialist"
      parameters={Type.Object({
        topic: Type.String({ description: 'The topic to research' }),
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
<Agent provider="anthropic" model="claude-haiku-4-5">
  <Tools>
    <Tool
      name="analyze_code"
      description="Analyze code by spawning a specialist agent"
      parameters={Type.Object({
        code: Type.String(),
        language: Type.Union([Type.Literal('python'), Type.Literal('typescript'), Type.Literal('rust')]),
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

### Cross-provider subagents

`<AgentTool>` and `context.runAgent(...)` can run subagents on a different provider than the parent:

```tsx
import { createAI, Agent, AgentTool, Message, Tools } from 'agentry'

// Both providers resolve from the environment; nothing to wire up.
const ai = createAI()

await ai.run(
  <Agent provider="openai" model="gpt-5-mini">
    <Tools>
      <AgentTool
        name="claude_researcher"
        description="Research with Anthropic"
        parameters={Type.Object({ topic: Type.String() })}
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

### State-Driven Tools

Tools can be added/removed during execution using React state:

```tsx
function DynamicAgent() {
  const [hasAdvanced, setHasAdvanced] = useState(false)
  return (
    <Agent provider="anthropic" model="claude-haiku-4-5">
      <System>
        You are a helpful assistant that can analyze technical and business content.
        You can unlock advanced analysis tools by calling the unlock_advanced tool.
      </System>
      <Tools>
        <Tool
          name="unlock_advanced"
          parameters={Type.Object({})}
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
    <Agent provider="anthropic" model="claude-haiku-4-5">
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

Caching is the provider's job, driven by two knobs rather than per-block markers.
`cacheRetention` sets how long a provider should hold the prefix, and `sessionId`
keys the cache so it survives across separate runs of the same agent.

```tsx
await run(
  <Agent
    provider="anthropic"
    model="claude-sonnet-4-5"
    cacheRetention="long"
  >
    <System>You are a helpful assistant. Always be concise and accurate.</System>
    <Message role="user">What's my name?</Message>
  </Agent>,
  { sessionId: 'support-bot' },
)
```

Whether a cache is actually being hit shows up in `result.usage`:

```tsx
console.log(result.usage.cacheReadInputTokens, result.usage.cost)
```

> [!NOTE]
> Changing the tool set between turns rewrites the provider's tools array and
> invalidates the cached prefix, so gate tools on state that changes rarely.

### Compaction Control

For long-running conversations, enable automatic compaction. Once a turn crosses
the token threshold, older turns are summarized while the most recent ones are
kept verbatim — so the model keeps its immediate working context. Compaction also
runs automatically if a provider rejects a request for exceeding its context
window, and the turn is then retried.

```tsx
<Agent
  provider="anthropic"
  model="claude-haiku-4-5"
  compactionControl={{
    enabled: true,
    contextTokenThreshold: 100000, // Compact when total tokens exceed this
    keepRecentTokens: 16000, // Recent turns kept verbatim (default ~16k)
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
const result: AgentResult = await run(<Agent provider="anthropic">...</Agent>)

// Interactive mode
const handle: AgentHandle = await run(<Agent provider="anthropic">...</Agent>, {
  mode: 'interactive',
})
```

**Options:**

- `mode?: 'batch' | 'interactive'` - Execution mode (default: `'batch'`)
- `models?: Models` - A pi model collection. Omit it and agentry builds pi's full
  catalog, resolving credentials from the environment.
- `sessionId?: string` - Stable id for prompt-cache affinity. Reuse it across runs
  of the same logical agent; omit it and each run gets a fresh one.

### `createAI(defaults)`

Create a defaults-bound runner so you can use `ai.run(...)` and `ai.createAgent(...)`.

```tsx
import { createAI, Agent, Message } from 'agentry'

const ai = createAI({})

const result = await ai.run(
  <Agent provider="openai" model="gpt-5-mini">
    <Message role="user">Hello</Message>
  </Agent>,
)
```

### Components

Everything is exported from `agentry`; there is a single entry point.

#### `<Agent>`

| Prop                 | Type                                   | Description                                                                                                                                                                                                                                                                     |
| -------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provider?`          | `string`                               | Provider id, resolved against pi's catalog (`anthropic`, `openai`, `groq`, …)                                                                                                                                                                                                   |
| `model`              | `string`                               | Provider model id (e.g. `claude-sonnet-4-5`, `gpt-5-mini`)                                                                                                                                                                                                                      |
| `name?`              | `string`                               | Agent identifier                                                                                                                                                                                                                                                                |
| `description?`       | `string`                               | Agent description                                                                                                                                                                                                                                                               |
| `maxTokens?`         | `number`                               | Max output tokens (default: `4096`)                                                                                                                                                                                                                                             |
| `maxIterations?`     | `number`                               | Max tool call iterations (default: `20`)                                                                                                                                                                                                                                        |
| `temperature?`       | `number`                               | Sampling temperature (0-1)                                                                                                                                                                                                                                                      |
| `stream?`            | `boolean`                              | Enable streaming (default: `true`)                                                                                                                                                                                                                                              |
| `thinking?`          | `ThinkingLevel`                        | `'minimal' \| 'low' \| 'medium' \| 'high' \| 'xhigh' \| 'max'`. Clamped to what the model supports.                                                                                                                                                                          |
| `retry?`             | `RetryPolicy`                          | `{ enabled, maxRetries, baseDelayMs }` for transient provider failures                                                                                                                                                                                                          |
| `cacheRetention?`    | `'none' \| 'short' \| 'long'`           | Prompt-cache retention hint (default `'short'`)                                                                                                                                                                                                                                 |
| `timeoutMs?`         | `number`                               | Request timeout. Without it the provider SDK default (10 minutes) applies                                                                                                                                                                                                       |
| `headers?`           | `ProviderHeaders`                      | Custom HTTP headers, e.g. for a corporate gateway                                                                                                                                                                                                                               |
| `samplingParams?`    | `Record<string, unknown>`              | `top_p`, `top_k`, … Applied only by OpenAI-compatible APIs; ignored elsewhere                                                                                                                                                                                                   |
| `compactionControl?` | `CompactionControl`                    | Context compaction settings (see below)                                                                                                                                                                                                                                         |
| `onMessage?`         | `(event: AgentStreamEvent) => void`    | Stream event callback                                                                                                                                                                                                                                                           |
| `onComplete?`        | `(result: AgentResult) => void`        | Completion callback                                                                                                                                                                                                                                                             |
| `onError?`           | `(error: Error) => void`               | Error callback                                                                                                                                                                                                                                                                  |
| `onStepFinish?`      | `(result: OnStepFinishResult) => void` | Step completion callback                                                                                                                                                                                                                                                        |

**CompactionControl:**

| Field                    | Type      | Description                                      |
| ------------------------ | --------- | ------------------------------------------------ |
| `enabled`                | `boolean` | Enable/disable compaction                        |
| `contextTokenThreshold?` | `number`  | Token threshold to trigger (default: `100000`)   |
| `keepRecentTokens?`      | `number`  | Recent turns kept verbatim (default: `16000`)    |
| `model?`                 | `string`  | Model for summarization (default: agent's model) |
| `summaryPrompt?`         | `string`  | Custom summary prompt                            |

#### `<System>` / `<Context>`

| Prop       | Type          | Description                              |
| ---------- | ------------- | ---------------------------------------- |
| `children` | `ReactNode` | Content |

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
| `parameters`  | `TSchema`                                              | TypeBox schema; handler params are inferred from it |
| `strict?`     | `boolean`                                              | Enable structured outputs (auto-enables beta) |
| `handler`     | `(input, context: ToolContext) => Promise<ToolResult>` | Tool handler                                  |

#### `<AgentTool>`

| Prop          | Type                             | Description                     |
| ------------- | -------------------------------- | ------------------------------- |
| `name`        | `string`                         | Tool name                       |
| `description` | `string`                         | Description for the model       |
| `parameters`  | `TSchema`                        | TypeBox schema; input is inferred from it |
| `agent`       | `(input) => ReactElement<Agent>` | Function returning the Agent    |

#### `<Condition>`

| Prop        | Type                            | Description                                                                                   |
| ----------- | ------------------------------- | --------------------------------------------------------------------------------------------- |
| `when`      | `boolean \| string`             | Condition (boolean or NL description evaluated by LLM)                                        |
| `provider?` | `string`                        | Override provider for NL evaluation (first NL condition's override applies to the batch)      |
| `model?`    | `string`                        | Override model for NL evaluation (defaults to `claude-haiku-4-5` / `gpt-4.1-mini` if not set) |
| `children`  | `ReactNode`                     | Content to render when condition is true                                                      |

#### `<MCP>`

Agentry is the MCP *client*: it connects, lists the server's tools, and proxies
each call. That makes MCP work on every provider, not only those with a native
connector. Tools arrive namespaced as `<server>__<tool>`.

| Prop                   | Type                                              | Description                           |
| ---------------------- | ------------------------------------------------- | ------------------------------------- |
| `type`                 | `'stdio' \| 'url'`                                | Transport                             |
| `name`                 | `string`                                          | Server name; namespaces its tools     |
| `command` / `args?`    | `string` / `string[]`                             | stdio only: process to launch         |
| `url`                  | `string`                                          | url only: streamable HTTP endpoint    |
| `authorization_token?` | `string`                                          | url only: bearer token                |
| `tool_configuration?`  | `{ enabled?: boolean, allowed_tools?: string[] }` | Tool filtering config                 |

```tsx
<MCP
  type="stdio"
  name="fs"
  command="bunx"
  args={['-y', '@modelcontextprotocol/server-filesystem', '/tmp']}
/>
```

### Hooks

| Hook                  | Returns               | Description             |
| --------------------- | --------------------- | ----------------------- |
| `useExecutionState()` | `AgentState`          | Current execution state |
| `useMessages()`       | `AgentMessageParam[]` | Conversation messages   |
| `useAgentState()`     | `AgentStoreState`     | Full agent state        |

### AgentHandle (Interactive Mode)

| Method / Property      | Type                                                        | Description                     |
| ---------------------- | ----------------------------------------------------------- | ------------------------------- |
| `sendMessage(content)` | `(string) => Promise<AgentResult>`                          | Send a message and get response |
| `stream(message)`      | `(string) => AsyncGenerator<AgentStreamEvent, AgentResult>` | Stream a response               |
| `run(firstMessage?)`   | `(string?) => Promise<AgentResult>`                         | Run agent to completion         |
| `abort()`              | `() => void`                                                | Abort current execution         |
| `close()`              | `() => void`                                                | Clean up resources              |
| `state`                | `AgentState`                                                | Current execution state         |
| `messages`             | `AgentMessageParam[]`                                       | Conversation history            |
| `isRunning`            | `boolean`                                                   | Whether agent is processing     |
| `describeContext()`    | `() => ContextUsage \| undefined`                           | What is filling the context window (see below) |

#### Context inspection

`describeContext()` reports where your context window is going — the assembled
system prompt, each tool's definition, and the message history. Tool schemas are
re-sent on every request, so they are usually where an unexpectedly full window
is hiding.

```tsx
const usage = handle.describeContext()!
// { contextWindow: 200000, reportedInputTokens: 747, free: 199253,
//   estimatedUsed: 161,
//   sections: [{ name: 'tools', tokens: 92, share: 0.571 }, …],
//   tools: [{ name: 'lookup', tokens: 46 }, …] }
```

`reportedInputTokens` is what the provider actually charged for the last turn —
trust that for "how close am I to the limit". `estimatedUsed` and the section
`share`s are a local estimate, useful for attribution but understating real usage,
since providers prepend scaffolding a client never sees.

### Utilities

| Function                         | Description                                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------------------------- |
| `defineTool(options)`            | Define a tool programmatically. Options: `name`, `description`, `parameters`, `strict?`, `handler` |
| `defineAgentTool(options)`       | Define a subagent tool. Options: `name`, `description`, `parameters`, `agent`                      |
| `createAgent(element, options?)` | Create an agent handle without running                                                             |
| `Type`                           | TypeBox schema builder, re-exported so you need no extra install                                   |

### ToolContext

Tool handlers receive a `context` object:

| Property    | Type                                                                       | Description                   |
| ----------- | -------------------------------------------------------------------------- | ----------------------------- |
| `agentName` | `string`                                                                   | Name of the current agent     |
| `provider?` | `string`                                                                   | Current provider              |
| `models`    | `Models`                                                                   | pi model collection backing this run; what makes cross-provider spawning work |
| `model?`    | `string`                                                                   | Current agent's model         |
| `signal?`   | `AbortSignal`                                                              | Abort signal for cancellation |
| `metadata?` | `JsonObject`                                                               | Custom JSON-like metadata     |
| `runAgent`  | `(agent: ReactElement, options?: RunAgentOptions) => Promise<AgentResult>` | Run an agent programmatically |

**RunAgentOptions:**

| Field          | Type                                         | Description             |
| -------------- | -------------------------------------------- | ----------------------- |
| `provider?`    | `string`                                     | Override provider       |
| `models?`      | `Models`                                     | Override model collection |
| `model?`       | `string`                                     | Override parent's model |
| `maxTokens?`   | `number`                                     | Override max tokens     |
| `temperature?` | `number`                                     | Override temperature    |
| `signal?`      | `AbortSignal`                                | Custom abort signal     |

## Requirements

- Node.js 22.19+ or Bun
- React 19+
- TypeScript 5+
- An API key for at least one provider (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, …)

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
