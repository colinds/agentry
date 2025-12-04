# CLAUDE.md

## Overview

Agentry is a React reconciler-based framework for declarative AI agent orchestration. It uses a custom React reconciler to translate JSX into agent execution plans, bringing React's declarative component model to AI agent systems.

## Development Commands

### Testing

- `bun test` - Run all tests across packages
- `bun test --timeout 100 ./packages/**/tests` - Full test suite (as configured)
- `bun test packages/core/tests/tools.test.ts` - Run a specific test file

### Type Checking & Linting

- `bun run typecheck` - Type check all packages (runs `tsc --noEmit`)
- `bun run lint` - Lint codebase with ESLint (max 0 warnings)
- `bun run lint:fix` - Auto-fix linting issues
- `bun run format` - Check formatting with Prettier
- `bun run format:fix` - Auto-format with Prettier

### Running Examples

Examples are in `packages/examples/src/`. Run with:

```bash
bun run example:<name>
# e.g., bun run example:basic, bun run example:subagents
```

Or directly:

```bash
bun run packages/examples/src/<example-name>.tsx
```

## Architecture

### Package Structure (Monorepo with Bun Workspaces)

- **`packages/core`** - Core reconciler and execution engine
  - `src/reconciler/` - React reconciler implementation that translates JSX to agent instances
  - `src/execution/` - ExecutionEngine that manages agent/API interaction lifecycle
  - `src/handles/` - AgentHandle and SubagentHandle for controlling agent execution
  - `src/instances/` - Instance types representing reconciled elements (AgentInstance, ToolInstance, etc.)
  - `src/tools/` - Tool definition and execution utilities
  - `src/run/` - Running functions: `agent.ts`, `subagent.ts`, `runAgentFunction.ts`
  - `src/types/` - Shared TypeScript types
  - `tests/` - Core functionality tests

- **`packages/components`** - React components for agent orchestration
  - JSX components: `<Agent>`, `<Tool>`, `<AgentTool>`, `<System>`, `<Context>`, `<Message>`, `<Tools>`
  - Built-in tools: `<WebSearch>`, `<CodeExecution>`, `<Memory>`, `<MCP>`
  - Hooks: `useExecutionState()`, `useMessages()`, `useAgentState()`

- **`packages/agentry`** - Main entry point package
  - Re-exports from `@agentry/core` and `@agentry/components`
  - Single import point for users: `import { render, Agent, ... } from 'agentry'`

- **`packages/shared`** - Shared constants
  - `MODEL`, `TEST_MODEL` constants

- **`packages/examples`** - Example applications demonstrating framework features

### Key Architectural Concepts

**React Reconciler Integration**

- The reconciler (`packages/core/src/reconciler/reconciler.ts`) translates JSX into instance objects
- Instance types (`packages/core/src/instances/types.ts`) represent the reconciled tree structure
- The `createInstance` function builds instances from element types and props
- Instances contain both component configuration and runtime state

**Execution Flow**

1. `render()` creates an AgentHandle with the JSX element
2. AgentHandle uses the reconciler to build an AgentInstance tree
3. ExecutionEngine manages the conversation loop with the Anthropic API
4. Tool calls trigger handler execution and potential re-renders (for dynamic tools)
5. State updates via hooks can modify the instance tree mid-execution

**Subagents (AgentTool)**

- Subagents are created using `<AgentTool>` component, NOT by directly nesting `<Agent>` in `<Tools>`
- AgentTool takes an `agent` prop - a function that receives parsed parameters and returns an `<Agent>` JSX element
- When the parent calls the tool, the framework creates a SubagentHandle to execute the agent
- SubagentHandle renders the JSX returned by the `agent` function and manages its lifecycle
- Subagent results flow back as tool results to parent agent

Example pattern:

```tsx
<AgentTool
  name="researcher"
  description="Research specialist"
  parameters={z.object({ topic: z.string() })}
  agent={(input) => (
    <Agent name="researcher">
      <System>You are a research expert.</System>
      <Message role="user">Research the topic: {input.topic}</Message>
    </Agent>
  )}
/>
```

**Programmatic Agent Spawning**

- Tool handlers receive a `ToolContext` with a `runAgent()` function
- `runAgent()` allows programmatically creating and executing agents from within tool handlers
- Spawned agents run to completion and return their full `AgentResult` to the handler
- Results are only visible to the tool handler (not to Claude in the parent conversation)
- Supports conditional spawning, parallel execution, and custom configuration per spawned agent
- Implemented via `createRunAgent()` which creates a bound function from execution context
- The spawned agent is executed as a subagent using `SubagentHandle`

Example pattern:

```tsx
<Tool
  name="analyze"
  handler={async (input, context) => {
    const result = await context.runAgent(
      <Agent name="analyst">
        <System>You are an analyst</System>
        <Message role="user">Analyze: {input.data}</Message>
      </Agent>,
      { maxTokens: 2048 }, // Optional config override
    )
    return result.content
  }}
/>
```

**Dynamic Tools**

- Tools can be added/removed during execution using React state (useState)
- State changes trigger reconciler updates, modifying the instance tree
- Next API call includes the updated tool set

**Batch vs Interactive Mode**

- **Batch mode** (default): Runs to completion, returns AgentResult
- **Interactive mode**: Returns AgentHandle for multi-turn conversations

## Testing

Tests use Bun's built-in test runner. Mock client available via `createStepMockClient` from `@agentry/core/test-utils`.

Common test patterns:

- Import test utilities: `import { createStepMockClient } from '../src/test-utils/index.ts'`
- Use `expect` from `bun:test`
- Mock Anthropic responses for deterministic testing

## TypeScript Configuration

- Target: ESNext with bundler module resolution
- Strict mode enabled with additional checks (`noUncheckedIndexedAccess`, `noImplicitOverride`)
- JSX runtime: `react-jsx` with React 19
- Module: `Preserve` (uses TypeScript's new module preservation)
- No emit mode (bundler handles compilation)

## Important Implementation Notes

**Tool Definition**

- Use `defineTool()` for programmatic regular tool creation with Zod schemas
- Use `<Tool>` JSX for inline declarative tool registration
- Use `defineAgentTool()` for programmatic subagent tool creation
- Use `<AgentTool>` JSX for inline declarative subagent registration
- Handler/agent function params are automatically inferred from Zod schema types
- Tool handlers receive `ToolContext` which includes `runAgent()` for programmatic agent running
- `runAgent()` is created via `createRunAgent()` and bound to the execution context (client, model, signal)

**Instance Tree Mutations**

- The reconciler maintains an instance tree that can be mutated during execution
- Always use the reconciler's update/append/remove methods (via collections handlers)
- Manual instance modifications should go through proper reconciler channels

**Agent State Management**

- AgentStore (Zustand) manages global agent state
- ExecutionEngine emits state change events
- Hooks subscribe to store updates for reactive behavior

**Error Handling**

- Tools should return error strings rather than throw (allows agent to see and handle errors)
- ExecutionEngine catches and transitions to 'error' state on critical failures
- SubagentHandle automatically cleans up on completion or error
- Run agents (via `runAgent()`) handle errors the same way - errors can be caught in the tool handler

**Render Functions**

- `render/agent.ts` - Main `render()` function and `createAgent()` utility
- `render/subagent.ts` - Internal `renderSubagent()` function for executing subagents
- `render/runAgent.ts` - `createRunAgent()` function for programmatic agent running
- All exports are re-exported from `render/index.ts` for backward compatibility
