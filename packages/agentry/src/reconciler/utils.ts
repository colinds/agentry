import { scheduleOnIdle } from '../scheduler'

const RESERVED_PROPS = [
  'children',
  'key',
  'ref',
  'onMessage',
  'onComplete',
  'onError',
  'onStepFinish',
] as const

function deepEqual(
  a: unknown,
  b: unknown,
  seen = new WeakSet<object>(),
): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null) return a === b

  // handle circular references - if we've seen this pair, treat as equal
  if (typeof a === 'object' && typeof b === 'object') {
    if (seen.has(a as object)) return true
    seen.add(a as object)
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i], seen)) return false
    }
    return true
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const aObj = a as Record<string, unknown>
    const bObj = b as Record<string, unknown>
    const aKeys = Object.keys(aObj)
    const bKeys = Object.keys(bObj)

    if (aKeys.length !== bKeys.length) return false

    for (const key of aKeys) {
      if (!Object.prototype.hasOwnProperty.call(bObj, key)) return false
      if (!deepEqual(aObj[key], bObj[key], seen)) return false
    }
    return true
  }

  return false
}

/**
 * Calculate changed props between old and new props
 */
export function diffProps<T>(
  oldProps: T,
  newProps: T,
): { changes: Partial<T>; hasChanges: boolean } {
  const changes: Record<string, unknown> = {}
  let hasChanges = false

  const oldRecord = oldProps as Record<string, unknown>
  const newRecord = newProps as Record<string, unknown>

  for (const key of Object.keys(newRecord)) {
    if ((RESERVED_PROPS as readonly string[]).includes(key)) continue

    if (!deepEqual(oldRecord[key], newRecord[key])) {
      changes[key] = newRecord[key]
      hasChanges = true
    }
  }

  for (const key of Object.keys(oldRecord)) {
    if ((RESERVED_PROPS as readonly string[]).includes(key)) continue
    if (!Object.prototype.hasOwnProperty.call(newRecord, key)) {
      changes[key] = undefined
      hasChanges = true
    }
  }

  return { changes: changes as Partial<T>, hasChanges }
}

/**
 * Schedule disposal during idle time
 */
export function disposeOnIdle(cleanup: () => void): void {
  scheduleOnIdle(cleanup)
}
