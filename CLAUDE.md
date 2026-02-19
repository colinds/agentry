# CLAUDE.md

## Overview

Agentry is a React reconciler-based framework for declarative AI agent orchestration.
It supports multiple providers (Anthropic + OpenAI) through a shared core API with a single `run` plus `createAI` defaults.

## Development Commands

### Testing

- `bun test` - Run the full Agentry test suite (`packages/agentry/tests`)
- `bun test packages/agentry/tests/openai-provider.test.tsx` - OpenAI provider tests
- `bun test packages/agentry/tests/runtime.test.tsx` - Anthropic/core runtime coverage

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
# provider-agnostic: example:basic
# provider-specific: example:anthropic:chatbot, example:openai:basic
```

## Repository Layout

- `packages/agentry` - Framework package
  - `src/reconciler` - custom React reconciler
  - `src/execution` - execution loop and condition evaluation
  - `src/handles` - agent/subagent handles
  - `src/providers` - provider adapters (`anthropic`, `openai`)
  - `src/components` - JSX API (`Agent`, `Tool`, `AgentTool`, etc.)
  - `src/tools` - tool definition/parsing/execution helpers
  - `src/run` - `run`, `createAgent`, `runAgent` wiring
  - `tests` - unit/integration tests (including OpenAI provider tests)
- `packages/examples` - runnable examples and DX references

## Current Architecture Notes

### Providers and Exports

- Root `agentry` exports provider-agnostic primitives (`run`, `createAI`, `Agent`, `Tool`, hooks).
- Provider modules:
  - `agentry/anthropic` exports Anthropic client factory + Anthropic built-ins (`WebSearch`, `CodeExecution`, `Memory`, `MCP`)
  - `agentry/openai` exports OpenAI client factory + OpenAI-compatible built-ins (`WebSearch`, `CodeExecution`, `MCP`)
- Built-ins are treated as regular tools at runtime; there is no hardcoded per-provider capability matrix in the engine.
- Provider selection is resolved from `<Agent provider=\"...\">` (and subagents), while `run`/`createAI` provide clients and runtime defaults.

### SDK Type Reuse

- Prefer SDK-owned tool/request/response types where possible.
- Avoid redefining provider-specific wire types when SDK types are available.
- Keep framework-level normalized types focused on orchestration concerns only.

### Subagents

- `<AgentTool>` supports declarative subagents.
- `context.runAgent(...)` supports programmatic subagent spawning.
- Cross-provider subagents are supported (for example, OpenAI parent + Anthropic child, and vice versa).

### Conditions

- Boolean conditions evaluate synchronously before each API call.
- Natural-language conditions are evaluated in a batched model call.
- Conditions can be nested; active parent + active child is required for nested content.

## Implementation Guidelines

- Keep strict typing (`no any` / `no unknown` type annotations in implementation code paths).
- Prefer provider SDK types over duplicated local provider shapes.
- Return tool errors as strings so the model can recover.
- Preserve dynamic tool behavior (state-driven add/remove during execution).
- Do not reintroduce provider capability flags for built-ins unless explicitly requested.
