import { Type } from 'agentry'
import { run, defineTool, Agent, System, Tools, Tool, Message } from 'agentry'
import { MODEL } from './constants'

const OPERATIONS = ['add', 'subtract', 'multiply', 'divide'] as const

const parametersSchema = Type.Object({
  operation: Type.Union(
    [
      Type.Literal('add'),
      Type.Literal('subtract'),
      Type.Literal('multiply'),
      Type.Literal('divide'),
    ],
    { description: 'the operation to perform' },
  ),
  a: Type.Number({ description: 'first number' }),
  b: Type.Number({ description: 'second number' }),
})

const calculatorTool = defineTool({
  name: 'calculator',
  description: 'perform basic math calculations',
  parameters: parametersSchema,
  strict: true,
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

const result = await run(
  <Agent provider="anthropic" model={MODEL} maxTokens={1024}>
    <System>You are a helpful math assistant.</System>
    <Tools>
      <Tool {...calculatorTool} />
    </Tools>
    <Message role="user">
      Come up with two numbers and sum perform an operation in{' '}
      {OPERATIONS.join(', ')} them.
    </Message>
  </Agent>,
)

console.log('Result:', result.content)
console.log('Usage:', result.usage)
