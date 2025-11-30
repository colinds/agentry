import type { Model } from '@anthropic-ai/sdk/resources/messages';
import type { BetaMessageParam, BetaToolUnion } from '@anthropic-ai/sdk/resources/beta';
import type { InternalTool } from './tools.ts';

// re-export Model type
export type { Model };

// agent configuration props (from JSX)
export interface AgentProps {
  // required
  model: Model;

  // optional
  name?: string;
  description?: string;
  maxTokens?: number;
  maxIterations?: number;
  stopSequences?: string[];
  temperature?: number;

  // streaming mode
  stream?: boolean;

  // callbacks
  onMessage?: (message: AgentStreamEvent) => void;
  onComplete?: (result: AgentResult) => void;
  onError?: (error: Error) => void;

  // compaction settings (from SDK)
  compactionControl?: CompactionControl;
}

// compaction control (mirrors SDK)
export interface CompactionControl {
  enabled: boolean;
  contextTokenThreshold?: number;
  model?: Model;
  summaryPrompt?: string;
}

// stream event types
export type AgentStreamEvent =
  | { type: 'text'; text: string; accumulated: string }
  | { type: 'tool_use_start'; toolName: string; toolId: string }
  | { type: 'tool_use_input'; toolId: string; partialInput: string }
  | { type: 'tool_result'; toolId: string; result: string; isError: boolean }
  | { type: 'thinking'; text: string }
  | { type: 'message_complete'; stopReason: string };

// final result when agent completes
export interface AgentResult {
  // the final message from the assistant
  content: string;
  // full conversation history
  messages: BetaMessageParam[];
  // token usage
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
  };
  // stop reason
  stopReason: string | null;
}

// collected agent state from JSX tree
export interface CollectedAgentState {
  // system prompt parts with priorities
  systemParts: Array<{ content: string; priority: number }>;
  // tools registered to this agent
  tools: InternalTool[];
  // SDK built-in tools (WebSearch, MCP, etc.)
  sdkTools: BetaToolUnion[];
  // context blocks with priorities
  contextParts: Array<{ content: string; priority: number }>;
  // initial messages
  messages: BetaMessageParam[];
}

// helper to create empty collected state
export function emptyCollectedState(): CollectedAgentState {
  return {
    systemParts: [],
    tools: [],
    sdkTools: [],
    contextParts: [],
    messages: [],
  };
}
