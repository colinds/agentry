import { z } from 'zod'
import { createAI, defineTool, Agent, System, Tools, Tool } from 'agentry'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { WebSearch as AnthropicWebSearch } from 'agentry/anthropic'
import { WebSearch as OpenAIWebSearch } from 'agentry/openai'
import { MODEL, OPENAI_MODEL } from './constants'

const EXAMPLE_PROVIDER =
  process.env.EXAMPLE_PROVIDER === 'openai' ? 'openai' : 'anthropic'
const WebSearch =
  EXAMPLE_PROVIDER === 'openai' ? OpenAIWebSearch : AnthropicWebSearch
const EXAMPLE_MODEL = EXAMPLE_PROVIDER === 'openai' ? OPENAI_MODEL : MODEL
const ai =
  EXAMPLE_PROVIDER === 'openai'
    ? createAI({ providers: { openai: { client: new OpenAI() } } })
    : createAI({
        providers: { anthropic: { client: new Anthropic() } },
      })

const InteractiveAgent = () => {
  const docsSearchTool = defineTool({
    name: 'search_docs',
    description: 'search through documentation',
    strict: true,
    parameters: z.object({
      query: z.string().describe('search query'),
      limit: z.number().optional().default(5).describe('max results'),
    }),
    handler: async ({ query, limit }) => {
      return `Found ${limit} results for "${query}":\n1. Getting Started\n2. API Reference\n3. Examples`
    },
  })

  return (
    <Agent
      provider={EXAMPLE_PROVIDER}
      model={EXAMPLE_MODEL}
      maxTokens={2048}
      stream={true}
    >
      <System>
        You are a helpful assistant with access to documentation and web search.
      </System>
      <Tools>
        <Tool {...docsSearchTool} />
        <WebSearch maxUses={3} />
      </Tools>
    </Agent>
  )
}

const agent = await ai.run(<InteractiveAgent />, { mode: 'interactive' })

const question1 = 'What frameworks are popular for building React apps?'
console.log(`User: ${question1}\n`)
console.log('Assistant: ')

for await (const event of agent.stream(question1)) {
  if (event.type === 'text') {
    process.stdout.write(event.text)
  }
}

console.log('\n\n---\n')

const question2 = 'Can you search the docs for more info on state management?'
console.log(`User: ${question2}\n`)
console.log('Assistant: ')

for await (const event of agent.stream(question2)) {
  if (event.type === 'text') {
    process.stdout.write(event.text)
  }
}

console.log('\nConversation completed!')
agent.close()
