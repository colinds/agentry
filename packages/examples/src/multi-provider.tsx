/**
 * Multi-provider agent: a parent on one provider delegating to a subagent on
 * another. Before the pi swap this needed two SDK clients wired through
 * `providers`; now provider and model are just strings pi resolves.
 *
 * Set ANTHROPIC_API_KEY (and optionally GROQ_API_KEY) and run:
 *   bun run example:multi-provider
 */
import { run, Type, Agent, AgentTool, System, Tools, Message } from 'agentry'
import { MODEL } from './constants'

// Swap this for any provider pi ships with — groq, google, openai, xai,
// deepseek, openrouter, or an OpenAI-compatible endpoint.
const SUBAGENT_PROVIDER = process.env.SUBAGENT_PROVIDER ?? 'anthropic'
const SUBAGENT_MODEL = process.env.SUBAGENT_MODEL ?? MODEL

const result = await run(
  <Agent provider="anthropic" model={MODEL} maxTokens={1024}>
    <System>
      You coordinate specialists. Use the summarizer tool for any summary work.
    </System>
    <Tools>
      <AgentTool
        name="summarizer"
        description="Summarize a passage of text in one sentence."
        parameters={Type.Object({
          text: Type.String({ description: 'the text to summarize' }),
        })}
        agent={(input) => (
          <Agent provider={SUBAGENT_PROVIDER} model={SUBAGENT_MODEL}>
            <System>You summarize text in exactly one sentence.</System>
            <Message role="user">{input.text}</Message>
          </Agent>
        )}
      />
    </Tools>
    <Message role="user">
      Summarize this: React is a library for building user interfaces from
      components. Components let you split the UI into independent, reusable
      pieces and think about each piece in isolation.
    </Message>
  </Agent>,
)

console.log('Result:', result.content)
console.log('Usage:', result.usage)
console.log('Cost (USD):', result.usage.costUSD)
