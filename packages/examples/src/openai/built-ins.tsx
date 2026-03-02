import { createAI, Agent, Message, System, Tools } from 'agentry'
import OpenAI from 'openai'
import { CodeExecution, MCP, WebSearch } from 'agentry/openai'
import { OPENAI_MODEL as EXAMPLE_OPENAI_MODEL } from '../constants'

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? EXAMPLE_OPENAI_MODEL
const MCP_SERVER_URL = 'https://demo-day.mcp.cloudflare.com/sse'

const ai = createAI({
  providers: {
    openai: { client: new OpenAI() },
  },
})

const result = await ai.run(
  <Agent
    provider="openai"
    model={OPENAI_MODEL}
    maxTokens={4096}
    websocket={true}
  >
    <System>
      You can use web_search, code execution, and MCP tools. First, find one
      recent data point about renewable energy adoption in 2025, then use code
      execution to compute a simple projection for 2030, and finally use an MCP
      tool if relevant to validate or enrich your answer. Return a concise
      summary with the calculation steps.
    </System>

    <Tools>
      <WebSearch maxUses={3} />
      <CodeExecution />
    </Tools>

    <MCP
      name="cloudflare-demo"
      url={MCP_SERVER_URL}
      tool_configuration={{ enabled: true }}
    />

    <Message role="user">
      Research renewable energy adoption, do a projection to 2030, and include
      what tools you used.
    </Message>
  </Agent>,
)

console.log('Result:', result.content)
console.log('Usage:', result.usage)
