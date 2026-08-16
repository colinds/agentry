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
