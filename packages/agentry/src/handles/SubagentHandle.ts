import { createContainer } from '../reconciler'
import { createAgentStore } from '../store'
import {
  type AgentInstance,
  type SubagentInstance,
  isAgentInstance,
} from '../instances/types'
import type { AgentMessageParam } from '../types/messages'
import { AbstractAgentHandle } from './AbstractAgentHandle'
import type { ExecutionEngineConfig } from '../execution/ExecutionEngine'
import type { ProviderClientMap } from '../providers/types'
import type { ProviderName } from '../types/provider'
import { createDefaultAdapters } from '../providers'
import {
  ensureProviderClient,
  setProviderClient,
} from '../providers/clientResolver'

export class SubagentHandle extends AbstractAgentHandle {
  private subagent: SubagentInstance
  private abortHandler: (() => void) | undefined = undefined
  private abortSignal: AbortSignal | undefined = undefined

  constructor(
    subagent: SubagentInstance,
    options: {
      client?: ProviderClientMap[ProviderName]
      clients?: Partial<ProviderClientMap>
      provider?: ProviderName
      signal?: AbortSignal
    },
  ) {
    const { signal } = options
    const provider = options.provider ?? subagent.props.provider
    if (!provider) {
      throw new Error('Provider is required for the subagent.')
    }
    const clients: Partial<ProviderClientMap> = { ...options.clients }
    if (options.client) {
      setProviderClient(clients, provider, options.client)
    }

    const store = createAgentStore()

    const container: AgentInstance = {
      type: 'agent',
      props: { ...subagent.props },
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

    const containerInfo = createContainer(container)

    super({
      clients,
      adapters: createDefaultAdapters(),
      containerInfo,
      store,
    })

    this.subagent = subagent

    if (signal) {
      const abortHandler = () => {
        this.engine?.abort()
      }
      signal.addEventListener('abort', abortHandler)
      this.abortHandler = abortHandler
      this.abortSignal = signal
    }
  }

  protected shouldEmitEvents(): boolean {
    return false
  }

  protected override beforeExecution(
    _agent: AgentInstance,
    _config: ExecutionEngineConfig,
    messages: readonly AgentMessageParam[],
  ): void {
    // subagents always need messages
    if (messages.length === 0) {
      throw new Error(
        'Subagent has no messages. Subagents must have at least one <Message> component.',
      )
    }
  }

  protected override async prepareAgent(): Promise<AgentInstance> {
    if (!this.subagent.agentNode) {
      throw new Error('Subagent has no agent element to render')
    }

    await this.renderWithProvider(this.subagent.agentNode)

    const container = this.containerInfo.container
    if (!isAgentInstance(container)) {
      throw new Error('Subagent container not found')
    }

    const agentInstance = container.children[0]
    if (!agentInstance || !isAgentInstance(agentInstance)) {
      throw new Error(
        'Agent element did not render an AgentInstance. The agent function must return an <Agent> element.',
      )
    }

    // Inherit subagent props into the rendered instance
    const {
      provider: subagentProvider,
      model: subagentModel,
      maxTokens,
      temperature,
      maxIterations,
      stopSequences,
      stream,
    } = this.subagent.props
    Object.assign(agentInstance.props, {
      ...(!agentInstance.props.provider &&
        subagentProvider && { provider: subagentProvider }),
      ...(!agentInstance.props.model &&
        subagentModel && { model: subagentModel }),
      ...(maxTokens !== undefined && { maxTokens }),
      ...(temperature !== undefined && { temperature }),
      ...(maxIterations !== undefined && { maxIterations }),
      ...(stopSequences !== undefined && { stopSequences }),
      ...(stream !== undefined && { stream }),
    })

    const provider = agentInstance.props.provider
    if (!provider) {
      throw new Error('Provider is required on the subagent instance.')
    }
    agentInstance.client = await ensureProviderClient(this.clients, provider)

    return agentInstance
  }

  protected override cleanup(): void {
    if (this.abortSignal && this.abortHandler) {
      this.abortSignal.removeEventListener('abort', this.abortHandler)
    }
  }
}
