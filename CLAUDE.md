# CLAUDE.md

## Overview

Agentry is a React reconciler-based framework for declarative AI agent orchestration.
Every model call goes through [pi](https://pi.dev) (`@earendil-works/pi-ai`), which supplies
~35 providers behind one API, so agentry owns orchestration rather than wire formats.

## Development Commands

### Testing

- `bun test` - Run the full Agentry test suite (`packages/agentry/tests`)
- `bun test packages/agentry/tests/runtime.test.tsx` - core runtime coverage
- `bun test packages/agentry/tests/pi-facade.test.ts` - the pi seam (event mapping, tool mapping, error conversion)

### Type Checking & Linting

- `bun run typecheck` - Type check all workspace packages
- `bun run lint` - Lint source and examples
- `bun run lint:fix` - Auto-fix lint issues
- `bun run format` - Check formatting
- `bun run format:fix` - Auto-format

### Running Examples

Examples live in `packages/examples/src/`.

```bash
bun run example:<name>
# example:basic, example:subagents, example:multi-provider
```

Examples read credentials from the environment (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, …);
pi resolves them per provider, so no client construction is needed.

## Repository Layout

- `packages/agentry` - Framework package
  - `src/reconciler` - custom React reconciler
  - `src/execution` - execution loop and condition evaluation
  - `src/handles` - agent/subagent handles
  - `src/pi` - the only place that makes runtime calls into pi
  - `src/components` - JSX API (`Agent`, `Tool`, `AgentTool`, etc.)
  - `src/tools` - tool definition/parsing/execution helpers
  - `src/run` - `run`, `createAgent`, `runAgent` wiring
  - `tests` - unit/integration tests (`tests/utils/piMockProvider.ts` scripts turns)
- `packages/examples` - runnable examples and DX references

## Current Architecture Notes

### The pi seam

- `src/pi/` is the single place that *calls* `@earendil-works/pi-ai`. Elsewhere, pi appears
  only in `import type` — `Models` threaded through signatures, and the message types
  re-exported from `src/types/messages.ts`. Keeping every runtime call behind this one
  directory is what limits pi's 0.x churn; the version is pinned exactly.
- `createTurn` (`src/pi/turn.ts`) is the only path to a model. It normalizes two things the
  engine depends on: pi reports failures as values (`stopReason: 'error' | 'aborted'`), so
  they are converted back into throws; and non-streaming turns emit the same
  `AgentStreamEvent` sequence as streaming ones.
- `<Agent provider model>` are plain strings resolved against pi's catalog. There is no
  closed provider union and no SDK client to construct.
- `run`/`createAI` accept an optional pi `Models` collection; omitted, they lazily build
  pi's full built-in catalog, so the zero-config env-var path works.

### Message types

- Agentry's message model **is** pi's: `Message`, `AssistantMessage`, `ToolResultMessage`,
  `ToolCall`. `src/types/messages.ts` re-exports them with agentry-flavoured aliases and
  helpers. Do not reintroduce a parallel type hierarchy with converters at the edge.
- Tool results are first-class `ToolResultMessage`s, not `tool_result` blocks inside a user
  turn.
- Stop reasons follow pi: `stop` / `toolUse` / `length`.

### Tool schemas

- Tools use **TypeBox** (`Type.Object(...)`), re-exported from the package root. A TypeBox
  schema is plain JSON Schema at runtime, which is exactly what pi puts on the wire, so
  there is no conversion step.
- `strict: true` maps to pi's `constrainedSampling: { type: 'json_schema', strict: 'prefer' }`.
  `'prefer'` degrades to an ordinary tool call where the provider lacks grammar support.

### What pi does not do

pi ships no MCP and no provider-native server-side tools. These are deliberate upstream
non-goals, not gaps to work around: injecting native tools via `onPayload` reaches the
wire but pi's response parser drops the resulting blocks, which corrupts replayed
history.

MCP is therefore implemented client-side (see below). Provider-native built-ins are not
a goal: agentry ships no search, code-execution, or memory tools. Each needs a third-party
service or a sandbox to be faithful, and all of them are better written as ordinary
user-defined tools than shipped as half-working built-ins.

### Subagents

- `<AgentTool>` supports declarative subagents.
- `context.runAgent(...)` supports programmatic subagent spawning.
- Cross-provider subagents are supported; pi transforms thinking blocks and tool calls on handoff.

### Execution mechanics

The mechanics below replaced an earlier mid-turn rendering model. The JSX API is
unchanged; only when and how the tree is read moved.

- **Turn-boundary rendering.** The tree is rendered exactly once per turn,
  immediately before the model call (`ExecutionEngine.renderTurn`, supplied by
  the handle). State written *during* a turn — a `setState` inside a tool
  handler — is deliberately not visible until the next turn boundary. This
  replaced a mid-turn `flushSync` + scheduler yield.
- **Name-keyed resources.** `AgentInstance.tools` is a `Map` keyed by tool name,
  not a positional array. That is what makes conditional mounting robust and
  makes consecutive renders diffable. Insertion order is preserved so wire order
  stays stable. Duplicate names are rejected at the turn boundary, not during
  collection — throwing inside React's commit phase surfaces as an unrelated
  downstream error.
- **Narrated resource diff.** Each turn snapshots the tool set and diffs it
  against the last narrated one; the delta is announced into the transcript
  (`[Available tools changed] …`). Without this the model sees tools appear and
  vanish with no explanation. Note that changing the tool set rewrites the
  provider's tools array and invalidates its prompt cache, so gate tools on
  rarely-changing state.

### MCP

Client-side, because pi models only client-executed tools.

- `<MCP>` connects to an MCP server (stdio or streamable HTTP), lists its tools,
  and proxies each `tools/call`. Tools are namespaced `<server>__<tool>`.
  Connections are reconciled per turn, reused across runs, and closed with the
  handle.
- It consequently works on every provider, not just those with a native
  connector.

### Concurrent subagents

Subagents are already safe to run in parallel — each `SubagentHandle` gets its
own zustand store and its own reconciler container, and each run gets its own
`sessionId`. Nothing is shared but the module-level model-catalog memo.

```ts
const [tech, biz] = await Promise.all([
  context.runAgent(<Agent name="tech">…</Agent>),
  context.runAgent(<Agent name="biz">…</Agent>),
])
```

This already happens implicitly: `executeTools` runs a turn's tool calls under
`Promise.all`, so two `<AgentTool>` calls in one assistant turn are two
concurrent subagent runs.

What is **not** supported is deferring a subagent *across* turns — starting one
in turn N and collecting it in turn N+2. Subagent runs are awaited within the
turn that starts them, and nothing survives the process. Durable background runs
would need a serializable agent identity, but `<AgentTool agent={...}>` is a
closure over lexical scope — which is the point of the JSX API. A caller who
needs durability owns the process and should queue `run(<Agent …>)` themselves.

### Conditions

- Boolean conditions evaluate synchronously before each API call.
- Natural-language conditions are evaluated in a batched model call.
- Conditions can be nested; active parent + active child is required for nested content.

## Workflow

- After finishing a set of changes, always run `bun test`, `bun run typecheck`, `bun run lint`, and `bun run format` before considering the work done.

## Implementation Guidelines

- Keep strict typing (`no any` / `no unknown` type annotations in implementation code paths).
- Prefer pi-owned types over local re-definitions; import them only through `src/pi/` or `src/types/messages.ts`.
- Return tool errors as strings so the model can recover.
- Preserve dynamic tool behavior (state-driven add/remove during execution).
- Do not reintroduce provider adapters, SDK clients, or per-provider capability flags.
