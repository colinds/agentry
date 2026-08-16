import { createContainer } from '../reconciler'
import { createAgentStore } from '../store'
import {
  type AgentInstance,
  type SubagentInstance,
  InstanceType,
  isAgentInstance,
} from '../instances/types'
import type { AgentMessageParam } from '../types/messages'
import { AbstractAgentHandle } from './AbstractAgentHandle'
import type { ExecutionEngineConfig } from '../execution/ExecutionEngine'
import type { ProviderName } from '../types/provider'
import type { Models } from '@earendil-works/pi-ai'

export class SubagentHandle extends AbstractAgentHandle {
  private subagent: SubagentInstance
  private abortHandler: (() => void) | undefined = undefined
  private abortSignal: AbortSignal | undefined = undefined

  constructor(
    subagent: SubagentInstance,
    options: {
      models: Models
      provider?: ProviderName
      signal?: AbortSignal
    },
  ) {
    const { signal } = options
    const provider = options.provider ?? subagent.props.provider
    if (!provider) {
      throw new Error('Provider is required for the subagent.')
    }

    const store = createAgentStore()

    const container: AgentInstance = {
      type: InstanceType.Agent,
      props: { ...subagent.props },
      systemParts: [],
      tools: new Map(),
      duplicateToolNames: new Set(),
      mcpServers: [],
      children: [],
      parent: null,
      store,
    }

    const containerInfo = createContainer(container)

    super({
      models: options.models,
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

  protected override async renderTurn(): Promise<void> {
    if (this.subagent.agentNode) {
      await this.renderWithProvider(this.subagent.agentNode)
    }
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
    const sub = this.subagent.props
    agentInstance.props.provider ??= sub.provider
    agentInstance.props.model ??= sub.model
    if (sub.maxTokens !== undefined)
      agentInstance.props.maxTokens = sub.maxTokens
    if (sub.temperature !== undefined)
      agentInstance.props.temperature = sub.temperature
    if (sub.maxIterations !== undefined)
      agentInstance.props.maxIterations = sub.maxIterations
    if (sub.stream !== undefined) agentInstance.props.stream = sub.stream

    const provider = agentInstance.props.provider
    if (!provider) {
      throw new Error('Provider is required on the subagent instance.')
    }

    return agentInstance
  }

  protected override cleanup(): void {
    super.cleanup()
    if (this.abortSignal && this.abortHandler) {
      this.abortSignal.removeEventListener('abort', this.abortHandler)
    }
  }
}
