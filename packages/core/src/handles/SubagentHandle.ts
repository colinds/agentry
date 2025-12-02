import Anthropic from '@anthropic-ai/sdk'
import { createContainer } from '@agentry/core/reconciler'
import { createAgentStore } from '@agentry/core/store'
import {
  type AgentInstance,
  type SubagentInstance,
  isAgentInstance,
} from '@agentry/core/instances/types'
import { AbstractAgentHandle } from './AbstractAgentHandle.ts'

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

    const tempContainer: AgentInstance = {
      type: 'agent',
      props: { ...subagent.props },
      client,
      engine: null,
      systemParts: [],
      tools: [],
      sdkTools: [],
      contextParts: [],
      messages: [],
      mcpServers: [],
      children: [],
      parent: null,
    }

    const containerInfo = createContainer(tempContainer)
    const store = createAgentStore()

    super(client, containerInfo, store)

    this.subagent = subagent

    if (signal) {
      const abortHandler = () => {
        if (
          this.instance &&
          isAgentInstance(this.instance) &&
          this.instance.engine
        ) {
          this.instance.engine.abort()
        }
      }
      signal.addEventListener('abort', abortHandler)
      this.abortHandler = abortHandler
      this.abortSignal = signal
    }

    this.instance = tempContainer
  }

  protected shouldEmitEvents(): boolean {
    return false
  }

  protected override async prepareAgent(): Promise<AgentInstance> {
    if (!this.subagent.agentNode) {
      throw new Error('Subagent has no agent element to render')
    }

    await this.renderWithProvider(this.subagent.agentNode)

    const tempContainer = this.instance
    if (!tempContainer || !isAgentInstance(tempContainer)) {
      throw new Error('Subagent container not found')
    }

    const agentInstance = tempContainer.children[0]
    if (!agentInstance || !isAgentInstance(agentInstance)) {
      throw new Error(
        'Agent element did not render an AgentInstance. The agent function must return an <Agent> element.',
      )
    }

    if (!agentInstance.props.model && this.subagent.props.model) {
      agentInstance.props.model = this.subagent.props.model
    }

    for (const msg of this.subagent.messages) {
      agentInstance.messages.push(msg)
    }

    agentInstance.client = this.client
    this.containerInfo.container = agentInstance
    this.instance = agentInstance
    return agentInstance
  }

  protected override cleanup(): void {
    if (this.abortSignal && this.abortHandler) {
      this.abortSignal.removeEventListener('abort', this.abortHandler)
    }
  }
}
