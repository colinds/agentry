import { z } from 'zod'
import { run, defineTool, Agent, System, Tools, Tool, WebSearch } from 'agentry'
import { MODEL } from '@agentry/shared'
import readline from 'node:readline'
import type { Interface } from 'node:readline'

const ChatbotAgent = () => {
  // Calculator tool for basic math
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

  // Simple tool for getting the current time
  const timeTool = defineTool({
    name: 'get_time',
    description: 'Get the current date and time in ISO format',
    parameters: z.object({}), // no parameters needed
    handler: async () => {
      return new Date().toISOString()
    },
  })

  // Fun tool for generating a random light-hearted joke
  const jokeTool = defineTool({
    name: 'tell_joke',
    description: 'Tell a short, family-friendly programming joke',
    parameters: z.object({}), // no parameters needed
    handler: async () => {
      const jokes = [
        'Why do programmers prefer dark mode? Because light attracts bugs.',
        'There are only 10 kinds of people in the world: those who understand binary and those who don’t.',
        'A SQL query walks into a bar, walks up to two tables and asks: “Can I join you?”',
        'How many programmers does it take to change a light bulb? None, that’s a hardware problem.',
      ]
      const index = Math.floor(Math.random() * jokes.length)
      return jokes[index]!
    },
  })

  // Web search subagent that specializes in online research
  const WebSearchSubagent = () => (
    <Agent
      model={MODEL}
      name="web_researcher"
      description="Specialist subagent for web research using the web_search tool"
      maxTokens={2048}
    >
      <System>
        You are a focused web research assistant. Use the web_search tool to
        find up-to-date information on the internet, then synthesize concise,
        source-backed answers. Prefer official and reputable sources.
      </System>
      <Tools>
        <WebSearch maxUses={5} />
      </Tools>
    </Agent>
  )

  return (
    <Agent model={MODEL} maxTokens={2048} stream={true}>
      <System priority={1000}>
        You are a helpful AI assistant. Be concise and friendly. You have access
        to several tools: a calculator for math problems, a time tool for
        current timestamps, a joke tool for light-hearted responses, and a
        web_researcher subagent that can browse the web using the web_search
        tool when you need fresh, online information.
      </System>
      <Tools>
        <Tool {...calculatorTool} />
        <Tool {...timeTool} />
        <Tool {...jokeTool} />
        <WebSearchSubagent />
      </Tools>
    </Agent>
  )
}

async function main() {
  console.clear()
  console.log('🤖 AI Chatbot')
  console.log('━'.repeat(50))
  console.log('Type your messages and press Enter. Type "exit" to quit.\n')

  const agent = await run(<ChatbotAgent />, { mode: 'interactive' })

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
