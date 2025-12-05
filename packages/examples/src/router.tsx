/**
 * Router Demo - Comprehensive demonstration of state-based and natural language routing
 *
 * This example shows how to use <Router> and <Route> to conditionally render
 * agent components (tools, context, system prompts) based on:
 * - Boolean state values (e.g., isAuthenticated)
 * - Natural language descriptions (e.g., "user wants to do math")
 *
 * Key Features Demonstrated:
 * - State-based routing: Routes activate based on useState values
 * - Natural language routing: LLM evaluates which routes match the conversation
 * - Parallel routing: Multiple routes can be active simultaneously
 * - Dynamic tools: Available tools change based on active routes
 * - State transitions: Tool handlers can update state to change routes
 */

import { useState } from 'react'
import {
  run,
  Agent,
  System,
  Context,
  Router,
  Route,
  Tools,
  Tool,
} from 'agentry'
import { MODEL } from '@agentry/shared'
import { z } from 'zod'
import { runInteractive } from './utils/interactive.ts'

function RouterDemoAgent() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  return (
    <Agent model={MODEL} maxTokens={2048} stream={true}>
      <System>
        You are a helpful assistant with capabilities that change based on
        authentication status and user intent. Always check your available tools
        and context to understand what you can do.
      </System>

      <Router>
        {/* ========================================
            BOOLEAN STATE-BASED ROUTES
            These evaluate synchronously based on state values
            ======================================== */}

        {/* Route 1: Not authenticated - Only auth tool available */}
        <Route when={!isAuthenticated}>
          <Context>
            🔒 USER NOT AUTHENTICATED

            The user has not authenticated yet. Only the authenticate tool is
            available. Politely inform them they need to authenticate first.
          </Context>
          <Tools>
            <Tool
              name="authenticate"
              description="Authenticate the user with their email address"
              parameters={z.object({
                email: z.string().email().describe("User's email address"),
                isAdmin: z
                  .boolean()
                  .optional()
                  .describe('Whether this user has admin privileges'),
              })}
              handler={async ({ email, isAdmin: admin }) => {
                console.log(`\n✅ [AUTH] Authenticated as ${email}${admin ? ' (ADMIN)' : ''}\n`)
                setIsAuthenticated(true)
                if (admin) {
                  setIsAdmin(true)
                }
                return `Successfully authenticated as ${email}${admin ? ' with admin privileges' : ''}! All features are now available.`
              }}
            />
          </Tools>
        </Route>

        {/* Route 2: Authenticated - General tools available */}
        <Route when={isAuthenticated}>
          <Context>
            ✅ USER AUTHENTICATED

            The user is authenticated. General tools are available.
          </Context>
          <Tools>
            <Tool
              name="get_status"
              description="Get current system status and available features"
              parameters={z.object({})}
              handler={async () => {
                return `System Status: ✅ Operational
User: Authenticated${isAdmin ? ' (Admin)' : ''}
Available Features: All features enabled

You can:
- Perform mathematical calculations
- Search for information
- Get system status
${isAdmin ? '- Access admin functions' : ''}`
              }}
            />
            <Tool
              name="logout"
              description="Log out the current user"
              parameters={z.object({})}
              handler={async () => {
                console.log('\n🔓 [AUTH] User logged out\n')
                setIsAuthenticated(false)
                setIsAdmin(false)
                return 'Successfully logged out. You will need to authenticate again to access features.'
              }}
            />
          </Tools>
        </Route>

        {/* Route 3: Admin privileges - Admin tools available */}
        <Route when={isAdmin}>
          <Context>
            👑 ADMIN MODE ACTIVE

            The user has admin privileges. Admin tools are available in addition
            to regular tools.
          </Context>
          <Tools>
            <Tool
              name="admin_reset"
              description="Admin function to reset the system"
              parameters={z.object({
                confirm: z
                  .boolean()
                  .describe('Confirmation that user wants to reset'),
              })}
              handler={async ({ confirm }) => {
                if (!confirm) {
                  return 'Reset cancelled. Set confirm=true to proceed.'
                }
                return '🔄 System reset initiated (demo only - no actual reset performed)'
              }}
            />
          </Tools>
        </Route>

        {/* ========================================
            NATURAL LANGUAGE ROUTES
            These are evaluated by LLM based on conversation context
            Multiple NL routes can be active simultaneously
            ======================================== */}

        {/* Route 4: Math intent - Calculator available */}
        <Route when="user wants to do math, calculations, or arithmetic">
          <Context>
            🧮 MATH MODE ACTIVE

            The conversation indicates mathematical intent. The calculate tool is
            available for performing calculations.
          </Context>
          <Tools>
            <Tool
              name="calculate"
              description="Perform mathematical calculations and evaluate expressions"
              parameters={z.object({
                expression: z
                  .string()
                  .describe(
                    'Mathematical expression to evaluate (e.g., "2 + 2", "15 * 7")',
                  ),
              })}
              handler={async ({ expression }) => {
                try {
                  // Simple eval for demo purposes
                  // In production, use a proper math parser
                  // eslint-disable-next-line no-eval
                  const result = eval(expression)
                  return `📊 Calculation Result: ${expression} = ${result}`
                } catch (error) {
                  return `❌ Error evaluating expression: ${error}`
                }
              }}
            />
          </Tools>
        </Route>

        {/* Route 5: Information intent - Knowledge base available */}
        <Route when="user wants information, knowledge, facts, or to learn about something">
          <Context>
            📚 INFORMATION MODE ACTIVE

            The conversation indicates the user wants to learn or get information.
            The search tool is available for retrieving knowledge.
          </Context>
          <Tools>
            <Tool
              name="search_info"
              description="Search for information about a topic"
              parameters={z.object({
                topic: z
                  .string()
                  .describe('Topic to search for and retrieve information about'),
              })}
              handler={async ({ topic }) => {
                // Simulate a knowledge base lookup
                return `📖 Information about "${topic}":

[Demo Response - In production, this would query a real knowledge base]

This is where detailed information about ${topic} would appear. The search tool
is automatically available when the user asks questions seeking knowledge or facts.

The Router detected this intent from the conversation and activated the appropriate
tools to handle the request.`
              }}
            />
          </Tools>
        </Route>
      </Router>
    </Agent>
  )
}

async function main() {
  console.clear()
  console.log('🛣️  Router Demo - State-Based & Natural Language Routing')
  console.log('═'.repeat(70))
  console.log()
  console.log('This demo shows how <Router> and <Route> enable dynamic agent')
  console.log('capabilities based on state and conversation context.')
  console.log()
  console.log('📋 Features Demonstrated:')
  console.log('  • State-based routing: Routes activate based on boolean state')
  console.log('  • Natural language routing: LLM evaluates conversation intent')
  console.log('  • Parallel routing: Multiple routes can be active simultaneously')
  console.log('  • Dynamic tools: Available tools change as routes activate/deactivate')
  console.log()
  console.log('💡 Try these commands to see routing in action:')
  console.log()
  console.log('  1. "help" or "what can you do?"')
  console.log('     → Should see only authenticate tool (not authenticated)')
  console.log()
  console.log('  2. "authenticate as me@example.com"')
  console.log('     → State changes, general tools become available')
  console.log()
  console.log('  3. "calculate 15 * 7"')
  console.log('     → Natural language route activates, math tool available')
  console.log()
  console.log('  4. "tell me about quantum computing"')
  console.log('     → Natural language route activates, search tool available')
  console.log()
  console.log('  5. "authenticate as admin@example.com with admin privileges"')
  console.log('     → Multiple routes active: authenticated + admin')
  console.log()
  console.log('  6. "logout"')
  console.log('     → State changes back, only auth tool available again')
  console.log()
  console.log('  Type "exit" to quit')
  console.log()
  console.log('═'.repeat(70))
  console.log()

  const agent = await run(<RouterDemoAgent />, { mode: 'interactive' })

  runInteractive(agent, {
    title: '🛣️  Router Demo',
    subtitle: 'Watch routes activate and change based on state and intent',
  })
}

main().catch(console.error)
