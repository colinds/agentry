import { cleanupSessionResources } from '@earendil-works/pi-ai'
import type { Api, Model, Models } from '@earendil-works/pi-ai'

let sharedDefaultModels: Models | undefined
let pendingDefaultModels: Promise<Models> | undefined

/**
 * Lazily constructs the default model collection containing every provider pi
 * ships with. Loaded via dynamic import so that consumers who pass their own
 * `Models` never pay for the full provider catalog.
 *
 * Cached module-wide and de-duped across concurrent callers, mirroring the
 * behaviour the old `clientResolver` provided for SDK clients.
 */
export async function getDefaultModels(): Promise<Models> {
  if (sharedDefaultModels) return sharedDefaultModels
  if (pendingDefaultModels) return pendingDefaultModels

  pendingDefaultModels = import('@earendil-works/pi-ai/providers/all')
    .then(({ builtinModels }) => {
      sharedDefaultModels = builtinModels()
      return sharedDefaultModels
    })
    .finally(() => {
      pendingDefaultModels = undefined
    })

  return pendingDefaultModels
}

/** Test seam — drops the cached default collection. */
export function resetSharedDefaultModels(): void {
  sharedDefaultModels = undefined
  pendingDefaultModels = undefined
}

/**
 * Resolves a `provider`/`model` pair against a collection, failing with a
 * message that lists what was actually available rather than a bare undefined.
 */
export function resolveModel(
  models: Models,
  provider: string,
  modelId: string,
): Model<Api> {
  const model = models.getModel(provider, modelId)
  if (model) return model

  const known = models.getProvider(provider)
  if (!known) {
    const providers = models
      .getProviders()
      .map((p) => p.id)
      .sort()
    throw new Error(
      `[agentry] Unknown provider "${provider}". Available providers: ${providers.join(', ')}`,
    )
  }

  const available = models
    .getModels(provider)
    .map((m) => m.id)
    .sort()
  throw new Error(
    `[agentry] Unknown model "${modelId}" for provider "${provider}". ` +
      `Available models: ${available.join(', ')}`,
  )
}

/**
 * Checks that the provider has usable credentials, before a run starts.
 *
 * Without this, a missing key surfaces as a provider error partway through the
 * first turn — after the tree has rendered and any startup work has run. This
 * turns it into a message at the point the run begins.
 *
 * pi does not export the per-provider environment-variable names (`findEnvKeys`
 * is internal), so the remedy quotes the provider's own credential display
 * name rather than guessing at variable names that would rot.
 *
 * Returns `undefined` when configured, or a ready-to-throw message when not.
 */
export async function describeMissingAuth(
  models: Models,
  provider: string,
): Promise<string | undefined> {
  // An unknown provider is not an auth problem — `resolveModel` raises a much
  // better error for it, listing what is actually available.
  if (!models.getProvider(provider)) return undefined

  let check: Awaited<ReturnType<Models['checkAuth']>>
  try {
    check = await models.checkAuth(provider)
  } catch {
    // A provider that cannot answer the question (custom providers, offline
    // credential stores) is not evidence of missing auth — let the run proceed
    // and fail with the provider's own error if it really is misconfigured.
    return undefined
  }

  if (check) return undefined

  const auth = models.getProvider(provider)?.auth
  const credentialName = auth?.apiKey?.name
  const oauthHint = auth?.oauth
    ? ' This provider also supports subscription auth — run `pi` and use /login.'
    : ''

  return credentialName
    ? `[agentry] No ${credentialName} configured for provider "${provider}".${oauthHint}`
    : `[agentry] No credentials configured for provider "${provider}".${oauthHint}`
}

/**
 * Releases provider-held resources keyed by session id (pooled sockets, cached
 * sessions). Wrapped so the runtime pi call stays inside `src/pi/`.
 */
export function releaseSessionResources(sessionId: string): void {
  cleanupSessionResources(sessionId)
}
