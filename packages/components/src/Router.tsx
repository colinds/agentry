import type { ReactNode } from 'react'

export interface RouterProps {
  children?: ReactNode
}

/**
 * Router component - conditionally renders Route children based on evaluation
 *
 * @experimental Router functionality is experimental and may change in future versions.
 *
 * Routes are evaluated in order:
 * 1. Boolean routes (when={boolean}) are checked first
 * 2. Natural language routes are evaluated via LLM
 * 3. Multiple routes can be active simultaneously
 * 4. If no routes match, nothing is rendered
 *
 * @example
 * ```tsx
 * <Router>
 *   <Route when={!isAuthenticated}>
 *     <System>Please authenticate first.</System>
 *   </Route>
 *   <Route when={isAuthenticated}>
 *     <System>You are authenticated.</System>
 *   </Route>
 *   <Route when="user wants to search the web">
 *     <Tools><WebSearch /></Tools>
 *   </Route>
 * </Router>
 * ```
 */
export function Router({ children }: RouterProps): ReactNode {
  return <router>{children}</router>
}
