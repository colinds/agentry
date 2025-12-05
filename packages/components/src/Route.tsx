import type { ReactNode } from 'react'

export interface RouteProps {
  when: boolean | string
  children?: ReactNode
}

/**
 * Route component - defines a conditional route within a Router
 *
 * @experimental Router functionality is experimental and may change in future versions.
 *
 * Routes can be:
 * - Boolean-based: `when={isAuthenticated}` - Evaluated synchronously
 * - Natural language: `when="user wants to search"` - Evaluated via LLM
 *
 * Multiple routes can be active simultaneously (parallel routing).
 * The active route's children are rendered into the agent configuration.
 *
 * @example Boolean route
 * ```tsx
 * <Route when={!isAuthenticated}>
 *   <System>Please log in first.</System>
 *   <Tools>
 *     <Tool name="login" ... />
 *   </Tools>
 * </Route>
 * ```
 *
 * @example Natural language route
 * ```tsx
 * <Route when="user wants to search the web">
 *   <System>Web search mode active.</System>
 *   <Tools><WebSearch /></Tools>
 * </Route>
 * ```
 */
export function Route({ when, children }: RouteProps): ReactNode {
  return <route when={when}>{children}</route>
}
