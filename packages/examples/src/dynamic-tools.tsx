import { useState } from 'react'
import { z } from 'zod'
import {
  render,
  defineTool,
  Agent,
  System,
  Tools,
  Tool,
  Message,
} from 'agentry'
import { MODEL } from '@agentry/shared'

function MathAgent() {
  const [isUnlocked, setIsUnlocked] = useState(false)

  console.log(`[MathAgent render] isUnlocked=${isUnlocked}`)

  return (
    <Agent model={MODEL} maxTokens={2048}>
      <System>
        You are a helpful math assistant.
        {isUnlocked
          ? ' You have access to advanced operations: multiply, divide, and power.'
          : ' Basic operations are available. Ask to unlock advanced features for more.'}
      </System>
      <Tools>
        <Tool
          {...defineTool({
            name: 'calculator',
            description: 'perform basic math (add, subtract)',
            parameters: z.object({
              operation: z
                .enum(['add', 'subtract'])
                .describe('the operation to perform'),
              a: z.number().describe('first number'),
              b: z.number().describe('second number'),
            }),
            handler: async ({ operation, a, b }) => {
              const result = operation === 'add' ? a + b : a - b
              return `${a} ${operation === 'add' ? '+' : '-'} ${b} = ${result}`
            },
          })}
        />

        {!isUnlocked && (
          <Tool
            {...defineTool({
              name: 'unlock_advanced',
              description:
                'unlock advanced math operations (multiply, divide, power)',
              parameters: z.object({
                confirm: z.boolean().describe('set to true to confirm'),
              }),
              handler: async ({ confirm }) => {
                if (!confirm) return 'Set confirm to true to unlock.'
                console.log('[Unlock] Setting state...')
                setIsUnlocked(true)
                console.log('[Unlock] State set!')
                return 'Advanced features unlocked! You now have multiply, divide, and power.'
              },
            })}
          />
        )}

        {isUnlocked && (
          <Tool
            {...defineTool({
              name: 'advanced_calculator',
              description: 'perform advanced math (multiply, divide, power)',
              parameters: z.object({
                operation: z
                  .enum(['multiply', 'divide', 'power'])
                  .describe('the operation to perform'),
                a: z.number().describe('first number'),
                b: z.number().describe('second number'),
              }),
              handler: async ({ operation, a, b }) => {
                switch (operation) {
                  case 'multiply':
                    return `${a} × ${b} = ${a * b}`
                  case 'divide':
                    return b === 0
                      ? 'Error: division by zero'
                      : `${a} ÷ ${b} = ${a / b}`
                  case 'power':
                    return `${a}^${b} = ${Math.pow(a, b)}`
                }
              },
            })}
          />
        )}
      </Tools>
      <Message role="user">
        Add 15 + 27, then unlock advanced features and calculate 6 to the power
        of 3.
      </Message>
    </Agent>
  )
}

const result = await render(<MathAgent />)

console.log('Result:', result.content)
console.log('Usage:', result.usage)
