import {
  unstable_scheduleCallback,
  unstable_NormalPriority,
  unstable_IdlePriority,
} from 'scheduler'

/**
 * Yield to React's scheduler with normal priority
 * Useful for allowing React effects to run after rendering
 */
export async function yieldToScheduler(): Promise<void> {
  await new Promise<void>((resolve) => {
    unstable_scheduleCallback(unstable_NormalPriority, () => resolve())
  })
}

/**
 * Schedule a callback to run during idle time
 * Useful for cleanup operations that don't need to block
 */
export function scheduleOnIdle(callback: () => void): void {
  unstable_scheduleCallback(unstable_IdlePriority, () => {
    try {
      callback()
    } catch {
      // no-op: ignore errors in idle callbacks
    }
  })
}
