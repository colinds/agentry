import Anthropic from '@anthropic-ai/sdk'
import {
  createContainer,
  createAgentStore,
  type AgentInstance,
  type BetaMessageParam,
  type SubagentInstance,
  isAgentInstance,
} from '@agentry/core'
import { AbstractAgentHandle } from './AbstractAgentHandle.ts'

/**
 * Handle for controlling a subagent at runtime
 * Used internally by renderSubagent to unify execution paths
 */
export class SubagentHandle extends AbstractAgentHandle {
  private subagent: SubagentInstance
  private abortHandler: (() => void) | undefined = undefined
  private abortSignal: AbortSignal | undefined = undefined

  constructor(
    subagent: SubagentInstance,
    options: {
      client: Anthropic
      signal?: AbortSignal
      initialMessages?: BetaMessageParam[]
    },
  ) {
    const { client, signal, initialMessages = [] } = options

    const rootAgent: AgentInstance = {
      type: 'agent',
      props: { ...subagent.props },
      client,
      engine: null,
      systemParts: [...subagent.systemParts],
      tools: [...subagent.tools],
      sdkTools: [...subagent.sdkTools],
      contextParts: [...subagent.contextParts],
      messages: [...subagent.messages, ...initialMessages],
      mcpServers: [...subagent.mcpServers],
      children: [],
      pendingUpdates: subagent.pendingUpdates,
      parent: null,
    }

    const containerInfo = createContainer(rootAgent)
    const store = createAgentStore()

    if (initialMessages.length > 0) {
      store.setState({ messages: [...initialMessages] })
    }

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

    return agent
  }

  protected override cleanup(): void {
    if (this.abortSignal && this.abortHandler) {
      this.abortSignal.removeEventListener('abort', this.abortHandler)
    }
  }
}
