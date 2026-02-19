import type Anthropic from '@anthropic-ai/sdk'
import type OpenAI from 'openai'
import type { AgentStreamEvent, Model, ThinkingConfig } from '../types'
import type { AgentMessage, AgentMessageParam } from '../types/messages'
import type { InternalTool, SdkTool } from '../types/tools'
import type { MCPServerConfig } from '../instances/types'
import type { ProviderName } from '../types/provider'

export interface ProviderClientMap {
  anthropic: Anthropic
  openai: OpenAI
}

export interface NormalizedTurnRequest {
  model: Model
  maxTokens: number
  system?: string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>
  messages: AgentMessageParam[]
  tools: InternalTool[]
  sdkTools: SdkTool[]
  mcpServers: MCPServerConfig[]
  stopSequences?: string[]
  temperature?: number
  thinking?: ThinkingConfig
  betas?: string[]
  stream?: boolean
  signal: AbortSignal
  onStream: (event: AgentStreamEvent) => void
}

export interface NormalizedTurnResponse {
  message: AgentMessage
}

export interface ProviderAdapter {
  name: ProviderName
  createTurn(
    client: ProviderClientMap[ProviderName],
    request: NormalizedTurnRequest,
  ): Promise<NormalizedTurnResponse>
}
