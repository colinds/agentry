import { Type } from 'agentry'
import {
  createAI,
  defineTool,
  Agent,
  System,
  Tools,
  Tool,
  AgentTool,
} from 'agentry'
import { MODEL, OPENAI_MODEL } from './constants'
import { runInteractive } from './utils/interactive'

const EXAMPLE_PROVIDER =
  process.env.EXAMPLE_PROVIDER === 'openai' ? 'openai' : 'anthropic'
const EXAMPLE_MODEL = EXAMPLE_PROVIDER === 'openai' ? OPENAI_MODEL : MODEL
const ai = EXAMPLE_PROVIDER === 'openai' ? createAI() : createAI()

const ChatbotAgent = () => {
  // Calculator tool for basic math
  const calculatorTool = defineTool({
    name: 'calculate',
    description: 'Perform basic math calculations',
    strict: true,
    parameters: Type.Object({
      expression: Type.String({
        description: 'Mathematical expression to evaluate (e.g., "2 + 2")',
      }),
    }),
    handler: async ({ expression }) => {
      try {
        // WARNING: eval() is a security risk - this is for demo purposes only!
        // Never use eval() with untrusted input in production code.
        // Use a proper math parser library like mathjs instead.
        const result = eval(expression) // oxlint-disable-line no-eval
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
    parameters: Type.Object({}), // no parameters needed
    handler: async () => {
      return new Date().toISOString()
    },
  })

  // Fun tool for generating a random light-hearted joke
  const jokeTool = defineTool({
    name: 'tell_joke',
    description: 'Tell a short, family-friendly programming joke',
    parameters: Type.Object({}), // no parameters needed
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
      provider={EXAMPLE_PROVIDER}
      model={EXAMPLE_MODEL}
      name="web_researcher"
      description="Specialist subagent for web research using the web_search tool"
      maxTokens={2048}
    >
      <System>
        You are a focused web research assistant. Use the web_search tool to
        find up-to-date information on the internet, then synthesize concise,
        source-backed answers. Prefer official and reputable sources.
      </System>
      <Tools></Tools>
    </Agent>
  )

  return (
    <Agent
      provider={EXAMPLE_PROVIDER}
      model={EXAMPLE_MODEL}
      maxTokens={2048}
      stream={true}
    >
      <System>
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
        <AgentTool
          name="web_researcher"
          description="Specialist subagent for web research using the web_search tool"
          parameters={Type.Object({})}
          agent={() => <WebSearchSubagent />}
        />
      </Tools>
    </Agent>
  )
}

async function main() {
  const agent = await ai.run(<ChatbotAgent />, { mode: 'interactive' })

  runInteractive(agent, {
    title: '🤖 AI Chatbot',
    subtitle: 'Type your messages and press Enter.',
  })
}

main().catch(console.error)
