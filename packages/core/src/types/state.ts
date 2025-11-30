import type { BetaMessage } from '@anthropic-ai/sdk/resources/beta';
import type { PendingToolCall, ToolExecutionResult } from './tools.ts';

// agent execution states (discriminated union)
export type AgentState =
  | { status: 'idle' }
  | { status: 'streaming'; abortController: AbortController }
  | { status: 'waiting_for_tools'; pendingTools: PendingToolCall[] }
  | { status: 'executing_tools'; pendingTools: PendingToolCall[] }
  | { status: 'completed'; finalMessage: BetaMessage }
  | { status: 'error'; error: Error };

// state transition events
export type StateTransition =
  | { type: 'start_streaming'; abortController: AbortController }
  | { type: 'tools_requested'; pendingTools: PendingToolCall[] }
  | { type: 'tools_executing'; pendingTools: PendingToolCall[] }
  | { type: 'tools_completed'; results: ToolExecutionResult[] }
  | { type: 'completed'; finalMessage: BetaMessage }
  | { type: 'error'; error: Error }
  | { type: 'reset' };

// helper to get initial state
export function initialState(): AgentState {
  return { status: 'idle' };
}

// state transition function
export function transition(state: AgentState, event: StateTransition): AgentState {
  switch (event.type) {
    case 'start_streaming':
      return { status: 'streaming', abortController: event.abortController };

    case 'tools_requested':
      return { status: 'waiting_for_tools', pendingTools: event.pendingTools };

    case 'tools_executing':
      return { status: 'executing_tools', pendingTools: event.pendingTools };

    case 'tools_completed':
      // after tools complete, we go back to idle to allow next iteration
      return { status: 'idle' };

    case 'completed':
      return { status: 'completed', finalMessage: event.finalMessage };

    case 'error':
      return { status: 'error', error: event.error };

    case 'reset':
      return { status: 'idle' };

    default:
      return state;
  }
}

// check if the agent can accept new messages
export function canAcceptMessages(state: AgentState): boolean {
  return state.status === 'idle' || state.status === 'completed';
}

// check if the agent is currently processing
export function isProcessing(state: AgentState): boolean {
  return (
    state.status === 'streaming' ||
    state.status === 'waiting_for_tools' ||
    state.status === 'executing_tools'
  );
}
