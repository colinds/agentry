import type Anthropic from '@anthropic-ai/sdk'
import type OpenAI from 'openai'
import type { ProviderName } from '../types/provider'
import type { ProviderClientMap } from './types'

type ProviderClient = ProviderClientMap[ProviderName]

const sharedDefaultClients: Partial<ProviderClientMap> = {}
// Stores in-flight promises so concurrent callers share one SDK instance instead of creating duplicates.
const pendingClients: Partial<Record<ProviderName, Promise<ProviderClient>>> =
  {}

export function setProviderClient(
  clients: Partial<ProviderClientMap>,
  provider: ProviderName,
  client: ProviderClient,
): void {
  Object.assign(
    clients,
    provider === 'anthropic' ? { anthropic: client } : { openai: client },
  )
}

export function getProviderClient(
  clients: Partial<ProviderClientMap>,
  provider: ProviderName,
): ProviderClient | undefined {
  return provider === 'anthropic' ? clients.anthropic : clients.openai
}

async function createDefaultAnthropicClient(): Promise<
  InstanceType<typeof Anthropic>
> {
  let AnthropicClass: typeof Anthropic
  try {
    ;({ default: AnthropicClass } = await import('@anthropic-ai/sdk'))
  } catch (err) {
    throw new Error(
      'No Anthropic client provided and @anthropic-ai/sdk is not installed. ' +
        'Either pass a client to createAI() or install @anthropic-ai/sdk.',
      { cause: err },
    )
  }
  return new AnthropicClass()
}

async function createDefaultOpenAIClient(): Promise<
  InstanceType<typeof OpenAI>
> {
  let OpenAIClass: typeof OpenAI
  try {
    ;({ default: OpenAIClass } = await import('openai'))
  } catch (err) {
    throw new Error(
      'No OpenAI client provided and openai is not installed. ' +
        'Either pass a client to createAI() or install openai.',
      { cause: err },
    )
  }
  return new OpenAIClass({ apiKey: process.env.OPENAI_API_KEY })
}

async function getSharedDefaultClient(
  provider: ProviderName,
): Promise<ProviderClient> {
  if (provider === 'anthropic') {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        'No Anthropic client configured. Provide clients.anthropic or set ANTHROPIC_API_KEY.',
      )
    }
    if (!sharedDefaultClients.anthropic) {
      pendingClients.anthropic ??= createDefaultAnthropicClient().then(
        (client) => {
          sharedDefaultClients.anthropic = client
          pendingClients.anthropic = undefined
          return client
        },
        (err) => {
          pendingClients.anthropic = undefined
          throw err
        },
      )
      return pendingClients.anthropic
    }
    return sharedDefaultClients.anthropic
  }

  if (provider === 'openai') {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        'No OpenAI client configured. Provide clients.openai or set OPENAI_API_KEY.',
      )
    }
    if (!sharedDefaultClients.openai) {
      pendingClients.openai ??= createDefaultOpenAIClient().then(
        (client) => {
          sharedDefaultClients.openai = client
          pendingClients.openai = undefined
          return client
        },
        (err) => {
          pendingClients.openai = undefined
          throw err
        },
      )
      return pendingClients.openai
    }
    return sharedDefaultClients.openai
  }

  throw new Error(
    `[agentry] No default client factory for unknown provider: "${provider as string}". ` +
      'Pass a client explicitly via createAI({ clients: { ... } }).',
  )
}

export function inferProviderFromClient(
  client: ProviderClient,
): ProviderName | undefined {
  const constructorName = (client as { constructor?: { name?: string } })
    ?.constructor?.name
  if (constructorName === 'Anthropic') return 'anthropic'
  if (constructorName === 'OpenAI') return 'openai'
  return undefined
}

export async function ensureProviderClient(
  clients: Partial<ProviderClientMap>,
  provider: ProviderName,
): Promise<ProviderClient> {
  const configured = getProviderClient(clients, provider)
  if (configured) {
    return configured
  }
  return getSharedDefaultClient(provider)
}

/** For testing only — clears the module-level default client cache. */
export function resetSharedDefaultClients(): void {
  sharedDefaultClients.anthropic = undefined
  sharedDefaultClients.openai = undefined
  pendingClients.anthropic = undefined
  pendingClients.openai = undefined
}
