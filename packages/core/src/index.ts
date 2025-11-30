// types
export * from './types/index.ts';

// store (single source of truth)
export { createAgentStore, type AgentStore, type AgentStoreState } from './store.ts';

// tools
export { defineTool, toApiTool, parseToolInput, executeTool, zodToJsonSchema } from './tools/index.ts';

// execution
export { ExecutionEngine, type ExecutionEngineEvents, type ExecutionEngineConfig, createEngineConfig, type EngineConfigOptions, type EngineConfigResult } from './execution/index.ts';

// instances
export * from './instances/index.ts';

// reconciler
export {
  reconciler,
  createContainer,
  updateContainer,
  flushSync,
  unmountContainer,
  setSubagentToolFactory,
  isContainerReady,
  type ContainerInfo,
  // utilities
  diffProps,
  disposeOnIdle,
  isTreeMounted,
  markTreeMounted,
  HostTransitionContext,
} from './reconciler/index.ts';

// test utilities
export { createMockClient, mockToolUse, mockText, type MockResponse } from './test-utils/index.ts';

// debug utilities
export { debug, isDebugEnabled } from './debug.ts';

// constants
export { ANTHROPIC_BETAS, type AnthropicBeta } from './constants.ts';
