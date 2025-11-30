import * as React from 'react';
import type { ElementProps } from '../instances/index.ts';
import type { AgentInstance, Instance } from '../instances/types.ts';
import { unstable_IdlePriority as idlePriority, unstable_scheduleCallback as scheduleCallback } from 'scheduler';

// Props that should be skipped during diffing (React internal + callbacks)
const RESERVED_PROPS = [
  'children',
  'key',
  'ref',
  'onMessage',
  'onComplete',
  'onError',
] as const;

/** Simple equality check for props */
function shallowEqual(a: unknown, b: unknown): boolean {
  // Same reference or primitives
  if (a === b) return true;
  
  // Different types
  if (typeof a !== typeof b) return false;
  
  // Null check
  if (a === null || b === null) return a === b;
  
  // Arrays - compare by reference (functions/callbacks shouldn't trigger updates)
  if (Array.isArray(a)) return a === b;
  
  // Objects - shallow compare
  if (typeof a === 'object') {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);
    
    if (aKeys.length !== bKeys.length) return false;
    
    for (const key of aKeys) {
      if (aObj[key] !== bObj[key]) return false;
    }
    return true;
  }
  
  return false;
}

/**
 * Calculate changed props between old and new props
 */
export function diffProps<T>(
  oldProps: T,
  newProps: T,
): { changes: Partial<T>; hasChanges: boolean } {
  const changes: Record<string, unknown> = {};
  let hasChanges = false;

  const oldRecord = oldProps as Record<string, unknown>;
  const newRecord = newProps as Record<string, unknown>;

  // Check for new/changed props
  for (const key of Object.keys(newRecord)) {
    // Skip reserved props
    if ((RESERVED_PROPS as readonly string[]).includes(key)) continue;

    // Check equality
    if (!shallowEqual(oldRecord[key], newRecord[key])) {
      changes[key] = newRecord[key];
      hasChanges = true;
    }
  }

  // Check for removed props (important for HMR)
  for (const key of Object.keys(oldRecord)) {
    if ((RESERVED_PROPS as readonly string[]).includes(key)) continue;
    if (!Object.prototype.hasOwnProperty.call(newRecord, key)) {
      // Prop was removed - set to undefined to signal removal
      changes[key] = undefined;
      hasChanges = true;
    }
  }

  return { changes: changes as Partial<T>, hasChanges };
}

/**
 * Schedule disposal during idle time
 */
export function disposeOnIdle(cleanup: () => void): void {
  scheduleCallback(idlePriority, () => {
    try {
      cleanup();
    } catch {
      // no-op
    }
  });
}

/**
 * Create the HostTransitionContext properly (instead of null workaround)
 */
export const HostTransitionContext = React.createContext<null>(null);

