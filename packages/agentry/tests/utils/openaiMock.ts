import type OpenAI from 'openai'

export interface OpenAIMockFailedResponse {
  type: 'failed'
  message: string
}

interface OpenAIMockSuccessResponse {
  output: Array<Record<string, unknown>>
  usage?: { input_tokens?: number; output_tokens?: number }
}

export type OpenAIMockResponse =
  | OpenAIMockSuccessResponse
  | OpenAIMockFailedResponse

function isFailedResponse(
  resp: OpenAIMockResponse,
): resp is OpenAIMockFailedResponse {
  return 'type' in resp && (resp as OpenAIMockFailedResponse).type === 'failed'
}

export function createOpenAIMockClient(responses: OpenAIMockResponse[]): {
  client: OpenAI
  calls: Array<Record<string, unknown>>
} {
  const queue = [...responses]
  const calls: Array<Record<string, unknown>> = []

  async function* makeStream(
    resp: OpenAIMockResponse,
    callIndex: number,
  ): AsyncIterable<Record<string, unknown>> {
    if (isFailedResponse(resp)) {
      yield {
        type: 'response.failed',
        response: {
          id: `resp_${callIndex}`,
          status: 'failed',
          error: { message: resp.message },
          output: [],
        },
      }
      return
    }

    // Emit output_item.added + text delta events for each output item
    for (let i = 0; i < resp.output.length; i++) {
      const item = resp.output[i]!
      yield { type: 'response.output_item.added', output_index: i, item }

      if (item.type === 'message' && Array.isArray(item.content)) {
        for (const part of item.content as Array<Record<string, unknown>>) {
          if (part.type === 'output_text' && typeof part.text === 'string') {
            // Emit the full text as a single delta
            yield {
              type: 'response.output_text.delta',
              output_index: i,
              content_index: 0,
              item_id: `item_${i}`,
              delta: part.text,
              logprobs: [],
              sequence_number: i,
            }
          }
        }
      }

      if (item.type === 'reasoning' && Array.isArray(item.summary)) {
        for (const part of item.summary as Array<Record<string, unknown>>) {
          if (part.type === 'summary_text' && typeof part.text === 'string') {
            yield {
              type: 'response.reasoning_summary_text.delta',
              delta: part.text,
            }
          }
        }
      }

      yield { type: 'response.output_item.done', output_index: i, item }
    }

    // Emit the final response.completed event
    yield {
      type: 'response.completed',
      sequence_number: resp.output.length,
      response: {
        id: `resp_${callIndex}`,
        output: resp.output,
        status: 'completed',
        usage: {
          input_tokens: resp.usage?.input_tokens ?? 100,
          output_tokens: resp.usage?.output_tokens ?? 50,
        },
      },
    }
  }

  const client = {
    responses: {
      create: async (payload: Record<string, unknown>) => {
        calls.push(payload)
        const next = queue.shift()
        if (!next) {
          throw new Error('No more OpenAI mock responses available')
        }
        const callIndex = calls.length

        if (payload.stream === true) {
          return makeStream(
            next,
            callIndex,
          ) as unknown as AsyncIterable<unknown>
        }

        if (isFailedResponse(next)) {
          throw new Error(`OpenAI response failed: ${next.message}`)
        }

        return {
          id: `resp_${callIndex}`,
          output: next.output,
          status: 'completed',
          usage: {
            input_tokens: next.usage?.input_tokens ?? 100,
            output_tokens: next.usage?.output_tokens ?? 50,
          },
        }
      },
    },
  } as unknown as OpenAI

  return { client, calls }
}
