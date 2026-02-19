import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import type { ProviderName } from '../types/provider'
import type { ProviderClientMap } from './types'

type ProviderClient = ProviderClientMap[ProviderName]

const sharedDefaultClients: Partial<ProviderClientMap> = {}

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

function getSharedDefaultClient(provider: ProviderName): ProviderClient {
  if (provider === 'anthropic') {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        'No Anthropic client configured. Provide clients.anthropic or set ANTHROPIC_API_KEY.',
      )
    }
    if (!sharedDefaultClients.anthropic) {
      sharedDefaultClients.anthropic = new Anthropic()
    }
    return sharedDefaultClients.anthropic
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      'No OpenAI client configured. Provide clients.openai or set OPENAI_API_KEY.',
    )
  }
  if (!sharedDefaultClients.openai) {
    sharedDefaultClients.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }
  return sharedDefaultClients.openai
}

export function ensureProviderClient(
  clients: Partial<ProviderClientMap>,
  provider: ProviderName,
): ProviderClient {
  const configured = getProviderClient(clients, provider)
  if (configured) {
    return configured
  }

  const sharedDefault = getSharedDefaultClient(provider)
  setProviderClient(clients, provider, sharedDefault)
  return sharedDefault
}
