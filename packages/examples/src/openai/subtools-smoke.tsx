import { z } from 'zod'
import { run, Agent, AgentTool, Tool, Message, System, Tools } from 'agentry'
import { openai } from 'agentry/openai'
import { OPENAI_MODEL as EXAMPLE_OPENAI_MODEL } from '../constants'

const MODEL = process.env.OPENAI_MODEL ?? EXAMPLE_OPENAI_MODEL

const result = await run(
  <Agent provider="openai" model={MODEL} maxTokens={1024}>
    <System>
      You are a coordinator. Use subagents when you need focused help.
    </System>
    <Tools>
      <AgentTool
        name="researcher"
        description="Research specialist"
        parameters={z.object({ topic: z.string() })}
        agent={({ topic }) => (
          <Agent model={MODEL} name="researcher">
            <Message role="user">Research briefly: {topic}</Message>
          </Agent>
        )}
      />
      <Tool
        name="spawn_reviewer"
        description="Spawn a reviewer subagent programmatically"
        parameters={z.object({ text: z.string() })}
        handler={async ({ text }, context) => {
          const spawned = await context.runAgent(
            <Agent model={MODEL} name="reviewer">
              <Message role="user">Review and improve this: {text}</Message>
            </Agent>,
            { provider: 'openai' },
          )
          return spawned.content
        }}
      />
    </Tools>
    <Message role="user">
      Research "Bun startup performance", then run the reviewer on your own draft and return the final answer.
    </Message>
  </Agent>,
  {
    clients: {
      openai: openai(),
    },
  },
)

console.log('Result:', result.content)
console.log('Usage:', result.usage)
