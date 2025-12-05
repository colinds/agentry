import { useState, useEffect } from 'react'
import { z } from 'zod'
import { run, Agent, System, Tools, Tool } from 'agentry'
import { MODEL } from '@agentry/shared'
import readline from 'node:readline'
import type { Interface } from 'node:readline'

function AuthenticatedAgent() {
  const [email, setEmail] = useState<string | null>(null)
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    if (!email) return
    const checkAuth = async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      console.log(`[API] Verifying authentication for ${email}...`)
      setAuthed(true)
    }
    checkAuth()
  }, [email])

  return (
    <Agent model={MODEL} maxTokens={2048} stream={true}>
      {!email && <System>User must authenticate with email first.</System>}
      {email && !authed && (
        <System>Verifying authentication for {email}...</System>
      )}
      {email && authed && (
        <System>User authenticated as {email}. All tools are available.</System>
      )}
      <Tools>
        {!email && (
          <Tool
            name="authenticate"
            description="authenticate with email"
            parameters={z.object({ email: z.string().email() })}
            handler={async ({ email: e }) => {
              setEmail(e)
              setAuthed(false)
              return `Email ${e} received. Tell the user we are verifying...`
            }}
          />
        )}
        {authed && (
          <>
            <Tool
              name="get_profile"
              description="get the authenticated user profile"
              parameters={z.object({})}
              handler={async () => {
                return `Profile for ${email}:\n- Email: ${email}\n- Status: Active\n- Access Level: Full`
              }}
            />
            <Tool
              name="send_message"
              description="send a message"
              parameters={z.object({ message: z.string() })}
              handler={async ({ message }) => {
                return `Message sent from ${email}: "${message}"`
              }}
            />
          </>
        )}
      </Tools>
    </Agent>
  )
}

async function main() {
  console.clear()
  console.log('🔐 Authentication Demo')
  console.log('━'.repeat(50))
  console.log('Type your messages and press Enter. Type "exit" to quit.\n')

  const agent = await run(<AuthenticatedAgent />, { mode: 'interactive' })

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
