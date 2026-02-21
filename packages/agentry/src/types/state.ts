import type { AgentMessage } from './messages'
import type { PendingToolCall, ToolExecutionResult } from './tools'

export enum AgentStatus {
  Idle = 'idle',
  Streaming = 'streaming',
  WaitingForTools = 'waiting_for_tools',
  ExecutingTools = 'executing_tools',
  Completed = 'completed',
  Error = 'error',
}

export enum TransitionType {
  StartStreaming = 'start_streaming',
  ToolsRequested = 'tools_requested',
  ToolsExecuting = 'tools_executing',
  ToolsCompleted = 'tools_completed',
  Completed = 'completed',
  Error = 'error',
}

export type AgentState =
  | { status: AgentStatus.Idle }
  | { status: AgentStatus.Streaming; abortController: AbortController }
  | { status: AgentStatus.WaitingForTools; pendingTools: PendingToolCall[] }
  | { status: AgentStatus.ExecutingTools; pendingTools: PendingToolCall[] }
  | { status: AgentStatus.Completed; finalMessage: AgentMessage }
  | { status: AgentStatus.Error; error: Error }

export type StateTransition =
  | {
      type: TransitionType.StartStreaming
      abortController: AbortController
    }
  | { type: TransitionType.ToolsRequested; pendingTools: PendingToolCall[] }
  | { type: TransitionType.ToolsExecuting; pendingTools: PendingToolCall[] }
  | { type: TransitionType.ToolsCompleted; results: ToolExecutionResult[] }
  | { type: TransitionType.Completed; finalMessage: AgentMessage }
  | { type: TransitionType.Error; error: Error }

export function initialState(): AgentState {
  return { status: AgentStatus.Idle }
}

export function transition(
  state: AgentState,
  event: StateTransition,
): AgentState {
  switch (event.type) {
    case TransitionType.StartStreaming:
      return {
        status: AgentStatus.Streaming,
        abortController: event.abortController,
      }

    case TransitionType.ToolsRequested:
      return {
        status: AgentStatus.WaitingForTools,
        pendingTools: event.pendingTools,
      }

    case TransitionType.ToolsExecuting:
      return {
        status: AgentStatus.ExecutingTools,
        pendingTools: event.pendingTools,
      }

    case TransitionType.ToolsCompleted:
      // after tools complete, go back to idle for next iteration
      return { status: AgentStatus.Idle }

    case TransitionType.Completed:
      return {
        status: AgentStatus.Completed,
        finalMessage: event.finalMessage,
      }

    case TransitionType.Error:
      return { status: AgentStatus.Error, error: event.error }

    default:
      return state
  }
}

export function canAcceptMessages(state: AgentState): boolean {
  return (
    state.status === AgentStatus.Idle || state.status === AgentStatus.Completed
  )
}

export function isProcessing(state: AgentState): boolean {
  return (
    state.status === AgentStatus.Streaming ||
    state.status === AgentStatus.WaitingForTools ||
    state.status === AgentStatus.ExecutingTools
  )
}
