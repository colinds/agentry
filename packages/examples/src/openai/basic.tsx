import { Type } from 'agentry'
import { run, defineTool, Agent, System, Message, Tools, Tool } from 'agentry'
import { OPENAI_MODEL as EXAMPLE_OPENAI_MODEL } from '../constants'

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? EXAMPLE_OPENAI_MODEL

const calculatorTool = defineTool({
  name: 'calculator',
  description: 'perform basic math calculations',
  parameters: Type.Object({
    a: Type.Number({ description: 'first number' }),
    b: Type.Number({ description: 'second number' }),
  }),
  strict: true,
  handler: async ({ a, b }) => `${a} + ${b} = ${a + b}`,
})

const result = await run(
  <Agent provider="openai" model={OPENAI_MODEL} maxTokens={1024}>
    <System>You are a helpful math assistant.</System>
    <Tools>
      <Tool {...calculatorTool} />
    </Tools>
    <Message role="user">What is 12 + 30?</Message>
  </Agent>,
)

console.log('Result:', result.content)
console.log('Usage:', result.usage)
