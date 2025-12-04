import Anthropic from '@anthropic-ai/sdk'
import { createElement, type ReactNode } from 'react'
import type { AgentInstance } from '../instances/types.ts'
import type { BetaMessageParam } from '../types/messages.ts'
import { createContainer, updateContainer } from '../reconciler/renderer.ts'
import { createAgentStore } from '../store.ts'
import { isAgentInstance } from '../instances/types.ts'
import { AgentProvider } from '../context.ts'
import { MODEL } from '@agentry/shared'
import { AbstractAgentHandle } from './AbstractAgentHandle.ts'
import type { ExecutionEngineConfig } from '../execution/ExecutionEngine.ts'

/**
 * Handle for controlling a regular agent at runtime
 *
 * Provides methods to send messages, stream responses, and control execution
 */
export class AgentHandle extends AbstractAgentHandle {
  private element: ReactNode
  private mode: 'batch' | 'interactive'

  constructor(
    element: ReactNode,
    client?: Anthropic,
    mode: 'batch' | 'interactive' = 'batch',
  ) {
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
      mcpServers: [],
      children: [],
      parent: null,
      store,
    }

    const containerInfo = createContainer(rootAgent)

    super(anthropicClient, containerInfo, store)
    this.element = element
    this.mode = mode
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

  protected override beforeExecution(
    _agent: AgentInstance,
    _config: ExecutionEngineConfig,
    messages: readonly BetaMessageParam[],
  ): void {
    // only validate in batch mode
    if (this.mode === 'batch' && messages.length === 0) {
      throw new Error(
        'Agent has no messages. In batch mode, provide at least one <Message> component.',
      )
    }
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
