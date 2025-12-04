/**
 * Workflow Example - Interactive multi-step authentication flow
 *
 * Demonstrates:
 * - State-driven workflow progression
 * - Conditional tool availability based on auth state
 * - Step-by-step authentication: email -> secret word -> protected tools
 * - Interactive mode with streaming responses
 */

import { useState } from 'react'
import { z } from 'zod'
import { run, Agent, System, Context, Tools, Tool } from 'agentry'
import { MODEL } from '@agentry/shared'
import { runInteractive } from './utils/interactive.ts'

// simulated user database
const USERS: Record<string, { secretWord: string; name: string }> = {
  'alice@example.com': { secretWord: 'banana', name: 'Alice' },
  'bob@example.com': { secretWord: 'quantum', name: 'Bob' },
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// simulated API calls
async function lookupEmail(email: string) {
  console.log(
    `\n\x1b[90m[API] POST /api/auth/lookup { email: "${email}" }\x1b[0m`,
  )
  await sleep(800)
  const user = USERS[email.toLowerCase()]
  if (!user) {
    console.log(`\x1b[90m[API] 404 Not Found\x1b[0m`)
    return { success: false, error: 'User not found' } as const
  }
  console.log(`\x1b[90m[API] 200 OK { exists: true }\x1b[0m\n`)
  return { success: true, email: email.toLowerCase() } as const
}

async function verifySecretWord(email: string, secretWord: string) {
  console.log(
    `\n\x1b[90m[API] POST /api/auth/verify { email: "${email}", secretWord: "***" }\x1b[0m`,
  )
  await sleep(1200)
  const user = USERS[email]
  if (!user || secretWord.toLowerCase() !== user.secretWord.toLowerCase()) {
    console.log(`\x1b[90m[API] 401 Unauthorized\x1b[0m`)
    return { success: false, error: 'Invalid secret word' } as const
  }
  console.log(
    `\x1b[90m[API] 200 OK { authenticated: true, name: "${user.name}" }\x1b[0m\n`,
  )
  return { success: true, name: user.name } as const
}

type AuthState =
  | { step: 'awaiting_email' }
  | { step: 'awaiting_secret'; email: string }
  | { step: 'authenticated'; email: string; name: string }

function AuthWorkflowAgent() {
  const [auth, setAuth] = useState<AuthState>({ step: 'awaiting_email' })

  return (
    <Agent model={MODEL} maxTokens={2048} stream={true}>
      <System>You are a secure assistant that requires authentication.</System>

      {auth.step === 'awaiting_email' && (
        <Context>
          🔒 Not authenticated. Ask the user for their email address.
        </Context>
      )}

      {auth.step === 'awaiting_secret' && (
        <Context>
          📧 Email verified: {auth.email}. Ask the user for their secret word.
        </Context>
      )}

      {auth.step === 'authenticated' && (
        <Context>
          ✅ Authenticated as {auth.name}. You can now help them with protected
          operations.
        </Context>
      )}

      <Tools>
        {/* step 1: collect email */}
        {auth.step === 'awaiting_email' && (
          <Tool
            name="submit_email"
            description="Submit user's email address for authentication"
            parameters={z.object({
              email: z.string().email().describe("the user's email address"),
            })}
            handler={async ({ email }) => {
              const result = await lookupEmail(email)
              if (!result.success) {
                return `Error: No account found for ${email}. Valid test emails: alice@example.com, bob@example.com`
              }
              setAuth({ step: 'awaiting_secret', email: result.email })
              return `Email recognized! Now ask the user for their secret word.`
            }}
          />
        )}

        {/* step 2: verify secret word */}
        {auth.step === 'awaiting_secret' && (
          <Tool
            name="submit_secret_word"
            description="Submit the secret word to complete authentication"
            parameters={z.object({
              secretWord: z.string().describe("the user's secret word"),
            })}
            handler={async ({ secretWord }) => {
              const result = await verifySecretWord(auth.email, secretWord)
              if (!result.success) {
                return `Incorrect secret word. Please try again.`
              }
              setAuth({
                step: 'authenticated',
                email: auth.email,
                name: result.name,
              })
              return `Authentication successful! Welcome, ${result.name}. Protected tools are now available.`
            }}
          />
        )}

        {/* step 3: protected tools (only available after auth) */}
        {auth.step === 'authenticated' && (
          <>
            <Tool
              name="get_account_balance"
              description="Get the current account balance"
              parameters={z.object({})}
              handler={async () => {
                const balance = (Math.random() * 10000).toFixed(2)
                return `Account balance for ${auth.name}: $${balance}`
              }}
            />
            <Tool
              name="transfer_funds"
              description="Transfer funds to another account"
              parameters={z.object({
                toEmail: z.string().email().describe('recipient email'),
                amount: z.number().positive().describe('amount to transfer'),
              })}
              handler={async ({ toEmail, amount }) => {
                return `Successfully transferred $${amount.toFixed(2)} to ${toEmail}. Transaction ID: TXN-${Date.now()}`
              }}
            />
            <Tool
              name="get_transaction_history"
              description="Get recent transaction history"
              parameters={z.object({
                limit: z
                  .number()
                  .optional()
                  .default(5)
                  .describe('number of transactions'),
              })}
              handler={async ({ limit }) => {
                const transactions = Array.from({ length: limit }, (_, i) => ({
                  id: `TXN-${Date.now() - i * 100000}`,
                  type: i % 2 === 0 ? 'credit' : 'debit',
                  amount: (Math.random() * 500).toFixed(2),
                  date: new Date(Date.now() - i * 86400000)
                    .toISOString()
                    .split('T')[0],
                }))
                return JSON.stringify(transactions, null, 2)
              }}
            />
          </>
        )}
      </Tools>
    </Agent>
  )
}

async function main() {
  const agent = await run(<AuthWorkflowAgent />, { mode: 'interactive' })

  runInteractive(agent, {
    title: '🔐 Auth Workflow',
    subtitle:
      'Test accounts: alice@example.com (banana), bob@example.com (quantum)',
  })
}

main().catch(console.error)
