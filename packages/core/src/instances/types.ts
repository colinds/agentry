import type Anthropic from '@anthropic-ai/sdk';
import type { BetaMessageParam, BetaToolUnion } from '@anthropic-ai/sdk/resources/beta';
import type { AgentProps, InternalTool, AgentResult, AgentStreamEvent } from '../types/index.ts';
import type { ExecutionEngine } from '../execution/index.ts';

// base instance type
export interface BaseInstance {
  type: string;
  parent: Instance | null;
}

// agent instance - the root container for an agent
export interface AgentInstance extends BaseInstance {
  type: 'agent';
  props: AgentProps;
  client: Anthropic;
  engine: ExecutionEngine | null;
  // collected from children
  systemParts: Array<{ content: string; priority: number }>;
  tools: InternalTool[];
  sdkTools: BetaToolUnion[];
  contextParts: Array<{ content: string; priority: number }>;
  messages: BetaMessageParam[];
  // child instances
  children: Instance[];
  // pending updates during execution
  pendingUpdates: PendingUpdate[];
  // flag to prevent infinite loops
  _updating: boolean;
}

// tool instance - wraps a RunnableTool
export interface ToolInstance extends BaseInstance {
  type: 'tool';
  tool: InternalTool;
}

// sdk tool instance - wraps a BetaToolUnion (WebSearch, MCP, etc.)
export interface SdkToolInstance extends BaseInstance {
  type: 'sdk_tool';
  tool: BetaToolUnion;
}

// system prompt instance
export interface SystemInstance extends BaseInstance {
  type: 'system';
  content: string;
  priority: number;
}

// context instance
export interface ContextInstance extends BaseInstance {
  type: 'context';
  content: string;
  priority: number;
}

// message instance
export interface MessageInstance extends BaseInstance {
  type: 'message';
  message: BetaMessageParam;
}

// tools container instance
export interface ToolsContainerInstance extends BaseInstance {
  type: 'tools_container';
  children: Instance[];
}

// subagent instance - child agent that becomes a tool
export interface SubagentInstance extends BaseInstance {
  type: 'subagent';
  name: string;
  description?: string;
  agentElement: React.ReactNode | null;
  props: AgentProps;
  children: Instance[];
  // collected state (same as AgentInstance but not used until spawned)
  systemParts: Array<{ content: string; priority: number }>;
  tools: InternalTool[];
  sdkTools: BetaToolUnion[];
  contextParts: Array<{ content: string; priority: number }>;
  messages: BetaMessageParam[];
}

// all instance types
export type Instance =
  | AgentInstance
  | SubagentInstance
  | ToolInstance
  | SdkToolInstance
  | SystemInstance
  | ContextInstance
  | MessageInstance
  | ToolsContainerInstance;

// pending update types
export type PendingUpdate =
  | { type: 'tool_added'; tool: InternalTool }
  | { type: 'tool_removed'; toolName: string }
  | { type: 'sdk_tool_added'; tool: BetaToolUnion }
  | { type: 'sdk_tool_removed'; toolName: string }
  | { type: 'system_updated'; content: string; priority: number }
  | { type: 'context_updated'; content: string; priority: number }
  | { type: 'message_added'; message: BetaMessageParam };

// props for each component type
export interface AgentComponentProps extends AgentProps {
  client?: Anthropic;
  children?: React.ReactNode;
}

export interface ToolComponentProps {
  tool: InternalTool;
}

export interface SdkToolComponentProps {
  tool: BetaToolUnion;
}

export interface SystemComponentProps {
  children: React.ReactNode;
  priority?: number;
}

export interface ContextComponentProps {
  children: React.ReactNode;
  priority?: number;
}

export interface MessageComponentProps {
  role: 'user' | 'assistant';
  children: React.ReactNode;
}

export interface ToolsContainerProps {
  children?: React.ReactNode;
}

// helper to check instance types
export function isAgentInstance(instance: Instance): instance is AgentInstance {
  return instance.type === 'agent';
}

export function isToolInstance(instance: Instance): instance is ToolInstance {
  return instance.type === 'tool';
}

export function isSdkToolInstance(instance: Instance): instance is SdkToolInstance {
  return instance.type === 'sdk_tool';
}

export function isSystemInstance(instance: Instance): instance is SystemInstance {
  return instance.type === 'system';
}

export function isContextInstance(instance: Instance): instance is ContextInstance {
  return instance.type === 'context';
}

export function isMessageInstance(instance: Instance): instance is MessageInstance {
  return instance.type === 'message';
}

export function isToolsContainerInstance(instance: Instance): instance is ToolsContainerInstance {
  return instance.type === 'tools_container';
}

export function isSubagentInstance(instance: Instance): instance is SubagentInstance {
  return instance.type === 'subagent';
}

// type guard to check if unknown is an Instance
export function isInstance(value: unknown): value is Instance {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    'parent' in value
  );
}
