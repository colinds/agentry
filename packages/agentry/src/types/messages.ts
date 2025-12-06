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
