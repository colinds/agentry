import { z } from 'zod'
import { run, Agent, AgentTool, Message, System, Tools } from 'agentry'
import { openai } from 'agentry/openai'

const ORCHESTRATOR_MODEL = 'gpt-5.2'
const CODEX_MODEL = 'gpt-5.2-codex'

const result = await run(
  <Agent provider="openai" model={ORCHESTRATOR_MODEL} maxTokens={4096}>
    <System>
      You are a senior engineering lead. When you need code written or reviewed,
      delegate to the codex subagent. Synthesize its output into a final answer.
    </System>

    <Tools>
      <AgentTool
        name="codex"
        description="A code generation specialist. Use for writing, reviewing, or refactoring code."
        parameters={z.object({
          task: z.string().describe('What the codex agent should do'),
          language: z
            .string()
            .optional()
            .describe('Programming language, if relevant'),
        })}
        agent={({ task, language }) => (
          <Agent
            provider="openai"
            model={CODEX_MODEL}
            name="codex"
            maxTokens={8192}
          >
            <System>
              You are a code generation specialist. Write clean, well-typed
              code.
              {language ? ` Use ${language}.` : ''}
            </System>
            <Message role="user">{task}</Message>
          </Agent>
        )}
      />
    </Tools>

    <Message role="user">
      Build a TypeScript function that implements a rate limiter using a sliding
      window algorithm. It should support configurable window size and max
      requests. Include unit tests.
    </Message>
  </Agent>,
  {
    clients: {
      openai: openai(),
    },
  },
)

console.log(result.content)
console.log('Usage:', result.usage)
