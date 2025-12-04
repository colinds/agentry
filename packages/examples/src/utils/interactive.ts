import readline from 'node:readline'
import type { Interface } from 'node:readline'
import type { AgentHandle } from 'agentry'

export interface InteractiveOptions {
  /** title shown at startup */
  title: string
  /** optional subtitle/instructions */
  subtitle?: string
  /** prompt color escape code (default: green \x1b[32m) */
  promptColor?: string
  /** response color escape code (default: blue \x1b[34m) */
  responseColor?: string
}

/**
 * runs an interactive chat loop with the given agent handle
 */
export function runInteractive(
  agent: AgentHandle,
  options: InteractiveOptions,
) {
  const {
    title,
    subtitle,
    promptColor = '\x1b[32m',
    responseColor = '\x1b[34m',
  } = options

  console.clear()
  console.log(title)
  console.log('━'.repeat(50))
  if (subtitle) {
    console.log(subtitle)
  }
  console.log('Type "exit" to quit.\n')

  const rl: Interface = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const askQuestion = () => {
    rl.question(`\n${promptColor}You:\x1b[0m `, async (input: string) => {
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

      process.stdout.write(`\n${responseColor}AI:\x1b[0m `)

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

        console.log()
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
