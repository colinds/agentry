import type Anthropic from '@anthropic-ai/sdk'
import type OpenAI from 'openai'
import type { AgentStreamEvent, Model, ThinkingConfig } from '../types'
import type { AgentMessage, AgentMessageParam } from '../types/messages'
import type { InternalTool, BuiltInTool } from '../types/tools'
import type { ProviderName } from '../types/provider'

export interface ProviderClientMap {
  anthropic: Anthropic
  openai: OpenAI
}

export interface SystemBlock {
  type: 'text'
  text: string
  cache_control?: { type: 'ephemeral' }
}

export interface MCPServerConfig {
  type: 'url'
  name: string
  url: string
  authorization_token?: string
  tool_configuration?: {
    enabled?: boolean
    allowed_tools?: string[]
  }
}

export interface NormalizedTurnRequest {
  model: Model
  maxTokens: number
  system?: string | SystemBlock[]
  messages: AgentMessageParam[]
  tools: InternalTool[]
  sdkTools: BuiltInTool[]
  mcpServers: MCPServerConfig[]
  stopSequences?: string[]
  temperature?: number
  thinking?: ThinkingConfig
  /** Anthropic-specific beta features to enable. Ignored by other providers. */
  betas?: string[]
  stream?: boolean
  signal: AbortSignal
  onStream: (event: AgentStreamEvent) => void
}

export interface NormalizedTurnResponse {
  message: AgentMessage
}

export interface ProviderAdapter<TName extends ProviderName = ProviderName> {
  name: TName
  createTurn(
    client: ProviderClientMap[TName],
    request: NormalizedTurnRequest,
  ): Promise<NormalizedTurnResponse>
}
