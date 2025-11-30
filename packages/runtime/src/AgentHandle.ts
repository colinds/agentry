import Anthropic from '@anthropic-ai/sdk';
import { EventEmitter } from 'eventemitter3';
import { createElement, type ReactNode } from 'react';
import { unstable_scheduleCallback, unstable_NormalPriority } from 'scheduler';
import {
  createContainer,
  updateContainer,
  unmountContainer,
  flushSync,
  ExecutionEngine,
  createAgentStore,
  createEngineConfig,
  type ContainerInfo,
  type AgentInstance,
  type AgentResult,
  type AgentStreamEvent,
  type AgentState,
  type BetaMessageParam,
  type AgentStore,
  type OnStepFinishResult,
  isAgentInstance,
} from '@agentry/core';
import { MODEL } from '@agentry/shared';
import { AgentProvider } from './hooks.ts';

// events emitted by AgentHandle
export interface AgentHandleEvents {
  stateChange: (state: AgentState) => void;
  stream: (event: AgentStreamEvent) => void;
  complete: (result: AgentResult) => void;
  error: (error: Error) => void;
  stepFinish: (result: OnStepFinishResult) => void;
}

/**
 * Handle for controlling an agent at runtime
 *
 * Provides methods to send messages, stream responses, and control execution
 */
export class AgentHandle extends EventEmitter<AgentHandleEvents> {
  #containerInfo: ContainerInfo;
  #engine: ExecutionEngine | null = null;
  #client: Anthropic;
  #element: ReactNode;
  #running = false;
  #store: AgentStore;
  #instance: AgentInstance | null = null;

  constructor(element: ReactNode, client?: Anthropic) {
    super();
    this.#client = client ?? new Anthropic();
    this.#element = element;

    // Create Zustand store - single source of truth
    this.#store = createAgentStore();

    // Create root agent instance as container
    const rootAgent: AgentInstance = {
      type: 'agent',
      props: {
        model: MODEL,
        maxTokens: 4096,
        stream: true,
      },
      client: this.#client,
      engine: null,
      systemParts: [],
      tools: [],
      sdkTools: [],
      contextParts: [],
      messages: [],
      mcpServers: [],
      children: [],
      pendingUpdates: [],
      parent: null,
      _updating: false,
    };

    this.#containerInfo = createContainer(rootAgent);
  }

  // Expose store for advanced use cases
  get store(): AgentStore {
    return this.#store;
  }

  // Get current state from store
  get state(): AgentState {
    return this.#store.getState().executionState;
  }

  // Get messages from store (single source of truth)
  get messages(): readonly BetaMessageParam[] {
    return this.#store.getState().messages;
  }

  // Check if agent is currently running
  get isRunning(): boolean {
    return this.#running;
  }

  // Update the rendered element
  update(element: ReactNode): void {
    this.#element = element;
    const wrappedElement = this.#wrapWithProvider(element);
    updateContainer(wrappedElement, this.#containerInfo);
  }

  // Wrap element with provider
  #wrapWithProvider(element: ReactNode): ReactNode {
    return createElement(AgentProvider, { store: this.#store, children: element });
  }

  // Push a message to the store
  #pushMessage(message: BetaMessageParam): void {
    this.#store.setState((s) => ({ messages: [...s.messages, message] }));
  }

  // Run the agent
  async run(firstMessage?: string): Promise<AgentResult> {
    if (this.#running) {
      throw new Error('Agent is already running');
    }

    this.#running = true;

    let onStateChange: ((state: AgentState) => void) | undefined;
    let onStream: ((event: AgentStreamEvent) => void) | undefined;
    let onError: ((error: Error) => void) | undefined;
    let onStepFinish: ((result: OnStepFinishResult) => void) | undefined;

    try {
      // Render element to collect state
      const wrappedElement = this.#wrapWithProvider(this.#element);
      await new Promise<void>((resolve) => {
        flushSync(() => {
          updateContainer(wrappedElement, this.#containerInfo, resolve);
        });
      });

      // Yield to React's scheduler for pending effects
      await new Promise<void>((resolve) => {
        unstable_scheduleCallback(unstable_NormalPriority, () => resolve());
      });

      const container = this.#containerInfo.container;
      if (!isAgentInstance(container)) {
        throw new Error('Root container is not an agent instance');
      }

      const agent = container.children[0];
      if (!agent || !isAgentInstance(agent)) {
        throw new Error('No agent element found in tree');
      }

      // Keep instance reference
      this.#instance = agent;

      // Add first message if provided
      if (firstMessage) {
        this.#pushMessage({ role: 'user', content: firstMessage });
      }

      // Get messages from store, fall back to initial JSX messages
      const storeMessages = this.#store.getState().messages;
      const initialMessages = storeMessages.length > 0 ? [...storeMessages] : agent.messages;

      // Create execution engine using shared factory
      const { config } = createEngineConfig({
        agent,
        client: this.#client,
        store: this.#store,
        overrideMessages: initialMessages,
      });

      this.#engine = new ExecutionEngine(config);

      // Wire up events
      onStateChange = (state: AgentState) => {
        // State is already updated in store by engine
        this.emit('stateChange', state);
      };
      onStream = (event: AgentStreamEvent) => {
        this.emit('stream', event);
        agent.props.onMessage?.(event);
      };
      onError = (error: Error) => {
        this.emit('error', error);
        agent.props.onError?.(error);
      };
      onStepFinish = (result: OnStepFinishResult) => {
        this.emit('stepFinish', result);
        agent.props.onStepFinish?.(result);
      };

      this.#engine.on('stateChange', onStateChange);
      this.#engine.on('stream', onStream);
      this.#engine.on('error', onError);
      this.#engine.on('stepFinish', onStepFinish);

      // Run engine
      const result = await this.#engine.run();

      this.emit('complete', result);
      agent.props.onComplete?.(result);

      return result;
    } finally {
      if (this.#engine) {
        if (onStateChange) this.#engine.off('stateChange', onStateChange);
        if (onStream) this.#engine.off('stream', onStream);
        if (onError) this.#engine.off('error', onError);
        if (onStepFinish) this.#engine.off('stepFinish', onStepFinish);
      }
      this.#running = false;
    }
  }

  // Send a message and get response
  async sendMessage(content: string): Promise<AgentResult> {
    // Push user message to store
    this.#pushMessage({ role: 'user', content });

    if (this.#engine) {
      // Update engine config with current messages
      this.#engine.updateConfig({ messages: [...this.#store.getState().messages] });
    }

    return this.run();
  }

  // Stream responses
  async *stream(message?: string): AsyncGenerator<AgentStreamEvent, AgentResult, undefined> {
    if (this.#running) {
      throw new Error(
        'Agent is already running. Wait for current execution to complete or call abort() first.'
      );
    }

    if (!message) {
      throw new Error('stream() requires a message parameter. Use: agent.stream("your message")');
    }

    // Push user message to store
    this.#pushMessage({ role: 'user', content: message });

    if (this.#engine) {
      this.#engine.updateConfig({ messages: [...this.#store.getState().messages] });
    }

    const events: AgentStreamEvent[] = [];
    let resolveNext: ((event: AgentStreamEvent | null) => void) | null = null;
    let done = false;
    let result: AgentResult | null = null;
    let error: Error | null = null;

    const onStream = (event: AgentStreamEvent) => {
      if (resolveNext) {
        resolveNext(event);
        resolveNext = null;
      } else {
        events.push(event);
      }
    };

    const onComplete = (r: AgentResult) => {
      done = true;
      result = r;
      if (resolveNext) {
        resolveNext(null);
        resolveNext = null;
      }
    };

    const onError = (e: Error) => {
      done = true;
      error = e;
      if (resolveNext) {
        resolveNext(null);
        resolveNext = null;
      }
    };

    this.on('stream', onStream);
    this.on('complete', onComplete);
    this.on('error', onError);

    const runPromise = this.run().catch((e) => {
      error = e;
      done = true;
    });

    try {
      while (!done) {
        if (events.length > 0) {
          yield events.shift()!;
        } else {
          const event = await new Promise<AgentStreamEvent | null>((resolve) => {
            resolveNext = resolve;
          });
          if (event) {
            yield event;
          }
        }
      }

      while (events.length > 0) {
        yield events.shift()!;
      }

      if (error) {
        throw error;
      }

      await runPromise;

      if (!result) {
        throw new Error('No result received');
      }

      return result;
    } finally {
      this.off('stream', onStream);
      this.off('complete', onComplete);
      this.off('error', onError);
    }
  }

  // Abort current execution
  abort(): void {
    this.#engine?.abort();
  }

  // Close and cleanup
  close(): void {
    this.abort();
    flushSync(() => {
      unmountContainer(this.#containerInfo);
    });
    this.removeAllListeners();
  }
}
