import type { ReactNode } from 'react'
import type { InternalTool, InternalAgentTool } from '../types'
import type { SdkTool } from '../types/tools'
import type { AgentComponentPublicProps } from './Agent.tsx'
import type { MCPServerConfig } from '../instances/types'
import type { AgentContentBlock } from '../types/messages'

export interface AgentryElements {
  agent: Omit<AgentComponentPublicProps, 'model'> & {
    model?: AgentComponentPublicProps['model']
    children?: ReactNode
    /** Deferred children - stored but not reconciled during parent render */
    agentNode?: ReactNode
  }

  tool: { tool: InternalTool; key?: string }

  agent_tool: { agentTool: InternalAgentTool; key?: string }

  sdk_tool: { tool: SdkTool; key?: string }

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
