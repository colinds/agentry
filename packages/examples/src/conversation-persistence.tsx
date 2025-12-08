import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { run, defineTool, Agent, System, Tools, Tool, Message } from 'agentry'
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta'
import { MODEL } from './constants'

// Storage directory
const CONVERSATIONS_DIR = join(__dirname, '.conversations')

// Simple storage format
interface ConversationData {
  messages: BetaMessageParam[]
  savedAt: string
}

/**
 * Save conversation to JSON file
 */
async function saveConversation(
  messages: readonly BetaMessageParam[],
  filename: string,
): Promise<void> {
  // Ensure directory exists
  await mkdir(CONVERSATIONS_DIR, { recursive: true })

  const filepath = join(CONVERSATIONS_DIR, filename)

  const data: ConversationData = {
    messages: [...messages],
    savedAt: new Date().toISOString(),
  }

  await writeFile(filepath, JSON.stringify(data, null, 2), 'utf-8')
}

/**
 * Load conversation from JSON file
 */
async function loadConversation(filename: string): Promise<BetaMessageParam[]> {
  const filepath = join(CONVERSATIONS_DIR, filename)
  const content = await readFile(filepath, 'utf-8')
  const data = JSON.parse(content) as ConversationData
  return data.messages
}

/**
 * Create stable tool definitions
 * Must be identical for save and load to work correctly
 */
function createTools() {
  const calculatorTool = defineTool({
    name: 'calculate',
    description: 'Perform basic math calculations',
    strict: true,
    parameters: z.object({
      expression: z.string().describe('Mathematical expression to evaluate'),
    }),
    handler: async ({ expression }) => {
      try {
        // WARNING: eval() is a security risk - this is for demo purposes only!
        // Never use eval() with untrusted input in production code. Use mathjs or similar instead.
        const result = eval(expression)
        return `Result: ${result}`
      } catch (error) {
        return `Error: Invalid expression - ${error instanceof Error ? error.message : String(error)}`
      }
    },
  })

  const timeTool = defineTool({
    name: 'get_time',
    description: 'Get the current time in ISO format',
    parameters: z.object({}),
    handler: async () => {
      const now = new Date()
      return `Current time: ${now.toISOString()}`
    },
  })

  return [calculatorTool, timeTool] as const
}

/**
 * Agent component that can be initialized with saved messages
 */
interface DemoAgentProps {
  initialMessages?: BetaMessageParam[]
}

const DemoAgent = ({ initialMessages = [] }: DemoAgentProps) => {
  const tools = createTools()

  return (
    <Agent model={MODEL} maxTokens={2048} stream={false}>
      <System>
        You are a helpful assistant with calculator and time tools. You can
        remember previous conversations if they are loaded.
      </System>

      {/* Pre-load saved messages if provided */}
      {initialMessages.map((msg, idx) => (
        <Message key={idx} role={msg.role} content={msg.content} />
      ))}

      <Tools>
        <Tool {...tools[0]} />
        <Tool {...tools[1]} />
      </Tools>
    </Agent>
  )
}

/**
 * Main demonstration
 */
async function main() {
  console.clear()
  console.log('━'.repeat(60))
  console.log('Conversation Persistence Example')
  console.log('━'.repeat(60))
  console.log()

  // Part 1: Initial conversation
  console.log('Part 1: Initial Conversation')
  console.log('━'.repeat(60))
  console.log()

  const agent1 = await run(<DemoAgent />, { mode: 'interactive' })

  console.log('User: What is 25 * 4?\n')
  const result1 = await agent1.sendMessage('What is 25 * 4?')
  console.log(`AI: ${result1.content}`)
  console.log()

  // Save the conversation
  const filename = 'demo-conversation.json'
  await saveConversation(agent1.messages, filename)
  console.log(`✓ Conversation saved to .conversations/${filename}`)
  console.log(`  (${agent1.messages.length} messages)`)
  console.log()

  agent1.close()

  // Part 2: Load and continue
  console.log('━'.repeat(60))
  console.log('Part 2: Loading and Continuing Conversation')
  console.log('━'.repeat(60))
  console.log()

  const savedMessages = await loadConversation(filename)
  console.log(`✓ Loaded conversation (${savedMessages.length} messages)`)
  console.log()

  // Create new agent with saved messages
  const agent2 = await run(<DemoAgent initialMessages={savedMessages} />, {
    mode: 'interactive',
  })

  // Continue the conversation - agent should remember the calculation
  console.log('User: What was that result again?\n')
  const result2 = await agent2.sendMessage('What was that result again?')
  console.log(`AI: ${result2.content}`)
  console.log()

  // Ask for current time to show tools still work
  console.log("User: What's the current time?\n")
  const result3 = await agent2.sendMessage("What's the current time?")
  console.log(`AI: ${result3.content}`)
  console.log()

  agent2.close()

  // Summary
  console.log('━'.repeat(60))
  console.log('✓ Demonstration complete!')
  console.log()
  console.log('Key points:')
  console.log('  • Messages are serializable (BetaMessageParam[])')
  console.log('  • Use <Message> components to pre-load conversation history')
  console.log('  • Tools must be defined identically for save and load')
  console.log('  • Agent remembers full context from saved conversation')
  console.log('━'.repeat(60))
}

main().catch(console.error)
