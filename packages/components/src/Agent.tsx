import { useContext, type ReactNode } from 'react'
import { InsideAgentContext } from '@agentry/core/context'
import type { AgentComponentProps } from '@agentry/core/instances/types'

export interface AgentComponentPublicProps extends Omit<
  AgentComponentProps,
  'client' | 'model'
> {
  // model is optional for child agents (they inherit from parent)
  model?: AgentComponentProps['model']
}

/**
 * Agent component - the root container for an AI agent
 *
 * For nested agents (subagents), children are deferred until execution time.
 *
 * @example
 * ```tsx
 * <Agent model="claude-sonnet-4-5" maxTokens={4096}>
 *   <System>You are a helpful assistant</System>
 *   <Tools>
 *     <Tool {...searchTool} />
 *   </Tools>
 * </Agent>
 * ```
 */
export function Agent({
  children,
  ...props
}: AgentComponentPublicProps): ReactNode {
  const isNested = useContext(InsideAgentContext)

  if (isNested) {
    // defer children - pass as prop so reconciler stores them without reconciling
    // children will be rendered later in SubagentHandle.prepareAgent() with proper context
    return <agent {...props} deferredChildren={children} />
  }

  // root agent - render children normally, but wrap in InsideAgentContext so we can detect nested agents
  return (
    <InsideAgentContext.Provider value={true}>
      <agent {...props}>{children}</agent>
    </InsideAgentContext.Provider>
  )
}
