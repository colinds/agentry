import type Anthropic from '@anthropic-ai/sdk'
import type OpenAI from 'openai'
import { providerDisplayNames, type ProviderName } from '../types/provider'
import type { ProviderClientMap } from './types'

type ProviderClient = ProviderClientMap[ProviderName]

const sharedDefaultClients: Partial<ProviderClientMap> = {}
// Stores in-flight promises so concurrent callers share one SDK instance instead of creating duplicates.
const pendingClients: Partial<Record<ProviderName, Promise<ProviderClient>>> =
  {}

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
  return new OpenAIClass({ apiKey: process.env[envVarNames.openai] })
}

const envVarNames: Record<ProviderName, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
}

const clientFactories: Record<ProviderName, () => Promise<ProviderClient>> = {
  anthropic: createDefaultAnthropicClient,
  openai: createDefaultOpenAIClient,
}

async function getSharedDefaultClient(
  provider: ProviderName,
): Promise<ProviderClient> {
  const envVar = envVarNames[provider]
  if (!process.env[envVar]) {
    throw new Error(
      `No ${providerDisplayNames[provider]} client configured. Provide clients.${provider} or set ${envVar}.`,
    )
  }

  if (!sharedDefaultClients[provider]) {
    pendingClients[provider] ??= clientFactories[provider]().then(
      (client) => {
        Object.assign(sharedDefaultClients, { [provider]: client })
        pendingClients[provider] = undefined
        return client
      },
      (err) => {
        pendingClients[provider] = undefined
        throw err
      },
    )
    return pendingClients[provider]!
  }

  return sharedDefaultClients[provider]!
}

export async function ensureProviderClient(
  clients: Partial<ProviderClientMap>,
  provider: ProviderName,
): Promise<ProviderClient> {
  const configured = clients[provider]
  if (configured) {
    return configured
  }
  const client = await getSharedDefaultClient(provider)
  // Write the resolved client back into the caller's map so subsequent calls
  // hit the fast path (configured check above) instead of going through the
  // shared cache again. Object.assign avoids a cast since TypeScript can't
  // narrow Partial<ProviderClientMap>[provider] through a union-typed key.
  Object.assign(clients, { [provider]: client })
  return client
}

/** For testing only — clears the module-level default client cache. */
export function resetSharedDefaultClients(): void {
  sharedDefaultClients.anthropic = undefined
  sharedDefaultClients.openai = undefined
  pendingClients.anthropic = undefined
  pendingClients.openai = undefined
}
