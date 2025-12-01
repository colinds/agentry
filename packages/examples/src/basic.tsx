import { z } from 'zod'
import {
  render,
  defineTool,
  Agent,
  System,
  Tools,
  Tool,
  Message,
} from '@agentry/runtime'
import { MODEL } from '@agentry/shared'

const parametersSchema = z.object({
  operation: z
    .enum(['add', 'subtract', 'multiply', 'divide'])
    .describe('the operation to perform'),
  a: z.number().describe('first number'),
  b: z.number().describe('second number'),
})

const calculatorTool = defineTool({
  name: 'calculator',
  description: 'perform basic math calculations',
  parameters: parametersSchema,
  handler: async ({ operation, a, b }) => {
    console.log(`Calculating: ${a} ${operation} ${b}`)
    switch (operation) {
      case 'add':
        return `${a} + ${b} = ${a + b}`
      case 'subtract':
        return `${a} - ${b} = ${a - b}`
      case 'multiply':
        return `${a} * ${b} = ${a * b}`
      case 'divide':
        if (b === 0) return 'Error: Division by zero'
        return `${a} / ${b} = ${a / b}`
    }
  },
})

const result = await render(
  <Agent model={MODEL} maxTokens={1024}>
    <System>You are a helpful math assistant.</System>
    <Tools>
      <Tool {...calculatorTool} />
    </Tools>
    <Message role="user">
      Come up with two numbers and sum perform an operation in{' '}
      {Object.values(parametersSchema.shape.operation.enum).join(', ')} them.
    </Message>
  </Agent>,
)

console.log('Result:', result.content)
console.log('Usage:', result.usage)
