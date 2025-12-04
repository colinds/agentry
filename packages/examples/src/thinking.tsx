import { run, Agent, System, Message } from 'agentry'
import { MODEL } from '@agentry/shared'

/**
 * Extended thinking example
 *
 * Demonstrates:
 * - Enabling Claude's extended thinking via the `thinking` prop on <Agent>
 * - Accessing the summarized thinking from the final AgentResult
 *
 * For more details, see Anthropic's docs:
 * https://platform.claude.com/docs/en/build-with-claude/extended-thinking
 */

const result = await run(
  <Agent
    model={MODEL}
    maxTokens={4096}
    thinking={{
      type: 'enabled',
      budget_tokens: 2048,
    }}
  >
    <System>
      You are a careful reasoning assistant. Think step-by-step before
      answering.
    </System>
    <Message role="user">
      You are planning a small developer meetup for 15 people next week. Propose
      a concrete plan including venue, schedule, and topics. Use your extended
      thinking to reason clearly, but keep the final answer concise.
    </Message>
  </Agent>,
)

console.log('\n=== Final Answer ===\n')
console.log(result.content)

if (result.thinking) {
  console.log('\n=== Model Thinking (summarized) ===\n')
  console.log(result.thinking)
} else {
  console.log(
    '\n(no thinking block was returned — check model and thinking config)',
  )
}

console.log('\n=== Token Usage ===\n')
console.log(result.usage)
