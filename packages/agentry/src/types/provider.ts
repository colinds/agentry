import type { ProviderId } from './agent'

/**
 * Provider identifier. Retained as an alias of `ProviderId` so existing imports
 * keep working; it is no longer a closed union, because pi resolves providers
 * from its catalog (and from any custom provider registered on a collection).
 */
export type ProviderName = ProviderId
