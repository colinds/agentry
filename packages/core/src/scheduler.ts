import {
  unstable_scheduleCallback,
  unstable_NormalPriority,
  unstable_ImmediatePriority,
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
 * Yield to React's scheduler with immediate priority
 * Useful for ensuring concurrent scheduler commits happen immediately
 */
export async function yieldToSchedulerImmediate(): Promise<void> {
  await new Promise<void>((resolve) => {
    unstable_scheduleCallback(unstable_ImmediatePriority, () => resolve())
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
