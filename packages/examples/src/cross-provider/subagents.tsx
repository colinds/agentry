import { Type } from 'agentry'
import {
  createAI,
  Agent,
  System,
  Message,
  Tools,
  AgentTool,
  Tool,
} from 'agentry'
import {
  MODEL as EXAMPLE_ANTHROPIC_MODEL,
  OPENAI_MODEL as EXAMPLE_OPENAI_MODEL,
} from '../constants'

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? EXAMPLE_OPENAI_MODEL
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? EXAMPLE_ANTHROPIC_MODEL
const ai = createAI()

const result = await ai.run(
  <Agent provider="openai" model={OPENAI_MODEL} maxTokens={2048}>
    <System>
      You are a coordinator. Delegate research to the researcher subagent and
      then use the reviewer tool to improve your final response.
    </System>

    <Tools>
      <AgentTool
        name="researcher"
        description="Deep web researcher"
        parameters={Type.Object({ topic: Type.String() })}
        agent={({ topic }) => (
          <Agent provider="anthropic" model={ANTHROPIC_MODEL} name="researcher">
            <Message role="user">Research deeply: {topic}</Message>
          </Agent>
        )}
      />

      <Tool
        name="spawn_anthropic_reviewer"
        description="Programmatically spawn an Anthropic reviewer"
        parameters={Type.Object({ text: Type.String() })}
        handler={async ({ text }, context) => {
          const result = await context.runAgent(
            <Agent provider="anthropic" model={ANTHROPIC_MODEL} name="reviewer">
              <Message role="user">Review this text: {text}</Message>
            </Agent>,
            {
              provider: 'anthropic',
            },
          )
          return result.content
        }}
      />
    </Tools>

    <Message role="user">
      Research recent Bun runtime performance improvements and provide a short
      reviewed summary.
    </Message>
  </Agent>,
)

console.log(result.content)
console.log('Usage:', result.usage)
