import { anthropicAdapter } from './anthropic'
import { openaiAdapter } from './openai'
import type { ProviderAdapter } from './types'

export { anthropicAdapter, openaiAdapter }
export type { ProviderAdapter, ProviderClientMap } from './types'

export function createDefaultAdapters(): Record<string, ProviderAdapter> {
  return {
    anthropic: anthropicAdapter,
    openai: openaiAdapter,
  }
}
