import { z } from 'zod'
import {
  render,
  defineTool,
  Agent,
  System,
  Tools,
  Tool,
} from '@agentry/runtime'
import { MODEL } from '@agentry/shared'
import readline from 'node:readline'
import type { Interface } from 'node:readline'

const ChatbotAgent = () => {
  // Define a simple calculator tool
  const calculatorTool = defineTool({
    name: 'calculate',
    description: 'Perform basic math calculations',
    parameters: z.object({
      expression: z
        .string()
        .describe('Mathematical expression to evaluate (e.g., "2 + 2")'),
    }),
    handler: async ({ expression }) => {
      try {
        // WARNING: eval() is a security risk - this is for demo purposes only!
        // Never use eval() with untrusted input in production code.
        // Use a proper math parser library like mathjs instead.
        // eslint-disable-next-line react-hooks/unsupported-syntax
        const result = eval(expression)
        return `Result: ${result}`
      } catch {
        return `Error: Invalid expression`
      }
    },
  })

  return (
    <Agent model={MODEL} maxTokens={2048} stream={true}>
      <System priority={1000}>
        You are a helpful AI assistant. Be concise and friendly. You have access
        to a calculator tool for math problems.
      </System>
      <Tools>
        <Tool {...calculatorTool} />
      </Tools>
    </Agent>
  )
}

async function main() {
  console.clear()
  console.log('🤖 AI Chatbot')
  console.log('━'.repeat(50))
  console.log('Type your messages and press Enter. Type "exit" to quit.\n')

  const agent = await render(<ChatbotAgent />, { mode: 'interactive' })

  const rl: Interface = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const askQuestion = () => {
    rl.question('\n\x1b[32mYou:\x1b[0m ', async (input: string) => {
      const userMessage = input.trim()

      if (!userMessage) {
        askQuestion()
        return
      }

      if (userMessage.toLowerCase() === 'exit') {
        console.log('\nGoodbye! 👋\n')
        agent.close()
        rl.close()
        process.exit(0)
      }

      process.stdout.write('\n\x1b[34mAI:\x1b[0m ')

      try {
        for await (const event of agent.stream(userMessage)) {
          if (event.type === 'text') {
            process.stdout.write(event.text)
          } else if (event.type === 'tool_use_start') {
            process.stdout.write(
              `\n\x1b[90m[Using tool: ${event.toolName}]\x1b[0m\n`,
            )
          }
        }

        console.log() // New line after response
        askQuestion()
      } catch (error) {
        console.error(
          '\n\x1b[31mError:\x1b[0m',
          error instanceof Error ? error.message : error,
        )
        askQuestion()
      }
    })
  }

  askQuestion()
}

main().catch(console.error)
