import { createElement, type ReactNode } from 'react'
import type { AgentInstance } from '../instances/types'
import type { AgentMessageParam } from '../types/messages'
import { createContainer, updateContainer } from '../reconciler/renderer'
import { createAgentStore } from '../store'
import { isAgentInstance } from '../instances/types'
import { AgentProvider } from '../context'
import { ANTHROPIC_MODEL, OPENAI_MODEL } from '../constants'
import { AbstractAgentHandle } from './AbstractAgentHandle'
import type { ExecutionEngineConfig } from '../execution/ExecutionEngine'
import type { ProviderName } from '../types/provider'
import type { ProviderClientMap } from '../providers/types'
import { createDefaultAdapters } from '../providers'
import {
  ensureProviderClient,
  getProviderClient,
  inferProviderFromClient,
  setProviderClient,
} from '../providers/clientResolver'

/**
 * Handle for controlling a regular agent at runtime
 *
 * Provides methods to send messages, stream responses, and control execution
 */
export class AgentHandle extends AbstractAgentHandle {
  private element: ReactNode
  private mode: 'batch' | 'interactive'
  private unresolvedClient?: ProviderClientMap[ProviderName]

  constructor(
    element: ReactNode,
    options: {
      client?: ProviderClientMap[ProviderName]
      clients?: Partial<ProviderClientMap>
    } = {},
    mode: 'batch' | 'interactive' = 'batch',
  ) {
    let providerHint: ProviderName | undefined
    let unresolvedClient: ProviderClientMap[ProviderName] | undefined
    const clients: Partial<ProviderClientMap> = { ...options.clients }
    if (options.client) {
      providerHint = inferProviderFromClient(options.client)
      if (providerHint) {
        setProviderClient(clients, providerHint, options.client)
      } else {
        unresolvedClient = options.client
      }
    }
    const store = createAgentStore()

    const rootAgent: AgentInstance = {
      type: 'agent',
      props: {
        provider: undefined,
        model: providerHint === 'openai' ? OPENAI_MODEL : ANTHROPIC_MODEL,
        maxTokens: 4096,
        stream: true,
      },
      client:
        providerHint ? getProviderClient(clients, providerHint) : undefined,
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

    super(clients, createDefaultAdapters(), containerInfo, store)
    this.element = element
    this.mode = mode
    this.unresolvedClient = unresolvedClient
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
    if (!getProviderClient(this.clients, provider) && this.unresolvedClient) {
      setProviderClient(this.clients, provider, this.unresolvedClient)
      this.unresolvedClient = undefined
    }
    agent.client = ensureProviderClient(this.clients, provider)

    return agent
  }
}
