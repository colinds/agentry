import type { JsonObject } from './json'

export type TextContentArray = TextContentBlock[]

export interface TextContentBlock {
  type: 'text'
  text: string
}

export interface ThinkingContentBlock {
  type: 'thinking'
  thinking: string
}

export interface ToolUseContentBlock {
  type: 'tool_use'
  id: string
  name: string
  input: JsonObject
}

export interface ToolResultContentBlock {
  type: 'tool_result'
  tool_use_id: string
  content: string | TextContentArray
  is_error?: boolean
}

export type AgentContentBlock =
  | TextContentBlock
  | ThinkingContentBlock
  | ToolUseContentBlock
  | ToolResultContentBlock

export interface AgentMessageParam {
  role: 'user' | 'assistant'
  content: string | AgentContentBlock[]
}

type StopReason =
  | 'end_turn'
  | 'tool_use'
  | 'max_tokens'
  | 'length'
  | (string & {})

export interface AgentMessage {
  content: AgentContentBlock[]
  stop_reason: StopReason | null
  usage: {
    input_tokens: number
    output_tokens: number
    cache_creation_input_tokens?: number | null
    cache_read_input_tokens?: number | null
  }
}

export function isToolUseBlock(
  block: AgentContentBlock,
): block is ToolUseContentBlock {
  return block.type === 'tool_use'
}

export function isTextBlock(
  block: AgentContentBlock,
): block is TextContentBlock {
  return block.type === 'text'
}

export function isThinkingBlock(
  block: AgentContentBlock,
): block is ThinkingContentBlock {
  return block.type === 'thinking'
}

export function isToolResultBlock(
  block: AgentContentBlock,
): block is ToolResultContentBlock {
  return block.type === 'tool_result'
}

export function extractText(message: AgentMessage): string {
  return message.content
    .filter(isTextBlock)
    .map((block) => block.text)
    .join('')
}

export function extractToolUses(message: AgentMessage): ToolUseContentBlock[] {
  return message.content.filter(isToolUseBlock)
}
