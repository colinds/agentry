import type {
  AssistantMessage,
  Usage,
  ImageContent,
  Message,
  TextContent,
  ThinkingContent,
  ToolCall,
  ToolResultMessage,
  UserMessage,
} from '@earendil-works/pi-ai'

export type {
  AssistantMessage,
  ImageContent,
  Message,
  StopReason,
  TextContent,
  ThinkingContent,
  ToolCall,
  ToolResultMessage,
  Usage,
  UserMessage,
} from '@earendil-works/pi-ai'

/**
 * Agentry's message model is pi's. These aliases keep the historical agentry
 * names readable at call sites, but they are pi types — not a parallel
 * hierarchy with converters at the edge.
 */
export type AgentMessage = AssistantMessage
export type AgentMessageParam = Message

export type AgentContentBlock = TextContent | ThinkingContent | ToolCall
export type TextContentArray = TextContent[]

export function isTextBlock(block: AgentContentBlock): block is TextContent {
  return block.type === 'text'
}

export function isThinkingBlock(
  block: AgentContentBlock,
): block is ThinkingContent {
  return block.type === 'thinking'
}

export function isToolCallBlock(block: AgentContentBlock): block is ToolCall {
  return block.type === 'toolCall'
}

export function isAssistantMessage(
  message: Message,
): message is AssistantMessage {
  return message.role === 'assistant'
}

export function isToolResultMessage(
  message: Message,
): message is ToolResultMessage {
  return message.role === 'toolResult'
}

export function extractText(message: AssistantMessage): string {
  return message.content
    .filter(isTextBlock)
    .map((block) => block.text)
    .join('')
}

export function extractToolCalls(message: AssistantMessage): ToolCall[] {
  return message.content.filter(isToolCallBlock)
}

/** Reads the text out of a tool result's content blocks. */
export function toolResultText(message: ToolResultMessage): string {
  return message.content
    .filter((block): block is TextContent => block.type === 'text')
    .map((block) => block.text)
    .join('')
}

export function userMessage(
  content: string | Array<TextContent | ImageContent>,
): UserMessage {
  return { role: 'user', content, timestamp: Date.now() }
}

const EMPTY_USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
}

/**
 * Builds an assistant message for history seeded from JSX
 * (`<Message role="assistant">`) rather than returned by a provider.
 *
 * pi's `AssistantMessage` carries provider attribution and usage because it
 * normally describes a real response. A seeded turn has neither: usage is
 * zeroed and `provider`/`model` are left blank. `api` must still be a valid
 * literal, so it carries a placeholder that nothing reads.
 */
export function assistantSeedMessage(
  content:
    | string
    | Array<TextContent | ThinkingContent | ToolCall | ImageContent>,
): AssistantMessage {
  return {
    role: 'assistant',
    content:
      typeof content === 'string'
        ? [{ type: 'text', text: content }]
        : content.filter(
            (block): block is TextContent | ThinkingContent | ToolCall =>
              block.type !== 'image',
          ),
    api: 'anthropic-messages',
    provider: '',
    model: '',
    usage: EMPTY_USAGE,
    stopReason: 'stop',
    timestamp: Date.now(),
  }
}

export function toolResultMessage(options: {
  toolCallId: string
  toolName: string
  content: string | Array<TextContent | ImageContent>
  isError: boolean
}): ToolResultMessage {
  return {
    role: 'toolResult',
    toolCallId: options.toolCallId,
    toolName: options.toolName,
    content:
      typeof options.content === 'string'
        ? [{ type: 'text', text: options.content }]
        : options.content,
    isError: options.isError,
    timestamp: Date.now(),
  }
}
