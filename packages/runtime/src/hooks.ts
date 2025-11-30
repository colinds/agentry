import * as React from 'react';
import type {
  AgentInstance,
  AgentState,
  InternalTool,
  BetaMessageParam,
} from '@agentry/core';
import { isAgentInstance } from '@agentry/core';

// ============================================================================
// AgentStore - Simple store for managing agent state with subscriptions
// ============================================================================

/**
 * Store state shape
 */
export interface AgentStoreState {
  instance: AgentInstance | null;
  state: AgentState;
}

/**
 * AgentStore interface - minimal store for useSyncExternalStore
 */
export interface AgentStore {
  getState: () => AgentStoreState;
  setState: (updates: Partial<AgentStoreState>) => void;
  subscribe: (listener: () => void) => () => void;
}

/**
 * Create a simple store for agent state
 * Uses the minimal API required for useSyncExternalStore
 */
export function createAgentStore(initial?: Partial<AgentStoreState>): AgentStore {
  let currentState: AgentStoreState = {
    instance: initial?.instance ?? null,
    state: initial?.state ?? { status: 'idle' },
  };
  const listeners = new Set<() => void>();

  return {
    getState: () => currentState,
    setState: (updates) => {
      // Create new state object for immutability
      const newState = { ...currentState };
      if (updates.instance !== undefined) newState.instance = updates.instance;
      if (updates.state !== undefined) newState.state = updates.state;
      
      // Only notify if state actually changed
      if (newState.instance !== currentState.instance || newState.state !== currentState.state) {
        currentState = newState;
        listeners.forEach((listener) => listener());
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

// ============================================================================
// AgentContext - React context for accessing agent state
// ============================================================================

/**
 * Context for accessing the current agent instance from within components
 */
export interface AgentContextValue {
  /** The agent instance */
  instance: AgentInstance | null;
  /** Current execution state */
  state: AgentState;
  /** Get current messages */
  messages: readonly BetaMessageParam[];
  /** Register a tool dynamically */
  registerTool: (tool: InternalTool) => void;
  /** Unregister a tool */
  unregisterTool: (toolName: string) => void;
  /** Get registered tools */
  tools: readonly InternalTool[];
}

const AgentContext = React.createContext<AgentContextValue | null>(null);

/**
 * Provider component that makes agent context available to children
 * This is used internally by the runtime
 * 
 * @param store - The AgentStore to read state from
 * @param children - Child components that can use hooks
 */
export function AgentProvider({
  store,
  children,
}: {
  store: AgentStore;
  children: React.ReactNode;
}): React.JSX.Element {
  // Subscribe to store changes using useSyncExternalStore
  const { instance, state } = React.useSyncExternalStore(
    store.subscribe,
    store.getState,
    store.getState // server snapshot (same as client for backend)
  );

  const registerTool = React.useCallback(
    (tool: InternalTool) => {
      if (!instance || !isAgentInstance(instance)) return;
      // Check if tool already exists
      if (!instance.tools.find((t) => t.name === tool.name)) {
        instance.tools.push(tool);
        instance.pendingUpdates.push({ type: 'tool_added', tool });
      }
    },
    [instance]
  );

  const unregisterTool = React.useCallback(
    (toolName: string) => {
      if (!instance || !isAgentInstance(instance)) return;
      const index = instance.tools.findIndex((t) => t.name === toolName);
      if (index >= 0) {
        instance.tools.splice(index, 1);
        instance.pendingUpdates.push({ type: 'tool_removed', toolName });
      }
    },
    [instance]
  );

  const value = React.useMemo<AgentContextValue>(
    () => ({
      instance,
      state,
      messages: instance?.messages ?? [],
      registerTool,
      unregisterTool,
      tools: instance?.tools ?? [],
    }),
    [instance, state, registerTool, unregisterTool]
  );

  return React.createElement(AgentContext.Provider, { value }, children);
}

/**
 * Hook to access the agent context
 * Must be used within an Agent component tree
 * 
 * @example
 * ```tsx
 * function DebugComponent() {
 *   const { state, messages } = useAgentContext();
 *   console.log('Current state:', state.status);
 *   console.log('Message count:', messages.length);
 *   return null;
 * }
 * ```
 */
export function useAgentContext(): AgentContextValue {
  const context = React.useContext(AgentContext);
  if (!context) {
    throw new Error(
      'useAgentContext must be used within an Agent component. ' +
      'Make sure your component is a child of <Agent>.'
    );
  }
  return context;
}

/**
 * Hook to access the current execution state
 * 
 * @example
 * ```tsx
 * function StatusIndicator() {
 *   const state = useExecutionState();
 *   return <span>{state.status}</span>;
 * }
 * ```
 */
export function useExecutionState(): AgentState {
  const { state } = useAgentContext();
  return state;
}

/**
 * Hook to access the message history
 * 
 * @example
 * ```tsx
 * function MessageLogger() {
 *   const messages = useMessages();
 *   useEffect(() => {
 *     console.log('Messages updated:', messages.length);
 *   }, [messages]);
 *   return null;
 * }
 * ```
 */
export function useMessages(): readonly BetaMessageParam[] {
  const { messages } = useAgentContext();
  return messages;
}

// NOTE: useTools hook commented out - prefer JSX <Tool> components for tool registration.
// JSX approach is more declarative and works better with the reconciler.
// Keeping the code here for reference if we want to enable it later.

// /**
//  * Hook to register tools dynamically
//  * 
//  * Tools are registered when the component mounts and unregistered when it unmounts.
//  * The tools are re-registered whenever the tools array changes.
//  * 
//  * @example
//  * ```tsx
//  * function DynamicTools({ enableSearch }: { enableSearch: boolean }) {
//  *   useTools(enableSearch ? [searchTool] : []);
//  *   return null;
//  * }
//  * ```
//  * 
//  * @example with callback (for conditional logic)
//  * ```tsx
//  * function ConditionalTools({ userRole }: { userRole: string }) {
//  *   useTools(() => {
//  *     const tools = [baseTool];
//  *     if (userRole === 'admin') {
//  *       tools.push(adminTool);
//  *     }
//  *     return tools;
//  *   }, [userRole]);
//  *   return null;
//  * }
//  * ```
//  */
// export function useTools(
//   toolsOrFactory: InternalTool[] | (() => InternalTool[]),
//   deps: React.DependencyList = []
// ): void {
//   const { registerTool, unregisterTool } = useAgentContext();
//   const registeredRef = React.useRef<Set<string>>(new Set());
// 
//   React.useEffect(() => {
//     const tools = typeof toolsOrFactory === 'function' ? toolsOrFactory() : toolsOrFactory;
//     const newToolNames = new Set(tools.map((t) => t.name));
// 
//     // Unregister tools that are no longer in the list
//     for (const name of registeredRef.current) {
//       if (!newToolNames.has(name)) {
//         unregisterTool(name);
//         registeredRef.current.delete(name);
//       }
//     }
// 
//     // Register new tools
//     for (const tool of tools) {
//       if (!registeredRef.current.has(tool.name)) {
//         registerTool(tool);
//         registeredRef.current.add(tool.name);
//       }
//     }
// 
//     // Cleanup on unmount
//     return () => {
//       for (const name of registeredRef.current) {
//         unregisterTool(name);
//       }
//       registeredRef.current.clear();
//     };
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [registerTool, unregisterTool, ...deps]);
// }

// Export the context for advanced use cases
export { AgentContext };

