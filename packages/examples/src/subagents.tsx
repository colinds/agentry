import { run, Agent, System, Tools, Message, AgentTool } from 'agentry'
import { MODEL } from '@agentry/shared'
import { z } from 'zod'

// Example showing the new AgentTool component for explicit agent nesting
// AgentTool replaces implicit nesting and provides type-safe parameter passing

function ResearcherAgent({ topic }: { topic: string }) {
  return (
    <Agent name="researcher">
      <System>You are a research expert.</System>
      <Message role="user">Research the topic: {topic}</Message>
    </Agent>
  )
}

function CoderAgent({
  task,
  language,
}: {
  task: string
  language: 'javascript' | 'typescript' | 'python'
}) {
  return (
    <Agent name="coder" temperature={0.3}>
      <System>
        You are a coding expert. Ensure the code is clean and production-ready.
      </System>
      <Message role="user">
        Write {language} code for: {task}
      </Message>
    </Agent>
  )
}

const result = await run(
  <Agent model={MODEL} name="manager" maxTokens={4096} temperature={0.7}>
    <System>
      You are a project manager who delegates tasks to specialists. You have
      access to a researcher and a coder.
    </System>

    <Tools>
      {/* Researcher agent tool with custom parameters */}
      <AgentTool
        name="researcher"
        description="Research specialist who finds information about a specific topic"
        parameters={z.object({
          topic: z.string().describe('The topic to research'),
        })}
        agent={(input) => <ResearcherAgent topic={input.topic} />}
      />

      {/* Coder agent tool with custom parameters */}
      <AgentTool
        name="coder"
        description="Code generation specialist who writes code in a specific language"
        parameters={z.object({
          task: z.string().describe('What code to write'),
          language: z
            .enum(['javascript', 'typescript', 'python'])
            .describe('Programming language to use'),
        })}
        agent={(input) => (
          <CoderAgent task={input.task} language={input.language} />
        )}
      />
    </Tools>

    <Message role="user">
      First, research what the capital of France is. Then write a simple
      JavaScript function that adds two numbers.
    </Message>
  </Agent>,
)

console.log('Manager result:', result.content)
console.log('Total usage:', result.usage)
