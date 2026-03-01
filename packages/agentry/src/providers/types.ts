import type Anthropic from '@anthropic-ai/sdk'
import type OpenAI from 'openai'
import type { AgentStreamEvent, Model, ThinkingConfig } from '../types'
import type { AgentMessage, AgentMessageParam } from '../types/messages'
import type { InternalTool, BuiltInTool } from '../types/tools'
import type { ProviderName } from '../types/provider'
import type { ResponsesWSLike } from '../providers/openai'
import type { Beta } from '@anthropic-ai/sdk/resources/beta'

export interface ProviderClientMap {
  anthropic: Anthropic
  openai: OpenAI
}

export interface OpenAIProviderConfig {
  client?: OpenAI
}

/** @internal Test-only key for injecting a mock ResponsesWS factory through provider config. */
export const OPENAI_INTERNAL_WS_FACTORY: unique symbol = Symbol(
  'agentry.openai.internal_ws_factory',
)

/** @internal */
export type OpenAIProviderConfigInternal = OpenAIProviderConfig & {
  [OPENAI_INTERNAL_WS_FACTORY]?: (client: OpenAI) => ResponsesWSLike
}

export interface AnthropicProviderConfig {
  client?: Anthropic
}

/** Per-provider config: client instance + provider-specific options */
export interface ProvidersConfig {
  openai?: OpenAIProviderConfig
  anthropic?: AnthropicProviderConfig
}

// Compile-time check: ProviderClientMap keys must exactly match ProviderName
const _assertProviderClientMapKeys: Record<ProviderName, unknown> =
  {} as ProviderClientMap
void _assertProviderClientMapKeys

// Compile-time check: ProvidersConfig keys must exactly match ProviderName
const _assertProvidersConfigKeys: Record<ProviderName, unknown> =
  {} as Required<ProvidersConfig>
void _assertProvidersConfigKeys

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

// Compile-time check: MCPServerConfig must stay compatible with the Anthropic SDK
const _assertMCPAnthropicCompat: Beta.Messages.BetaRequestMCPServerURLDefinition =
  {} as MCPServerConfig
void _assertMCPAnthropicCompat

// Compile-time check: MCPServerConfig fields must stay compatible with the OpenAI SDK
const _assertMCPOpenAICompat: Pick<
  OpenAI.Responses.Tool.Mcp,
  'server_label' | 'server_url' | 'authorization'
> = {} as {
  server_label: MCPServerConfig['name']
  server_url: MCPServerConfig['url']
  authorization: MCPServerConfig['authorization_token']
}
void _assertMCPOpenAICompat

export interface NormalizedTurnRequest {
  model: Model
  maxTokens: number
  system?: string | SystemBlock[]
  messages: AgentMessageParam[]
  tools: InternalTool[]
  builtInTools: BuiltInTool[]
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
  /** Optional lifecycle hook — called when the owning agent handle is closed */
  close?(): void
  /** Optional state hook — called when message history is replaced (e.g. compaction) */
  resetChain?(): void
}
