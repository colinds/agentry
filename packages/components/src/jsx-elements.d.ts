import type {} from 'react'
import type {} from 'react/jsx-runtime'
import type {} from 'react/jsx-dev-runtime'
import type { ReactNode } from 'react'
import type { InternalTool } from '@agentry/core'
import type {
  BetaToolUnion,
  BetaRequestMCPServerToolConfiguration,
} from '@anthropic-ai/sdk/resources/beta'
import type { AgentProps } from './Agent.tsx'

export interface AgentryElements {
  agent: Omit<AgentProps, 'model'> & {
    model?: AgentProps['model']
    children?: ReactNode
    /** Deferred children - stored but not reconciled during parent render */
    deferredChildren?: ReactNode
  }

  tool: { tool: InternalTool<unknown>; key?: string }

  sdk_tool: { tool: BetaToolUnion; key?: string }

  system: { children: ReactNode; priority?: number }

  context: { children: ReactNode; priority?: number }

  message: { role: 'user' | 'assistant'; children: ReactNode }

  tools: { children?: ReactNode }

  mcp_server: {
    name: string
    url: string
    authorization_token?: string
    tool_configuration?: BetaRequestMCPServerToolConfiguration
    key?: string
  }
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
