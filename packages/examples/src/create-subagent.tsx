import { useState } from 'react'
import { z } from 'zod'
import { run, Agent, System, Tools, Tool, Message, AgentTool } from 'agentry'
import { MODEL } from './constants'

/**
 * Example: Dynamically Creating Subagents with AgentTool
 *
 * This example demonstrates how an agent can create new subagents at runtime
 * using AgentTool. The factory agent creates a coder subagent, which then creates
 * a tester subagent to validate the code.
 */

interface Subagent {
  id: string
  name: string
  description: string
  systemPrompt: string
  temperature?: number
}

/**
 * Tool that allows an agent to create new subagents dynamically.
 * When called, it adds a new subagent to the parent's state, which
 * then becomes available as a tool in the next step.
 */
function CreateSubagentTool({
  subagents,
  onCreate,
}: {
  subagents: Subagent[]
  onCreate: (subagent: Omit<Subagent, 'id'>) => void
}) {
  return (
    <Tool
      name="create_subagent"
      description="Create a new specialist subagent. The subagent will be available as a tool in the next step."
      strict
      parameters={z.object({
        name: z
          .string()
          .describe(
            'Subagent name in lowercase with underscores (e.g., "coder_agent")',
          ),
        description: z
          .string()
          .describe('Brief description of what the subagent does'),
        systemPrompt: z
          .string()
          .describe(
            "Complete system prompt that defines the subagent's behavior",
          ),
        temperature: z
          .number()
          .min(0)
          .max(2)
          .optional()
          .describe('Temperature 0-2, optional'),
      })}
      handler={async (input) => {
        const { name, description, systemPrompt, temperature } = input

        if (subagents.some((s) => s.name === name)) {
          return `Error: ${name} already exists`
        }
        if (!/^[a-z][a-z0-9_]*$/.test(name)) {
          return `Error: name must be lowercase with underscores (e.g., "coder_agent")`
        }

        onCreate({ name, description, systemPrompt, temperature })
        return `Created ${name}. You can now call ${name}(task="...") to use it.`
      }}
    />
  )
}

/**
 * The actual agent component for a dynamically created subagent
 */
function DynamicAgent({
  config,
  task,
  subagents,
  onCreateSubagent,
}: {
  config: Subagent
  task: string
  subagents: Subagent[]
  onCreateSubagent: (subagent: Omit<Subagent, 'id'>) => void
}) {
  return (
    <Agent
      name={config.name}
      temperature={config.temperature}
      onComplete={(result) => {
        console.log(`\n📝 [Subagent "${config.name}"] Completed`)
        console.log(`   Result: ${result.content}`)
        console.log(`   Tokens: ${result.usage.outputTokens}`)
      }}
      onStepFinish={(result) => {
        console.log(
          `\n📝 [Subagent "${config.name}"] Step ${result.stepNumber} finished`,
        )
        console.log(`   Finish reason: ${result.finishReason}`)
        console.log(
          `   Tool calls: ${result.toolCalls.map((tc) => tc.name).join(', ') || 'none'}`,
        )
        console.log(`   Tokens: ${result.usage.totalTokens}`)
      }}
    >
      <System>{config.systemPrompt}</System>
      <Tools>
        {/* Allow this subagent to create its own subagents */}
        <CreateSubagentTool subagents={subagents} onCreate={onCreateSubagent} />
        {/* Render nested subagents */}
        {subagents.map((s) => (
          <SubagentComponent key={s.id} config={s} />
        ))}
      </Tools>
      <Message role="user">{task}</Message>
    </Agent>
  )
}

/**
 * Recursive component that wraps a subagent as an AgentTool.
 * Each subagent can also create its own subagents, forming a tree structure.
 */
function SubagentComponent({ config }: { config: Subagent }) {
  const [subagents, setSubagents] = useState<Subagent[]>([])

  return (
    <AgentTool
      name={config.name}
      description={config.description}
      parameters={z.object({
        task: z.string().describe('Task for the subagent to perform'),
      })}
      agent={(input) => (
        <DynamicAgent
          config={config}
          task={input.task}
          subagents={subagents}
          onCreateSubagent={(subagent) => {
            setSubagents((prev) => [
              ...prev,
              { ...subagent, id: `${subagent.name}_${Date.now()}` },
            ])
          }}
        />
      )}
    />
  )
}

/**
 * Main factory agent that orchestrates the creation of subagents.
 * It creates a coder subagent, which then creates a tester subagent.
 */
function Factory() {
  const [subagents, setSubagents] = useState<Subagent[]>([])

  return (
    <Agent
      model={MODEL}
      maxTokens={2048}
      temperature={0.7}
      stream={true}
      onStepFinish={(result) => {
        console.log(`\n📝 [Factory] Step ${result.stepNumber} finished`)
        console.log(`   Finish reason: ${result.finishReason}`)
        console.log(
          `   Tool calls: ${result.toolCalls.map((tc) => tc.name).join(', ') || 'none'}`,
        )
        console.log(`   Tokens: ${result.usage.totalTokens}`)
      }}
    >
      <System>
        You are a factory agent that creates specialized subagents. Your task:
        1. Create a coder subagent that writes code 2. The coder will create a
        tester subagent to validate the code 3. Return both the code and test
        results When creating the coder subagent, give it a system prompt that
        instructs it to: - Write the requested function - Create a tester
        subagent using create_subagent - Call the tester subagent with the code
        - Return both the code and test results
        {subagents.length > 0 &&
          `\n\nCreated subagents: ${subagents.map((s) => s.name).join(', ')}`}
      </System>

      <Tools>
        <CreateSubagentTool
          subagents={subagents}
          onCreate={(subagent) => {
            console.log(`✨ Created subagent: ${subagent.name}`)
            setSubagents((prev) => [
              ...prev,
              { ...subagent, id: `${subagent.name}_${Date.now()}` },
            ])
          }}
        />
        {/* Render created subagents */}
        {subagents.map((s) => (
          <SubagentComponent key={s.id} config={s} />
        ))}
      </Tools>

      <Message role="user">
        Write a function that adds two numbers. The coder must: 1. Create a
        tester subagent using create_subagent 2. Call the tester subagent with
        the code 3. Return both the code and the actual test results from the
        tester
      </Message>
    </Agent>
  )
}

console.log('🚀 Starting dynamic subagent creation example...\n')
const result = await run(<Factory />)
console.log('\n✅ Final Result:')
console.log(result.content)
const totalTokens = result.usage.inputTokens + result.usage.outputTokens
console.log(
  `\nUsage: ${totalTokens} tokens (${result.usage.inputTokens} in, ${result.usage.outputTokens} out)`,
)
