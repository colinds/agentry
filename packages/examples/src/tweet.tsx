import { z } from 'zod'
import { run, Agent, System, Tools, AgentTool, Message } from 'agentry'
import { WebSearch, CodeExecution } from 'agentry/openai'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

function Researcher() {
  return (
    <Agent
      provider="anthropic"
      model="claude-sonnet-4-5"
      onMessage={(event) => {
        console.log('top-level', event)
      }}
    >
      <System>You are a research assistant.</System>
      <Tools>
        <AgentTool
          name="search"
          description="Search the web for information"
          parameters={z.object({ query: z.string() })}
          agent={({ query }) => (
            <Agent
              provider="openai"
              model="gpt-5-mini"
              websocket={true}
              onMessage={(event) => {
                console.log('sub-agent search', JSON.stringify(event, null, 2))
              }}
            >
              <Tools>
                <WebSearch />
              </Tools>
              <Message role="user">{query}</Message>
            </Agent>
          )}
        />
        <AgentTool
          name="compute"
          description="Run Python to analyze data"
          parameters={z.object({ task: z.string() })}
          agent={({ task }) => (
            <Agent
              provider="openai"
              model="gpt-5.3-codex"
              onMessage={(event) => {
                console.log('sub-agent compute', JSON.stringify(event, null, 2))
              }}
            >
              <Tools>
                <CodeExecution />
              </Tools>
              <Message role="user">{task}</Message>
            </Agent>
          )}
        />
      </Tools>
    </Agent>
  )
}

const agent = await run(<Researcher />, {
  mode: 'interactive',
  providers: {
    anthropic: { client: new Anthropic() },
    openai: { client: new OpenAI() },
  },
})

const res = await agent.sendMessage(
  'Look up the populations of the 10 largest US cities, ' +
    'then compute what percentage of the total US population they represent.',
)
console.log(res.content)
agent.close()
