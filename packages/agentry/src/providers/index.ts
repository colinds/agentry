import { anthropicAdapter } from './anthropic'
import { openaiAdapter } from './openai'
import type { ProviderAdapter } from './types'
import type { ProviderName } from '../types/provider'

export { anthropicAdapter, openaiAdapter }
export type { ProviderAdapter, ProviderClientMap } from './types'

export function createDefaultAdapters(): Record<
  string,
  ProviderAdapter<ProviderName>
> {
  return {
    anthropic: anthropicAdapter,
    openai: openaiAdapter,
  }
}
