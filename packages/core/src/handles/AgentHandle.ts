import Anthropic from '@anthropic-ai/sdk'
import { createElement, type ReactNode } from 'react'
import type { AgentInstance } from '../instances/types.ts'
import { createContainer, updateContainer } from '../reconciler/renderer.ts'
import { createAgentStore } from '../store.ts'
import { PendingUpdatesQueue } from '../instances/PendingUpdatesQueue.ts'
import { isAgentInstance } from '../instances/types.ts'
import { AgentProvider } from '../context.ts'
import { MODEL } from '@agentry/shared'
import { AbstractAgentHandle } from './AbstractAgentHandle.ts'

/**
 * Handle for controlling a regular agent at runtime
 *
 * Provides methods to send messages, stream responses, and control execution
 */
export class AgentHandle extends AbstractAgentHandle {
  private element: ReactNode

  constructor(element: ReactNode, client?: Anthropic) {
    const anthropicClient = client ?? new Anthropic()
    const store = createAgentStore()

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
      pendingUpdates: new PendingUpdatesQueue(),
      parent: null,
    }

    const containerInfo = createContainer(rootAgent)

    super(anthropicClient, containerInfo, store)
    this.element = element
  }

  update(element: ReactNode): void {
    this.element = element
    const wrappedElement = this.wrapWithProvider(element)
    updateContainer(wrappedElement, this.containerInfo)
  }

  private wrapWithProvider(element: ReactNode): ReactNode {
    return createElement(AgentProvider, {
      store: this.store,
      children: element,
    })
  }

  protected shouldEmitEvents(): boolean {
    return true
  }

  protected async prepareAgent(): Promise<AgentInstance> {
    await this.renderWithProvider(this.element)

    const container = this.containerInfo.container
    if (!isAgentInstance(container)) {
      throw new Error('Root container is not an agent instance')
    }

    const agent = container.children[0]
    if (!agent || !isAgentInstance(agent)) {
      throw new Error('No agent element found in tree')
    }

    return agent
  }
}
