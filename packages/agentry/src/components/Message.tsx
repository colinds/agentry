import type { ReactNode } from 'react'
import type { AgentContentBlock } from '../types/messages'

export interface MessageProps {
  role: 'user' | 'assistant'
  children?: ReactNode
  content?: string | AgentContentBlock[]
}

/**
 * message component - adds a message to the conversation history
 *
 * @example
 * ```tsx
 * <Agent model="claude-sonnet-4-5">
 *   <Message role="user">Hello!</Message>
 *   <Message role="assistant">Hi there! How can I help?</Message>
 *   <Message role="user">What's the weather?</Message>
 * </Agent>
 * ```
 */
export function Message({ role, children, content }: MessageProps): ReactNode {
  return (
    <message role={role} rawContent={content}>
      {children}
    </message>
  )
}
