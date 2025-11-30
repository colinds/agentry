/**
 * Debug logging utility for agentry
 * 
 * Enable by setting DEBUG=true or DEBUG=1 environment variable:
 * ```bash
 * DEBUG=true bun run your-agent.tsx
 * ```
 */

const isDebug = process.env.DEBUG === 'true' || process.env.DEBUG === '1';

/**
 * Log debug messages when DEBUG environment variable is set
 * 
 * @param category - Category of the log (e.g., 'api', 'tool', 'reconciler')
 * @param message - Log message
 * @param data - Optional data to log
 */
export function debug(category: string, message: string, data?: unknown): void {
  if (!isDebug) return;
  
  const prefix = `[agentry:${category}]`;
  if (data !== undefined) {
    console.log(prefix, message, data);
  } else {
    console.log(prefix, message);
  }
}

/**
 * Check if debug mode is enabled
 */
export function isDebugEnabled(): boolean {
  return isDebug;
}

