import { anthropicAdapter } from './anthropic'
import { openaiAdapter } from './openai'
import type { ProviderAdapter } from './types'
import type { ProviderName } from '../types/provider'

export type { ProviderAdapter, ProviderClientMap } from './types'
export { createOpenAIAdapter } from './openai'

export function createDefaultAdapters(): Record<
  ProviderName,
  ProviderAdapter<ProviderName>
> {
  return {
    anthropic: anthropicAdapter,
    openai: openaiAdapter,
  }
}
