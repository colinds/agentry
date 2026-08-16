import type { ReactNode } from 'react'
import type { ProviderModelOverride } from '../types/agent'

/**
 * Props for the Condition component.
 *
 * Boolean conditions (`when={boolean}`) don't accept model/provider overrides.
 * NL conditions (`when="..."`) extend `ProviderModelOverride` for typed provider/model
 * overrides used during LLM evaluation. The first NL condition's override applies to
 * the entire batch.
 */
export type ConditionProps =
  | ({ when: boolean; children?: ReactNode } & {
      provider?: undefined
      model?: undefined
    })
  | ({ when: string; children?: ReactNode } & ProviderModelOverride)

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
 *   <System>Research mode active.</System>
 *   <Tools><Tool {...searchTool} /></Tools>
 * </Condition>
 * ```
 *
 * @example NL condition with cheap model override
 * ```tsx
 * <Condition when="user wants to search" model="claude-haiku-4-5" provider="anthropic">
 *   <Tools><Tool {...searchTool} /></Tools>
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
export function Condition(props: ConditionProps): ReactNode {
  if (typeof props.when === 'boolean') {
    return <condition when={props.when}>{props.children}</condition>
  }
  return (
    <condition when={props.when} model={props.model} provider={props.provider}>
      {props.children}
    </condition>
  )
}
