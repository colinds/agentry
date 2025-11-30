import { createStore, type StoreApi } from 'zustand/vanilla';
import type { AgentState } from './types/state.ts';
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta';

// ============================================================================
// AgentStore - Single source of truth for agent state
// ============================================================================

/**
 * Store state shape - just data, no functions
 */
export interface AgentStoreState {
  executionState: AgentState;
  messages: BetaMessageParam[];
}

export type AgentStore = StoreApi<AgentStoreState>;

/**
 * Create a Zustand store for agent state
 * Store contains only data - writes happen via store.setState()
 */
export function createAgentStore(): AgentStore {
  return createStore<AgentStoreState>(() => ({
    executionState: { status: 'idle' },
    messages: [],
  }));
}

