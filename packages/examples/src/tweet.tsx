import { Type } from 'agentry'
import { run, Agent, System, Tools, AgentTool, Message } from 'agentry'
import {} from 'agentry'

function Researcher() {
  return (
    <Agent provider="anthropic" model="claude-sonnet-4-5">
      <System>You are a research assistant.</System>
      <Tools>
        <AgentTool
          name="search"
          description="Search the web for information"
          parameters={Type.Object({ query: Type.String() })}
          agent={({ query }) => (
            <Agent provider="openai" model="gpt-5-mini">
              <Tools></Tools>
              <Message role="user">{query}</Message>
            </Agent>
          )}
        />
        <AgentTool
          name="compute"
          description="Run Python to analyze data"
          parameters={Type.Object({ task: Type.String() })}
          agent={({ task }) => (
            <Agent provider="openai" model="gpt-5.3-codex">
              <Tools></Tools>
              <Message role="user">{task}</Message>
            </Agent>
          )}
        />
      </Tools>
    </Agent>
  )
}

const agent = await run(<Researcher />, { mode: 'interactive' })

const res = await agent.sendMessage(
  'Look up the populations of the 10 largest US cities, ' +
    'then compute what percentage of the total US population they represent.',
)
console.log(res.content)
agent.close()
