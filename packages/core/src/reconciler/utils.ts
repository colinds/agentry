import { scheduleOnIdle } from '../scheduler.ts'

const RESERVED_PROPS = [
  'children',
  'key',
  'ref',
  'onMessage',
  'onComplete',
  'onError',
] as const

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true

  if (typeof a !== typeof b) return false

  if (a === null || b === null) return a === b

  if (Array.isArray(a)) return a === b

  if (typeof a === 'object') {
    const aObj = a as Record<string, unknown>
    const bObj = b as Record<string, unknown>
    const aKeys = Object.keys(aObj)
    const bKeys = Object.keys(bObj)

    if (aKeys.length !== bKeys.length) return false

    for (const key of aKeys) {
      if (aObj[key] !== bObj[key]) return false
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

    if (!shallowEqual(oldRecord[key], newRecord[key])) {
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
