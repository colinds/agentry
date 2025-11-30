import type Anthropic from '@anthropic-ai/sdk';
import type { BetaMessage, BetaContentBlock } from '@anthropic-ai/sdk/resources/beta';

export interface MockResponse {
  content: BetaContentBlock[];
  stop_reason?: 'end_turn' | 'tool_use' | 'max_tokens';
}

/**
 * create a mock Anthropic client for testing without API calls
 *
 * @example
 * ```ts
 * const mockClient = createMockClient([
 *   { content: [mockToolUse('search', { query: 'test' })], stop_reason: 'tool_use' },
 *   { content: [mockText('Results found')] },
 * ]);
 *
 * const result = await render(<Agent>...</Agent>, { client: mockClient });
 * ```
 */
export function createMockClient(responses: MockResponse[]): Anthropic {
  let callCount = 0;

  return {
    beta: {
      messages: {
        create: async (params: unknown) => {
          const response = responses[callCount++] ?? responses[responses.length - 1];

          if (!response) {
            throw new Error('No mock responses provided');
          }

          const p = params as { model: string };

          return {
            id: `msg_${callCount}`,
            type: 'message',
            role: 'assistant',
            content: response.content,
            model: p.model,
            stop_reason: response.stop_reason ?? 'end_turn',
            stop_sequence: null,
            container: null,
            context_management: null,
            usage: {
              input_tokens: 100,
              output_tokens: 50,
              cache_creation: null,
              cache_creation_input_tokens: null,
              cache_read_input_tokens: null,
              server_tool_use: null,
              service_tier: null,
            },
          } as BetaMessage;
        },
        stream: () => {
          throw new Error('Mock client does not support streaming yet');
        },
      },
    },
  } as unknown as Anthropic;
}

/**
 * helper to create a tool_use content block
 */
export function mockToolUse(name: string, input: unknown, id = 'tool_1'): BetaContentBlock {
  return {
    type: 'tool_use',
    id,
    name,
    input,
  };
}

/**
 * helper to create a text content block
 */
export function mockText(text: string): BetaContentBlock {
  return {
    type: 'text',
    text,
    citations: null,
  };
}
