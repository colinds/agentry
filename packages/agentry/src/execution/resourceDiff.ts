import type { InternalTool } from '../types/tools'

export interface ResourceEntry {
  name: string
  description: string
  /** Stable digest of the tool's JSON Schema, used to detect shape changes. */
  digest: string
}

export interface ResourceSnapshot {
  tools: ResourceEntry[]
}

export interface ResourceDelta {
  added: ResourceEntry[]
  removed: ResourceEntry[]
  updated: ResourceEntry[]
}

/** Order-independent JSON, so key ordering alone never looks like a change. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([a], [b]) => a.localeCompare(b),
  )
  return `{${entries
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
    .join(',')}}`
}

export function snapshotResources(
  tools: Iterable<InternalTool>,
): ResourceSnapshot {
  return {
    tools: [...tools].map((tool) => ({
      name: tool.name,
      description: tool.description,
      digest: stableStringify(tool.jsonSchema),
    })),
  }
}

export function diffResources(
  previous: ResourceSnapshot | null,
  next: ResourceSnapshot,
): ResourceDelta {
  if (!previous) {
    // The first turn is not a change: the model is seeing the initial tool set
    // for the first time, and it is already in the request.
    return { added: [], removed: [], updated: [] }
  }

  const before = new Map(previous.tools.map((t) => [t.name, t]))
  const after = new Map(next.tools.map((t) => [t.name, t]))

  const added: ResourceEntry[] = []
  const updated: ResourceEntry[] = []
  for (const [name, entry] of after) {
    const prior = before.get(name)
    if (!prior) {
      added.push(entry)
    } else if (
      prior.digest !== entry.digest ||
      prior.description !== entry.description
    ) {
      updated.push(entry)
    }
  }

  const removed = [...before.values()].filter((t) => !after.has(t.name))

  return { added, removed, updated }
}

export function hasResourceChanges(delta: ResourceDelta): boolean {
  return (
    delta.added.length > 0 ||
    delta.removed.length > 0 ||
    delta.updated.length > 0
  )
}

/**
 * Renders a delta as prose for the transcript.
 *
 * Without this the model's tool set can change between turns with no
 * explanation, which reads to the model as tools silently appearing or
 * vanishing. Announcing the change keeps the conversation coherent.
 */
export function narrateResourceDelta(delta: ResourceDelta): string {
  const lines: string[] = []

  if (delta.added.length > 0) {
    lines.push(
      `New tools available: ${delta.added
        .map((t) => `${t.name} (${t.description})`)
        .join('; ')}`,
    )
  }
  if (delta.removed.length > 0) {
    lines.push(
      `No longer available: ${delta.removed.map((t) => t.name).join(', ')}`,
    )
  }
  if (delta.updated.length > 0) {
    lines.push(`Updated: ${delta.updated.map((t) => t.name).join(', ')}`)
  }

  return `[Available tools changed] ${lines.join(' ')}`
}
