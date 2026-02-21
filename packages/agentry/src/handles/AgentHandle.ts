import { createElement, type ReactNode } from 'react'
import type { AgentInstance } from '../instances/types'
import type { AgentMessageParam } from '../types/messages'
import { createContainer, updateContainer } from '../reconciler/renderer'
import { createAgentStore } from '../store'
import { isAgentInstance } from '../instances/types'
import { AgentProvider } from '../context'
import { AbstractAgentHandle } from './AbstractAgentHandle'
import type { ExecutionEngineConfig } from '../execution/ExecutionEngine'
import type { ProviderClientMap } from '../providers/types'
import { createDefaultAdapters } from '../providers'
import { ensureProviderClient } from '../providers/clientResolver'

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
    options: {
      clients?: Partial<ProviderClientMap>
    } = {},
    mode: 'batch' | 'interactive' = 'batch',
  ) {
    const clients: Partial<ProviderClientMap> = { ...options.clients }
    const store = createAgentStore()

    const rootAgent: AgentInstance = {
      type: 'agent',
      props: {
        provider: undefined,
        model: undefined,
        maxTokens: 4096,
        stream: true,
      },
      client: undefined,
      engine: null,
      systemParts: [],
      tools: [],
      sdkTools: [],
      mcpServers: [],
      children: [],
      parent: null,
      store,
    }

    const containerInfo = createContainer(rootAgent)

    super({
      clients,
      adapters: createDefaultAdapters(),
      containerInfo,
      store,
    })
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
    messages: readonly AgentMessageParam[],
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

    const provider = agent.props.provider
    if (!provider) {
      throw new Error('Provider is required on the rendered agent.')
    }
    if (!agent.props.model) {
      throw new Error('Model is required on the rendered agent.')
    }
    agent.client = await ensureProviderClient(this.clients, provider)
    ;(this.clients as Record<string, typeof agent.client>)[provider] =
      agent.client

    return agent
  }
}
