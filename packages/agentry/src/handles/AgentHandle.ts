import { createElement, type ReactNode } from 'react'
import { InstanceType, type AgentInstance } from '../instances/types'
import type { AgentMessageParam } from '../types/messages'
import { createContainer, updateContainer } from '../reconciler/renderer'
import { createAgentStore } from '../store'
import { isAgentInstance } from '../instances'
import { AgentProvider } from '../context'
import { AbstractAgentHandle } from './AbstractAgentHandle'
import type { ExecutionEngineConfig } from '../execution/ExecutionEngine'
import type {
  OpenAIProviderConfigInternal,
  ProviderAdapter,
  ProviderClientMap,
  ProvidersConfig,
} from '../providers/types'
import { OPENAI_INTERNAL_WS_FACTORY } from '../providers/types'
import type { ProviderName } from '../types/provider'
import { createDefaultAdapters } from '../providers'
import { createOpenAIAdapter } from '../providers/openai'
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
    options: { providers?: ProvidersConfig } = {},
    mode: 'batch' | 'interactive' = 'batch',
  ) {
    const openaiConfig = options.providers?.openai as
      | OpenAIProviderConfigInternal
      | undefined
    const responsesWSFactory = openaiConfig?.[OPENAI_INTERNAL_WS_FACTORY]

    // Extract clients from providers config
    const clients: Partial<ProviderClientMap> = {}
    if (options.providers?.openai?.client)
      clients.openai = options.providers.openai.client
    if (options.providers?.anthropic?.client)
      clients.anthropic = options.providers.anthropic.client

    // Build adapters — WS adapter if websocket option enabled
    const adapters: Record<string, ProviderAdapter<ProviderName>> = {
      ...createDefaultAdapters(),
    }
    if (openaiConfig?.websocket || responsesWSFactory) {
      adapters.openai = createOpenAIAdapter({
        websocket: openaiConfig.websocket,
        _responsesWSFactory: responsesWSFactory,
      })
    }

    const store = createAgentStore()

    const rootAgent: AgentInstance = {
      type: InstanceType.Agent,
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
      builtInTools: [],
      mcpServers: [],
      children: [],
      parent: null,
      store,
    }

    const containerInfo = createContainer(rootAgent)

    super({
      clients,
      adapters,
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

    return agent
  }
}
