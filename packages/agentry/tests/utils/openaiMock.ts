import type OpenAI from 'openai'

export interface OpenAIMockResponse {
  output: Array<Record<string, unknown>>
  usage?: { input_tokens?: number; output_tokens?: number }
}

export function createOpenAIMockClient(responses: OpenAIMockResponse[]): {
  client: OpenAI
  calls: Array<Record<string, unknown>>
} {
  const queue = [...responses]
  const calls: Array<Record<string, unknown>> = []

  const client = {
    responses: {
      create: async (payload: Record<string, unknown>) => {
        calls.push(payload)
        const next = queue.shift()
        if (!next) {
          throw new Error('No more OpenAI mock responses available')
        }
        return {
          id: `resp_${calls.length}`,
          output: next.output,
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
