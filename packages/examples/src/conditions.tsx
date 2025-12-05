/**
 * Condition Demo - Comprehensive demonstration of state-based and natural language conditions
 *
 * This example shows how to use <Condition> to conditionally render
 * agent components (tools, context, system prompts) based on:
 * - Boolean state values (e.g., isAuthenticated)
 * - Natural language descriptions (e.g., "user wants to do math")
 *
 * Key Features Demonstrated:
 * - State-based conditions: Activate based on useState values
 * - Natural language conditions: LLM evaluates which conditions match
 * - Parallel conditions: Multiple conditions can be active simultaneously
 * - Dynamic tools: Available tools change based on active conditions
 * - Nested conditions: Premium tier nested inside authentication (both must be true)
 */

import { useState } from 'react'
import { run, Agent, System, Context, Condition, Tools, Tool } from 'agentry'
import { MODEL } from '@agentry/shared'
import { z } from 'zod'
import { runInteractive } from './utils/interactive.ts'

function ConditionDemoAgent() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isPremium, setIsPremium] = useState(false)

  console.log(
    'isAuthenticated',
    isAuthenticated,
    'isAdmin',
    isAdmin,
    'isPremium',
    isPremium,
  )

  return (
    <Agent model={MODEL} maxTokens={2048} stream={true}>
      <System>
        You are a helpful assistant with capabilities that change based on
        authentication status and user intent. Always check your available tools
        and context to understand what you can do.
      </System>

      {/* No more <Router> wrapper! Conditions are standalone */}

      {/* Condition 1: Not authenticated - Only auth tool available */}
      <Condition when={!isAuthenticated}>
        <Context>
          🔒 USER NOT AUTHENTICATED The user has not authenticated yet. Only the
          authenticate tool is available. Politely inform them they need to
          authenticate first.
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
              console.log(
                `\n✅ [AUTH] Authenticated as ${email}${admin ? ' (ADMIN)' : ''}\n`,
              )
              setIsAuthenticated(true)
              if (admin) {
                setIsAdmin(true)
              }
              return `Successfully authenticated as ${email}${admin ? ' with admin privileges' : ''}! All features are now available.`
            }}
          />
        </Tools>
      </Condition>

      {/* Route 2: Authenticated - General tools available */}
      <Condition when={isAuthenticated}>
        <Context>
          ✅ USER AUTHENTICATED The user is authenticated. General tools are
          available.
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
              setIsPremium(false)
              return 'Successfully logged out. You will need to authenticate again to access features.'
            }}
          />
          <Tool
            name="upgrade_to_premium"
            description="Upgrade the authenticated user to premium tier"
            parameters={z.object({})}
            handler={async () => {
              console.log('\n⭐ [PREMIUM] User upgraded to premium\n')
              setIsPremium(true)
              return '⭐ Successfully upgraded to premium! Advanced analytics features are now available.'
            }}
          />
        </Tools>

        {/* Nested Condition: Premium features (requires authentication + premium) */}
        <Condition when={isPremium}>
          <Context>
            ⭐ PREMIUM TIER ACTIVE The user has premium access. Advanced
            analytics tools are available in addition to standard features.
          </Context>
          <Tools>
            <Tool
              name="advanced_analytics"
              description="Run advanced analytics and generate insights"
              parameters={z.object({
                dataType: z
                  .enum(['user', 'system', 'performance'])
                  .describe('Type of data to analyze'),
              })}
              handler={async ({ dataType }) => {
                return `📊 Advanced Analytics Report (${dataType}):

[Demo Premium Feature]

This is an advanced analytics tool that's only available to premium users
who are also authenticated. This demonstrates nested conditions:
- Parent condition: isAuthenticated (must be true)
- Child condition: isPremium (must be true)

Both conditions must be active for this tool to be available.

Analysis Type: ${dataType}
Status: ✅ Complete
Insights: [Premium insights would appear here]`
              }}
            />
          </Tools>
        </Condition>
      </Condition>

      {/* Route 3: Admin privileges - Admin tools available */}
      <Condition when={isAdmin}>
        <Context>
          👑 ADMIN MODE ACTIVE The user has admin privileges. Admin tools are
          available in addition to regular tools.
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
      </Condition>

      {/* ========================================
            NATURAL LANGUAGE ROUTES
            These are evaluated by LLM based on conversation context
            Multiple NL routes can be active simultaneously
            ======================================== */}

      {/* Route 4: Math intent - Calculator available */}
      <Condition when="user wants to do math, calculations, or arithmetic">
        <Context>
          🧮 MATH MODE ACTIVE The conversation indicates mathematical intent.
          The calculate tool is available for performing calculations.
        </Context>
        <Tools>
          <Tool
            name="calculate"
            description="Perform mathematical calculations and evaluate expressions"
            strict
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
      </Condition>

      {/* Route 5: Information intent - Knowledge base available */}
      <Condition when="user wants information, knowledge, facts, or to learn about something">
        <Context>
          📚 INFORMATION MODE ACTIVE The conversation indicates the user wants
          to learn or get information. The search tool is available for
          retrieving knowledge.
        </Context>
        <Tools>
          <Tool
            name="search_info"
            description="Search for information about a topic"
            strict
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
      </Condition>
    </Agent>
  )
}

async function main() {
  console.clear()
  console.log('🎯 Condition Demo - State-Based & Natural Language Conditions')
  console.log('═'.repeat(70))
  console.log()
  console.log('This demo shows how <Condition> enables dynamic agent')
  console.log('capabilities based on state and conversation context.')
  console.log()
  console.log('📋 Features:')
  console.log('  • Standalone conditions (no wrapper needed)')
  console.log('  • State-based conditions: Boolean evaluation')
  console.log('  • Natural language conditions: LLM evaluation')
  console.log('  • Parallel conditions: Multiple can be active')
  console.log('  • Nested conditions: Premium requires authentication')
  console.log()
  console.log('Type "exit" to quit')
  console.log('═'.repeat(70))
  console.log()

  const agent = await run(<ConditionDemoAgent />, { mode: 'interactive' })

  runInteractive(agent, {
    title: '🎯 Condition Demo',
    subtitle: 'Watch conditions activate based on state and intent',
  })
}

main().catch(console.error)
