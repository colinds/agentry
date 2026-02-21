import type { ReactNode } from 'react'
import type { InternalTool, InternalAgentTool } from '../types'
import type { BuiltInTool } from '../types/tools'
import type { AgentComponentPublicProps } from './Agent.tsx'
import type { MCPServerConfig } from '../instances/types'
import type { AgentContentBlock } from '../types/messages'
import type { ProviderName } from '../types/provider'
import type { Model } from '../types/agent'

export interface AgentryElements {
  // Internal reconciler element — both fields are optional so the reconciler can
  // accept any combination (subagents inherit provider/model at runtime).
  agent: Omit<AgentComponentPublicProps, 'provider' | 'model'> & {
    provider?: ProviderName
    model?: Model
    children?: ReactNode
    /** Deferred children - stored but not reconciled during parent render */
    agentNode?: ReactNode
  }

  tool: { tool: InternalTool; key?: string }

  agent_tool: { agentTool: InternalAgentTool; key?: string }

  built_in_tool: { tool: BuiltInTool; key?: string }

  system: { children: ReactNode; cache?: 'ephemeral' }

  context: { children: ReactNode; cache?: 'ephemeral' }

  message: {
    role: 'user' | 'assistant'
    children?: ReactNode
    rawContent?: string | AgentContentBlock[]
  }

  tools: { children?: ReactNode }

  mcp_server: {
    name: string
    url: string
    authorization_token?: string
    tool_configuration?: MCPServerConfig['tool_configuration']
    key?: string
  }

  condition: { when: boolean | string; children?: ReactNode }
}

declare module 'react' {
  namespace JSX {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface IntrinsicElements extends AgentryElements {}
  }
}

declare module 'react/jsx-runtime' {
  namespace JSX {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface IntrinsicElements extends AgentryElements {}
  }
}

declare module 'react/jsx-dev-runtime' {
  namespace JSX {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface IntrinsicElements extends AgentryElements {}
  }
}
