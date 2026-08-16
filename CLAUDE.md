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
  - `src/pi` - the **only** place `@earendil-works/pi-ai` may be imported
  - `src/components` - JSX API (`Agent`, `Tool`, `AgentTool`, etc.)
  - `src/tools` - tool definition/parsing/execution helpers
  - `src/run` - `run`, `createAgent`, `runAgent` wiring
  - `tests` - unit/integration tests (`tests/utils/piMockProvider.ts` scripts turns)
- `packages/examples` - runnable examples and DX references

## Current Architecture Notes

### The pi seam

- `src/pi/` is the single boundary to `@earendil-works/pi-ai`. Nothing else imports it,
  which keeps pi's 0.x churn to a one-directory blast radius. The version is pinned exactly.
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

pi ships no MCP, no provider-native server-side tools, and no OpenAI WebSocket transport
for API-key auth. These are deliberate upstream non-goals, not gaps to work around:
injecting native tools via `onPayload` reaches the wire but pi's response parser drops the
resulting blocks, which corrupts replayed history. `<WebSearch>`, `<CodeExecution>` and
`<MCP>` were removed; rebuild them as ordinary client-side tools if needed.

### Subagents

- `<AgentTool>` supports declarative subagents.
- `context.runAgent(...)` supports programmatic subagent spawning.
- Cross-provider subagents are supported; pi transforms thinking blocks and tool calls on handoff.

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
