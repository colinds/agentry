import type Anthropic from '@anthropic-ai/sdk';
import type { BetaMessage, BetaContentBlock, BetaMessageParam } from '@anthropic-ai/sdk/resources/beta';

export interface MockResponse {
  content: BetaContentBlock[];
  stop_reason?: 'end_turn' | 'tool_use' | 'max_tokens';
}

// Parameters for messages.create - matches what ExecutionEngine uses
interface CreateMessageParams {
  model: string;
  max_tokens: number;
  system?: string;
  messages: BetaMessageParam[];
  tools?: unknown[];
  mcp_servers?: unknown[];
  stop_sequences?: string[];
  temperature?: number;
  betas?: string[];
  stream?: boolean;
}

export interface PendingCall {
  params: CreateMessageParams;
  resolve: (response: BetaMessage) => void;
  reject: (error: Error) => void;
  turnNumber: number;
}

export interface StepMockController {
  /**
   * Advance to the next turn, returning the response for that turn
   */
  nextTurn(): Promise<void>;
  
  /**
   * Wait for the next API call to be queued (indicates tool execution completed)
   * This is useful for checking state after resolving a turn but before the next turn
   */
  waitForNextCall(): Promise<void>;
  
  /**
   * Get the number of pending API calls waiting to be resolved
   */
  getPendingCallCount(): number;
  
  /**
   * Get information about the next pending call without resolving it
   */
  peekNextCall(): PendingCall | null;
  
  /**
   * Get all pending calls
   */
  getPendingCalls(): PendingCall[];
  
  /**
   * Get the current turn number (how many turns have been completed)
   */
  getCurrentTurnNumber(): number;
  
  /**
   * Check if all responses have been consumed
   */
  isComplete(): boolean;
  
  /**
   * Manually resolve the next pending call with a custom response
   * Useful for dynamic responses based on the actual params
   */
  resolveNextCall(response: MockResponse): void;
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

/**
 * Create a step-by-step mock client that allows fine-grained control over each turn
 * 
 * Returns both the client and a controller that can be used to step through execution
 * one turn at a time, inspect pending calls, and control when responses are returned.
 *
 * @example
 * ```ts
 * const { client, controller } = createStepMockClient([
 *   { content: [mockToolUse('search', { query: 'test' })], stop_reason: 'tool_use' },
 *   { content: [mockText('Results found')] },
 * ]);
 *
 * const agent = createAgent(<Agent>...</Agent>, { client });
 * const runPromise = agent.run();
 *
 * // Wait for first turn to be ready
 * await controller.nextTurn();
 * 
 * // Inspect the call
 * const call = controller.peekNextCall();
 * console.log('Turn 1 params:', call?.params);
 *
 * // Advance to next turn
 * await controller.nextTurn();
 *
 * // Continue until complete
 * await runPromise;
 * ```
 */
export function createStepMockClient(responses: MockResponse[]): {
  client: Anthropic;
  controller: StepMockController;
} {
  let callCount = 0;
  let turnNumber = 0;
  const pendingCalls: PendingCall[] = [];
  let responsesArray = [...responses];
  let waitForCallResolve: (() => void) | null = null;

  const controller: StepMockController = {
    async nextTurn() {
      if (pendingCalls.length === 0) {
        // Wait for a call to be queued using a promise
        await new Promise<void>((resolve) => {
          waitForCallResolve = resolve;
        });
        waitForCallResolve = null;
      }

      const call = pendingCalls.shift();
      if (!call) {
        throw new Error('No pending calls to resolve');
      }

      const response = responsesArray[callCount] ?? responsesArray[responsesArray.length - 1];
      if (!response) {
        call.reject(new Error('No mock responses provided'));
        return;
      }

      const p = call.params as { model: string };

      const message: BetaMessage = {
        id: `msg_${callCount + 1}`,
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

      callCount++;
      turnNumber++;
      call.resolve(message);
    },

    async waitForNextCall() {
      if (pendingCalls.length > 0) {
        return; // Already have a call queued
      }
      // Wait for a call to be queued
      await new Promise<void>((resolve) => {
        waitForCallResolve = resolve;
      });
      waitForCallResolve = null;
    },

    getPendingCallCount() {
      return pendingCalls.length;
    },

    peekNextCall() {
      return pendingCalls[0] ?? null;
    },

    getPendingCalls() {
      return [...pendingCalls];
    },

    getCurrentTurnNumber() {
      return turnNumber;
    },

    isComplete() {
      return callCount >= responsesArray.length && pendingCalls.length === 0;
    },

    resolveNextCall(response: MockResponse) {
      const call = pendingCalls.shift();
      if (!call) {
        throw new Error('No pending calls to resolve');
      }

      const p = call.params as { model: string };

      const message: BetaMessage = {
        id: `msg_${callCount + 1}`,
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

      callCount++;
      turnNumber++;
      call.resolve(message);
    },
  };

  const client = {
    beta: {
      messages: {
        create: async (params: unknown, options?: { signal?: AbortSignal }) => {
          // Check for abort signal
          if (options?.signal?.aborted) {
            throw new Error('Request aborted');
          }

          return new Promise<BetaMessage>((resolve, reject) => {
            // Handle abort after promise creation
            if (options?.signal) {
              options.signal.addEventListener('abort', () => {
                const index = pendingCalls.findIndex(c => c.params === params);
                if (index !== -1) {
                  pendingCalls.splice(index, 1);
                }
                reject(new Error('Request aborted'));
              });
            }

            const call: PendingCall = {
              params: params as CreateMessageParams,
              resolve,
              reject,
              turnNumber: turnNumber + pendingCalls.length + 1,
            };

            pendingCalls.push(call);
            
            // Notify any waiting nextTurn() calls
            if (waitForCallResolve) {
              waitForCallResolve();
            }
          });
        },
        stream: () => {
          throw new Error('Mock client does not support streaming yet');
        },
      },
    },
  } as unknown as Anthropic;

  return { client, controller };
}
