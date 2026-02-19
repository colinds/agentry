import { useState } from 'react'
import { z } from 'zod'
import {
  createAI,
  Agent,
  System,
  Tools,
  Tool,
  AgentTool,
  Message,
} from 'agentry'
import {
  anthropic,
  CodeExecution as AnthropicCodeExecution,
} from 'agentry/anthropic'
import { openai, CodeExecution as OpenAICodeExecution } from 'agentry/openai'
import { MODEL, OPENAI_MODEL } from './constants'

const EXAMPLE_PROVIDER =
  process.env.EXAMPLE_PROVIDER === 'openai' ? 'openai' : 'anthropic'
const CodeExecution =
  EXAMPLE_PROVIDER === 'openai' ? OpenAICodeExecution : AnthropicCodeExecution
const EXAMPLE_MODEL = EXAMPLE_PROVIDER === 'openai' ? OPENAI_MODEL : MODEL
const ai =
  EXAMPLE_PROVIDER === 'openai'
    ? createAI({ clients: { openai: openai() } })
    : createAI({
        clients: { anthropic: anthropic() },
      })

function Calculator() {
  const [value, setValue] = useState(0)

  return (
    <Agent provider={EXAMPLE_PROVIDER} model={EXAMPLE_MODEL}>
      <System>Value: {value}</System>
      <Tools>
        <Tool
          name="add"
          description="Add to value"
          parameters={z.object({ n: z.number() })}
          handler={async ({ n }) => {
            setValue(value + n)
            return `Value: ${value + n}`
          }}
        />
        <AgentTool
          name="advanced_math"
          description="Evaluate complex math expressions"
          parameters={z.object({ expression: z.string() })}
          agent={({ expression }) => (
            <Agent provider={EXAMPLE_PROVIDER} model={EXAMPLE_MODEL}>
              <System>
                Use the code execution sandbox to evaluate the expression with
                Python.
              </System>
              <Tools>
                <CodeExecution />
              </Tools>
              <Message role="user">Evaluate: {expression}</Message>
            </Agent>
          )}
        />
      </Tools>
    </Agent>
  )
}

const agent = await ai.run(<Calculator />, { mode: 'interactive' })

await agent.sendMessage('Add 10')
await agent.sendMessage('Add 5')
const res = await agent.sendMessage(
  'Find the Nth prime number (where N is the current value)',
)
console.log(res.content)
