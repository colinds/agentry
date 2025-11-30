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
  type ContainerInfo,
  type AgentInstance,
  type AgentResult,
  type AgentStreamEvent,
  type AgentState,
  type BetaMessageParam,
  isAgentInstance,
} from '@agentry/core';
import { MODEL } from '@agentry/shared';
import { AgentProvider, createAgentStore, type AgentStore } from './hooks.ts';

// events emitted by AgentHandle
export interface AgentHandleEvents {
  stateChange: (state: AgentState) => void;
  stream: (event: AgentStreamEvent) => void;
  complete: (result: AgentResult) => void;
  error: (error: Error) => void;
}

/**
 * handle for controlling an agent at runtime
 *
 * provides methods to send messages, stream responses, and control execution
 */
export class AgentHandle extends EventEmitter<AgentHandleEvents> {
  #containerInfo: ContainerInfo;
  #engine: ExecutionEngine | null = null;
  #client: Anthropic;
  #element: ReactNode;
  #running = false;
  #store: AgentStore;

  constructor(element: ReactNode, client?: Anthropic) {
    super();
    this.#client = client ?? new Anthropic();
    this.#element = element;
    
    // Create store for hooks to subscribe to
    this.#store = createAgentStore();

    // create a root agent instance as container
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
      children: [],
      pendingUpdates: [],
      parent: null,
      _updating: false,
    };

    this.#containerInfo = createContainer(rootAgent);
  }
  
  // Expose store for advanced use cases (e.g., external subscriptions)
  get store(): AgentStore {
    return this.#store;
  }

  // get the current state
  get state(): AgentState {
    return this.#engine?.state ?? { status: 'idle' };
  }

  // get the conversation messages
  get messages(): readonly BetaMessageParam[] {
    return this.#engine?.messages ?? [];
  }

  // check if the agent is currently running
  get isRunning(): boolean {
    return this.#running;
  }

  // update the rendered element
  update(element: ReactNode): void {
    this.#element = element;
    // Wrap with provider for hooks support
    const wrappedElement = this.#wrapWithProvider(element);
    updateContainer(wrappedElement, this.#containerInfo);
  }
  
  // Helper to wrap element with provider
  #wrapWithProvider(element: ReactNode): ReactNode {
    return createElement(AgentProvider, { store: this.#store, children: element });
  }

  // run the agent and return the result
  async run(): Promise<AgentResult> {
    if (this.#running) {
      throw new Error('Agent is already running');
    }

    this.#running = true;

    // declare handlers before try so they're accessible in finally
    let onStateChange: ((state: AgentState) => void) | undefined;
    let onStream: ((event: AgentStreamEvent) => void) | undefined;
    let onError: ((error: Error) => void) | undefined;

    try {
      // Wrap element with provider for hooks support
      const wrappedElement = this.#wrapWithProvider(this.#element);
      
      // render the element to collect state
      // Use updateContainer with a callback to ensure commit is complete
      await new Promise<void>((resolve) => {
        flushSync(() => {
          updateContainer(wrappedElement, this.#containerInfo, resolve);
        });
      });

      // Additional yield to React's scheduler for any pending effects
      await new Promise<void>(resolve => {
        unstable_scheduleCallback(unstable_NormalPriority, () => resolve());
      });

      const container = this.#containerInfo.container;
      if (!isAgentInstance(container)) {
        throw new Error('Root container is not an agent instance');
      }

      // the actual agent is the first child (the rendered <Agent> element)
      const agent = container.children[0];
      if (!agent || !isAgentInstance(agent)) {
        throw new Error('No agent element found in tree');
      }
      
      // Update store with the agent instance so hooks can access it
      this.#store.setState({ instance: agent });

      // build system prompt from parts (sorted by priority)
      const sortedSystemParts = [...agent.systemParts].sort((a, b) => b.priority - a.priority);
      const systemPrompt = sortedSystemParts.map((p) => p.content).join('\n\n');

      // build context from parts
      const sortedContextParts = [...agent.contextParts].sort((a, b) => b.priority - a.priority);
      const contextContent = sortedContextParts.map((p) => p.content).join('\n\n');

      // combine system and context
      const fullSystem = contextContent ? `${systemPrompt}\n\n${contextContent}` : systemPrompt;

      // Get messages - use existing engine's messages if available (for multi-turn conversations)
      const messages = this.#engine ? [...this.#engine.messages] : agent.messages;

      // create the execution engine (or recreate with updated config)
      this.#engine = new ExecutionEngine({
        client: this.#client,
        model: agent.props.model,
        maxTokens: agent.props.maxTokens ?? 4096,
        system: fullSystem || undefined,
        tools: agent.tools,
        sdkTools: agent.sdkTools,
        messages,
        stream: agent.props.stream,
        maxIterations: agent.props.maxIterations,
        compactionControl: agent.props.compactionControl,
        stopSequences: agent.props.stopSequences,
        temperature: agent.props.temperature,
        agentName: agent.props.name,
        agentInstance: agent,
      });

      // wire up events - handlers captured in closure for cleanup
      onStateChange = (state: AgentState) => {
        // Update store so hooks can react to state changes
        this.#store.setState({ state });
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

      this.#engine.on('stateChange', onStateChange);
      this.#engine.on('stream', onStream);
      this.#engine.on('error', onError);

      // run the engine
      const result = await this.#engine.run();

      this.emit('complete', result);
      agent.props.onComplete?.(result);

      return result;
    } finally {
      // cleanup - handlers captured in closure above
      if (this.#engine && onStateChange && onStream && onError) {
        this.#engine.off('stateChange', onStateChange);
        this.#engine.off('stream', onStream);
        this.#engine.off('error', onError);
      }
      this.#running = false;
    }
  }

  // send a message and get a response
  async sendMessage(content: string): Promise<AgentResult> {
    if (!this.#engine) {
      // first message, need to run
      // Wrap element with provider for hooks support
      const wrappedElement = this.#wrapWithProvider(this.#element);
      
      // Use updateContainer with callback to ensure commit is complete
      await new Promise<void>((resolve) => {
        flushSync(() => {
          updateContainer(wrappedElement, this.#containerInfo, resolve);
        });
      });

      // Additional yield for any pending effects
      await new Promise<void>(resolve => {
        unstable_scheduleCallback(unstable_NormalPriority, () => resolve());
      });

      const container = this.#containerInfo.container;
      if (!isAgentInstance(container)) {
        throw new Error('Root container is not an agent instance');
      }

      // the actual agent is the first child (the rendered <Agent> element)
      const agent = container.children[0];
      if (!agent || !isAgentInstance(agent)) {
        throw new Error('No agent element found in tree');
      }
      
      // Update store with the agent instance
      this.#store.setState({ instance: agent });

      // add the user message
      agent.messages.push({ role: 'user', content });

      return this.run();
    }

    // add message to existing conversation
    this.#engine.pushMessage({ role: 'user', content });
    this.#engine.updateConfig({ messages: [...this.#engine.messages] });

    return this.run();
  }

  // async iterator for streaming
  async *stream(): AsyncGenerator<AgentStreamEvent, AgentResult, undefined> {
    if (this.#running) {
      throw new Error('Agent is already running. Wait for current execution to complete or call abort() first.');
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

    // start the run in background
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

      // yield any remaining events
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
      // cleanup - handlers captured in closure above
      this.off('stream', onStream);
      this.off('complete', onComplete);
      this.off('error', onError);
    }
  }

  // abort the current execution
  abort(): void {
    this.#engine?.abort();
  }

  // close the agent and cleanup
  close(): void {
    this.abort();
    // Use flushSync to ensure unmount is fully committed
    flushSync(() => {
      unmountContainer(this.#containerInfo);
    });
    this.removeAllListeners();
  }
}
