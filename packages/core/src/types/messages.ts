import type {
  BetaMessage,
  BetaMessageParam,
  BetaContentBlock,
  BetaToolUseBlock,
  BetaTextBlock,
} from '@anthropic-ai/sdk/resources/beta';

// re-export SDK types for convenience
export type {
  BetaMessage,
  BetaMessageParam,
  BetaContentBlock,
  BetaToolUseBlock,
  BetaTextBlock,
};

// simplified message types for user-facing API
export interface UserMessage {
  role: 'user';
  content: string | BetaContentBlock[];
}

export interface AssistantMessage {
  role: 'assistant';
  content: BetaContentBlock[];
}

export type Message = UserMessage | AssistantMessage;

// tool result content
export interface ToolResultContent {
  type: 'tool_result';
  tool_use_id: string;
  content: string | BetaContentBlock[];
  is_error?: boolean;
}

// helper to check if a content block is a tool use
export function isToolUseBlock(block: BetaContentBlock): block is BetaToolUseBlock {
  return block.type === 'tool_use';
}

// helper to check if a content block is text
export function isTextBlock(block: BetaContentBlock): block is BetaTextBlock {
  return block.type === 'text';
}

// helper to extract text from a message
export function extractText(message: BetaMessage): string {
  return message.content
    .filter(isTextBlock)
    .map((block) => block.text)
    .join('');
}

// helper to extract tool uses from a message
export function extractToolUses(message: BetaMessage): BetaToolUseBlock[] {
  return message.content.filter(isToolUseBlock);
}
