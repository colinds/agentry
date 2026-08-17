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

  // A subagent with a tool the parent does not have. Agentry ships no built-in
  // tools of any kind, so the research subagent gets a plain fetch tool —
  // written the same way you would write any other.
  const fetchUrlTool = defineTool({
    name: 'fetch_url',
    description: 'Fetch a URL and return its text content, truncated.',
    parameters: Type.Object({
      url: Type.String({ description: 'Absolute http(s) URL to fetch' }),
    }),
    handler: async ({ url }) => {
      try {
        const response = await fetch(url, {
          headers: { 'user-agent': 'agentry-example' },
          signal: AbortSignal.timeout(15_000),
        })
        if (!response.ok) {
          return `Request failed: ${response.status} ${response.statusText}`
        }
        const body = await response.text()
        return body.slice(0, 4000)
      } catch (error) {
        // Returned as a string so the model can recover and try another URL.
        return `Could not fetch ${url}: ${
          error instanceof Error ? error.message : String(error)
        }`
      }
    },
  })

  const ResearchSubagent = () => (
    <Agent
      provider={EXAMPLE_PROVIDER}
      model={EXAMPLE_MODEL}
      name="researcher"
      description="Specialist subagent that reads web pages and summarizes them"
      maxTokens={2048}
    >
      <System>
        You are a focused research assistant. Use the fetch_url tool to read
        pages the user names or that you can infer, then synthesize a concise,
        source-backed answer. Say so plainly when a page does not answer the
        question — you cannot search, you can only fetch URLs.
      </System>
      <Tools>
        <Tool {...fetchUrlTool} />
      </Tools>
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
        researcher subagent that can fetch and summarize a web page when you
        have a URL to read.
      </System>
      <Tools>
        <Tool {...calculatorTool} />
        <Tool {...timeTool} />
        <Tool {...jokeTool} />
        <AgentTool
          name="researcher"
          description="Reads a web page and summarizes it. Give it a URL and a question."
          parameters={Type.Object({
            request: Type.String({
              description: 'What to find out, including any URL to read',
            }),
          })}
          agent={() => <ResearchSubagent />}
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
