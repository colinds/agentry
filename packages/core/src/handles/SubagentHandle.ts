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

    const rootAgent: AgentInstance = {
      type: 'agent',
      props: { ...subagent.props },
      client,
      engine: null,
      systemParts: [...subagent.systemParts],
      tools: [...subagent.tools],
      sdkTools: [...subagent.sdkTools],
      contextParts: [...subagent.contextParts],
      messages: [],
      mcpServers: [...subagent.mcpServers],
      children: [],
      pendingUpdates: subagent.pendingUpdates,
      parent: null,
    }

    const containerInfo = createContainer(rootAgent)
    const store = createAgentStore()

    super(client, containerInfo, store)

    this.subagent = subagent

    if (signal) {
      const abortHandler = () => {
        if (rootAgent.engine) {
          rootAgent.engine.abort()
        }
      }
      signal.addEventListener('abort', abortHandler)
      this.abortHandler = abortHandler
      this.abortSignal = signal
    }

    this.instance = rootAgent
  }

  protected shouldEmitEvents(): boolean {
    return false
  }

  protected override async prepareAgent(): Promise<AgentInstance> {
    const agent = this.instance
    if (!agent || !isAgentInstance(agent)) {
      throw new Error('Subagent instance not found')
    }

    if (!agent.props.model) {
      throw new Error(
        `Subagent has no model. ` +
          `Either specify a model on the subagent or ensure the parent agent has a model to inherit.`,
      )
    }

    if (this.subagent.reactChildren) {
      await this.renderWithProvider(this.subagent.reactChildren)
    }

    for (const msg of this.subagent.messages) {
      agent.messages.push(msg)
    }

    return agent
  }

  protected override cleanup(): void {
    if (this.abortSignal && this.abortHandler) {
      this.abortSignal.removeEventListener('abort', this.abortHandler)
    }
  }
}
