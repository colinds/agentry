import { z } from 'zod'
import { run, defineTool, Agent, System, Message, Tools, Tool } from 'agentry'
import OpenAI from 'openai'
import { OPENAI_MODEL as EXAMPLE_OPENAI_MODEL } from '../constants'

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? EXAMPLE_OPENAI_MODEL

const calculatorTool = defineTool({
  name: 'calculator',
  description: 'perform basic math calculations',
  parameters: z.object({
    a: z.number().describe('first number'),
    b: z.number().describe('second number'),
  }),
  strict: true,
  handler: async ({ a, b }) => `${a} + ${b} = ${a + b}`,
})

const result = await run(
  <Agent
    provider="openai"
    model={OPENAI_MODEL}
    maxTokens={1024}
    websocket={true}
  >
    <System>You are a helpful math assistant.</System>
    <Tools>
      <Tool {...calculatorTool} />
    </Tools>
    <Message role="user">What is 12 + 30?</Message>
  </Agent>,
  {
    providers: {
      openai: { client: new OpenAI() },
    },
  },
)

console.log('Result:', result.content)
console.log('Usage:', result.usage)
