import Anthropic from '@anthropic-ai/sdk'
import { createContainer } from '@agentry/core/reconciler'
import { createAgentStore } from '@agentry/core/store'
import {
  type AgentInstance,
  type SubagentInstance,
  isAgentInstance,
} from '@agentry/core/instances/types'
import type { BetaMessageParam } from '../types/messages.ts'
import { AbstractAgentHandle } from './AbstractAgentHandle.ts'
import type { ExecutionEngineConfig } from '../execution/ExecutionEngine.ts'

export class SubagentHandle extends AbstractAgentHandle {
  private subagent: SubagentInstance
  private abortHandler: (() => void) | undefined = undefined
  private abortSignal: AbortSignal | undefined = undefined

  constructor(
    subagent: SubagentInstance,
    options: {
      client: Anthropic
      signal?: AbortSignal
    },
  ) {
    const { client, signal } = options

    const store = createAgentStore()

    const container: AgentInstance = {
      type: 'agent',
      props: { ...subagent.props },
      client,
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

    const containerInfo = createContainer(container)

    super(client, containerInfo, store)

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
    messages: readonly BetaMessageParam[],
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

    // Copy props from subagent to the rendered instance
    if (!agentInstance.props.model && this.subagent.props.model) {
      agentInstance.props.model = this.subagent.props.model
    }

    const { temperature, maxIterations, stopSequences, stream } =
      this.subagent.props
    Object.assign(agentInstance.props, {
      maxTokens: this.subagent.props.maxTokens,
      ...(temperature !== undefined && { temperature }),
      ...(maxIterations !== undefined && { maxIterations }),
      ...(stopSequences !== undefined && { stopSequences }),
      ...(stream !== undefined && { stream }),
    })

    return agentInstance
  }

  protected override cleanup(): void {
    if (this.abortSignal && this.abortHandler) {
      this.abortSignal.removeEventListener('abort', this.abortHandler)
    }
  }
}
