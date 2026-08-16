import { Type } from 'agentry'
import { createAI, defineTool, Agent, System, Tools, Tool } from 'agentry'
import { MODEL, OPENAI_MODEL } from './constants'

const EXAMPLE_PROVIDER =
  process.env.EXAMPLE_PROVIDER === 'openai' ? 'openai' : 'anthropic'
const EXAMPLE_MODEL = EXAMPLE_PROVIDER === 'openai' ? OPENAI_MODEL : MODEL
// createAI() carries no provider itself — the provider is chosen per <Agent>.
const ai = createAI()

const InteractiveAgent = () => {
  const docsSearchTool = defineTool({
    name: 'search_docs',
    description: 'search through documentation',
    strict: true,
    parameters: Type.Object({
      query: Type.String({ description: 'search query' }),
      limit: Type.Optional(Type.Number({ default: 5 })),
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
        You are a helpful assistant with access to a documentation search tool.
      </System>
      <Tools>
        <Tool {...docsSearchTool} />
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
