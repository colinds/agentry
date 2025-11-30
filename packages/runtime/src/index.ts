// initialize subagent tool factory
import { setSubagentToolFactory } from '@agentry/core';
import { createSubagentTool } from './createSubagentTool.ts';
setSubagentToolFactory(createSubagentTool);

// runtime API
export { render, createAgent, type RenderOptions } from './render.ts';
export { AgentHandle, type AgentHandleEvents } from './AgentHandle.ts';
export { renderSubagent, type RenderSubagentOptions } from './renderSubagent.ts';

// re-export components for convenience
export {
  Agent,
  Tool,
  System,
  Context,
  Message,
  Tools,
  WebSearch,
  defineTool,
  type AgentProps,
  type ToolProps,
  type SystemProps,
  type ContextProps,
  type MessageProps,
  type ToolsProps,
  type WebSearchProps,
} from '@agentry/components';

// re-export useful types from core
export type {
  AgentResult,
  AgentStreamEvent,
  AgentState,
  InternalTool,
  ToolContext,
  ToolResult,
  Model,
  BetaMessage,
  BetaMessageParam,
} from '@agentry/core';
