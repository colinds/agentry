import type { ReactNode } from 'react'
import type { InternalTool, InternalAgentTool } from '@agentry/core/types'
import type {
  BetaToolUnion,
  BetaRequestMCPServerToolConfiguration,
} from '@anthropic-ai/sdk/resources/beta'
import type { AgentComponentPublicProps } from './Agent.tsx'

export interface AgentryElements {
  agent: Omit<AgentComponentPublicProps, 'model'> & {
    model?: AgentComponentPublicProps['model']
    children?: ReactNode
    /** Deferred children - stored but not reconciled during parent render */
    agentNode?: ReactNode
  }

  tool: { tool: InternalTool<unknown>; key?: string }

  agent_tool: { agentTool: InternalAgentTool<unknown>; key?: string }

  sdk_tool: { tool: BetaToolUnion; key?: string }

  system: { children: ReactNode; cache?: 'ephemeral' }

  context: { children: ReactNode; cache?: 'ephemeral' }

  message: { role: 'user' | 'assistant'; children: ReactNode }

  tools: { children?: ReactNode }

  mcp_server: {
    name: string
    url: string
    authorization_token?: string
    tool_configuration?: BetaRequestMCPServerToolConfiguration
    key?: string
  }

  router: { children?: ReactNode }

  route: { when: boolean | string; children?: ReactNode }
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

export {}
