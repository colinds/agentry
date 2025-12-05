import type { ReactNode } from 'react'

export interface ConditionProps {
  when: boolean | string
  children?: ReactNode
}

/**
 * Condition component - conditionally renders children based on a boolean or natural language condition
 *
 * Conditions can be:
 * - Boolean-based: `when={isAuthenticated}` - Evaluated synchronously
 * - Natural language: `when="user wants to search"` - Evaluated via LLM
 *
 * Conditions can be placed anywhere in the agent tree and can wrap any components.
 * Multiple conditions can be active simultaneously (parallel evaluation).
 *
 * @example Boolean condition
 * ```tsx
 * <Condition when={!isAuthenticated}>
 *   <System>Please log in first.</System>
 *   <Tools>
 *     <Tool name="login" ... />
 *   </Tools>
 * </Condition>
 * ```
 *
 * @example Natural language condition
 * ```tsx
 * <Condition when="user wants to search the web">
 *   <System>Web search mode active.</System>
 *   <Tools><WebSearch /></Tools>
 * </Condition>
 * ```
 *
 * @example Nested conditions
 * ```tsx
 * <Condition when={isAuthenticated}>
 *   <Condition when={isPremium}>
 *     <Tools><Tool name="premium_feature" ... /></Tools>
 *   </Condition>
 * </Condition>
 * ```
 */
export function Condition({ when, children }: ConditionProps): ReactNode {
  return <condition when={when}>{children}</condition>
}
