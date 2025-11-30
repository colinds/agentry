import Anthropic from '@anthropic-ai/sdk';
import { createElement, type ReactNode } from 'react';
import {
  createContainer,
  updateContainer,
  createAgentStore,
  type AgentInstance,
  isAgentInstance,
} from '@agentry/core';
import { MODEL } from '@agentry/shared';
import { AgentProvider } from '../hooks.ts';
import { AbstractAgentHandle } from './AbstractAgentHandle.ts';

/**
 * Handle for controlling a regular agent at runtime
 *
 * Provides methods to send messages, stream responses, and control execution
 */
export class AgentHandle extends AbstractAgentHandle {
  private element: ReactNode;

  constructor(element: ReactNode, client?: Anthropic) {
    const anthropicClient = client ?? new Anthropic();
    const store = createAgentStore();

    // Create root agent instance as container
    const rootAgent: AgentInstance = {
      type: 'agent',
      props: {
        model: MODEL,
        maxTokens: 4096,
        stream: true,
      },
      client: anthropicClient,
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

    const containerInfo = createContainer(rootAgent);

    super(anthropicClient, containerInfo, store);
    this.element = element;
  }

  // Update the rendered element
  update(element: ReactNode): void {
    this.element = element;
    const wrappedElement = this.wrapWithProvider(element);
    updateContainer(wrappedElement, this.containerInfo);
  }

  // Wrap element with provider
  private wrapWithProvider(element: ReactNode): ReactNode {
    return createElement(AgentProvider, { store: this.store, children: element });
  }

  protected shouldEmitEvents(): boolean {
    return true;
  }

  protected async prepareAgent(firstMessage?: string): Promise<AgentInstance> {
    // Render element to collect state (renderWithProvider handles AgentProvider wrapping)
    await this.renderWithProvider(this.element);

    const container = this.containerInfo.container;
    if (!isAgentInstance(container)) {
      throw new Error('Root container is not an agent instance');
    }

    const agent = container.children[0];
    if (!agent || !isAgentInstance(agent)) {
      throw new Error('No agent element found in tree');
    }

    return agent;
  }
}

