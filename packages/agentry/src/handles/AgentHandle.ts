import { type ReactNode } from 'react'
import { InstanceType, type AgentInstance } from '../instances/types'
import type { AgentMessageParam } from '../types/messages'
import { createContainer } from '../reconciler/renderer'
import { createAgentStore } from '../store'
import { isAgentInstance } from '../instances'
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
import { createOpenAIAdapter, type ResponsesWSLike } from '../providers/openai'
import { ensureProviderClient } from '../providers/clientResolver'
import type OpenAI from 'openai'

/**
 * Handle for controlling a regular agent at runtime
 *
 * Provides methods to send messages, stream responses, and control execution
 */
export class AgentHandle extends AbstractAgentHandle {
  private element: ReactNode
  private mode: 'batch' | 'interactive'
  private wsFactory: ((client: OpenAI) => ResponsesWSLike) | undefined
  private isDirty = true
  private initialProps:
    | {
        provider: string
        model: string
        websocket: boolean
      }
    | undefined

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

    const adapters: Record<string, ProviderAdapter<ProviderName>> = {
      ...createDefaultAdapters(),
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
    this.wsFactory = responsesWSFactory
  }

  update(element: ReactNode): void {
    this.element = element
    this.isDirty = true
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
    if (this.isDirty) {
      await this.renderWithProvider(this.element)
      this.isDirty = false
    }

    if (this.instance !== null) {
      if (this.initialProps === undefined) {
        throw new Error(
          'Internal error: initialProps not set but instance exists',
        )
      }
      const agent = this.instance
      const provider = agent.props.provider
      const model = agent.props.model
      const websocket =
        agent.props.provider === 'openai'
          ? (agent.props.websocket ?? false)
          : false

      if (this.initialProps.provider !== provider) {
        throw new Error(
          `Agent provider cannot change between runs (was "${this.initialProps.provider}", got "${provider}"). ` +
            `Create a new agent handle instead.`,
        )
      }
      if (this.initialProps.model !== model) {
        throw new Error(
          `Agent model cannot change between runs (was "${this.initialProps.model}", got "${model}"). ` +
            `Create a new agent handle instead.`,
        )
      }
      if (this.initialProps.websocket !== websocket) {
        throw new Error(
          `Agent websocket mode cannot change between runs (was ${this.initialProps.websocket}, got ${websocket}). ` +
            `Create a new agent handle instead.`,
        )
      }

      return agent
    }

    // First run only: full setup
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
    const model = agent.props.model
    if (!model) {
      throw new Error('Model is required on the rendered agent.')
    }
    const websocket =
      agent.props.provider === 'openai'
        ? (agent.props.websocket ?? false)
        : false

    this.initialProps = { provider, model, websocket }

    agent.client = await ensureProviderClient(this.clients, provider)

    if (agent.props.provider === 'openai' && agent.props.websocket) {
      this.adapters.openai = createOpenAIAdapter({
        websocket: true,
        _responsesWSFactory: this.wsFactory,
      })
    }

    return agent
  }
}
