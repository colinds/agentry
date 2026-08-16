/**
 * Compaction Example
 *
 * Demonstrates context window compaction: when token usage exceeds
 * a threshold the framework automatically summarizes the conversation
 * history so the agent can continue working in a fresh context.
 *
 * A tool generates large text blocks to inflate the token count,
 * triggering compaction mid-run.
 *
 * Run with EXAMPLE_PROVIDER=openai to use OpenAI instead of Anthropic.
 */

import { Type } from 'agentry'
import { createAI, Agent, System, Message, Tools, Tool } from 'agentry'
import { MODEL, OPENAI_MODEL } from './constants'

const EXAMPLE_PROVIDER =
  process.env.EXAMPLE_PROVIDER === 'openai' ? 'openai' : 'anthropic'
const EXAMPLE_MODEL = EXAMPLE_PROVIDER === 'openai' ? OPENAI_MODEL : MODEL
const ai = EXAMPLE_PROVIDER === 'openai' ? createAI() : createAI()

console.log(`Provider: ${EXAMPLE_PROVIDER}\n`)

const result = await ai.run(
  <Agent
    provider={EXAMPLE_PROVIDER}
    model={EXAMPLE_MODEL}
    maxTokens={4096}
    maxIterations={6}
    compactionControl={{
      enabled: true,
      contextTokenThreshold: 2_000,
    }}
    onStepFinish={(step) => {
      console.log(
        `[step ${step.stepNumber}] tokens: ${step.usage.totalTokens} | tools: ${step.toolCalls.map((t) => t.name).join(', ') || 'none'}`,
      )
    }}
  >
    <System>
      You are a research assistant with access to an archive tool. Use the tool
      to retrieve documents about the topics the user asks about, then
      synthesize a short final answer. IMPORTANT: Call the tool exactly once per
      turn. Do NOT call multiple tools in the same turn.
    </System>

    <Tools>
      <Tool
        name="search_archive"
        description="Search the archive for a topic and return a document."
        strict
        parameters={Type.Object({
          topic: Type.String({ description: 'The topic to search for' }),
        })}
        handler={({ topic }) => {
          console.log(`  -> search_archive("${topic}")`)
          // Return a deliberately large payload so we hit the compaction threshold quickly.
          const filler =
            `This is a detailed research document about ${topic}. `.repeat(80)
          return `# ${topic}\n\n${filler}`
        }}
      />
    </Tools>

    <Message role="user">
      Search the archive for these three topics one at a time, then give me a
      one-sentence summary of each: quantum computing, renewable energy, space
      exploration.
    </Message>
  </Agent>,
)

console.log('\nFinal answer:\n')
console.log(result.content)
console.log('\nUsage:', result.usage)
