import type {
  BetaMessage,
  BetaMessageParam,
  BetaContentBlock,
  BetaToolUseBlock,
  BetaTextBlock,
} from '@anthropic-ai/sdk/resources/beta'

export type {
  BetaMessage,
  BetaMessageParam,
  BetaContentBlock,
  BetaToolUseBlock,
  BetaTextBlock,
}

export interface UserMessage {
  role: 'user'
  content: string | BetaContentBlock[]
}

export interface AssistantMessage {
  role: 'assistant'
  content: BetaContentBlock[]
}

export type Message = UserMessage | AssistantMessage

export interface ToolResultContent {
  type: 'tool_result'
  tool_use_id: string
  content: string | BetaContentBlock[]
  is_error?: boolean
}

export function isToolUseBlock(
  block: BetaContentBlock,
): block is BetaToolUseBlock {
  return block.type === 'tool_use'
}

export function isTextBlock(block: BetaContentBlock): block is BetaTextBlock {
  return block.type === 'text'
}

export function extractText(message: BetaMessage): string {
  return message.content
    .filter(isTextBlock)
    .map((block) => block.text)
    .join('')
}

export function extractToolUses(message: BetaMessage): BetaToolUseBlock[] {
  return message.content.filter(isToolUseBlock)
}
