/**
 * Create Ephemeral Subagent Example
 *
 * Demonstrates:
 * - Spawning any type of subagent dynamically
 * - Subagent removing itself when it completes using onComplete
 * - Proving the LLM loses access after the subagent unmounts
 */

import { useState } from 'react'
import { z } from 'zod'
import { render, Agent, System, Message, Tools, Tool } from 'agentry'
import { MODEL } from '@agentry/shared'

interface Subagent {
  id: string
  name: string
  description: string
  systemPrompt: string
  temperature?: number
}

/**
 * EphemeralSubagent - A subagent that removes itself when it completes
 *
 * When the subagent completes, it removes itself from the parent's state.
 * The reconciler automatically detects the component removal and queues a
 * tool removal in pendingUpdates. The execution engine processes these
 * updates after tool execution, ensuring the tool is removed before the
 * next step's tool list is evaluated.
 */
function EphemeralSubagent({
  config,
  onRemove,
}: {
  config: Subagent
  onRemove: () => void
}) {
  return (
    <Agent
      name={config.name}
      description={config.description}
      temperature={config.temperature}
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
      onComplete={() => {
        console.log(
          `\n✅ Subagent "${config.name}" completed - removing itself`,
        )
        onRemove()
      }}
    >
      <System>{config.systemPrompt}</System>
    </Agent>
  )
}

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
      description="Create a new temporary subagent that will automatically remove itself when done. Requires: name (lowercase with underscores), description (what it does), systemPrompt (full instructions)."
      inputSchema={z.object({
        name: z
          .string()
          .describe(
            'Subagent name in lowercase with underscores, e.g. "calculator" (required)',
          ),
        description: z
          .string()
          .describe('Brief description of what the subagent does (required)'),
        systemPrompt: z
          .string()
          .describe(
            "Complete system prompt/instructions that define the subagent's behavior (required)",
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
          return `Error: invalid name format (must be lowercase with underscores)`
        }

        console.log(`🚀 [create_subagent] Spawning: ${name} - ${description}`)
        onCreate({ name, description, systemPrompt, temperature })
        return `Created ${name}. Use ${name}(task) to call it. It will automatically remove itself when done.`
      }}
    />
  )
}

function MainAgent() {
  const [subagents, setSubagents] = useState<Subagent[]>([])

  return (
    <Agent
      model={MODEL}
      maxTokens={2048}
      temperature={0.7}
      onStepFinish={(result) => {
        console.log(`\n📝 [Main Agent] Step ${result.stepNumber} finished`)
        console.log(`   Finish reason: ${result.finishReason}`)
        console.log(
          `   Tool calls: ${result.toolCalls.map((tc) => tc.name).join(', ') || 'none'}`,
        )
        console.log(`   Tool results: ${result.toolResults.length}`)
        console.log(`   Tokens: ${result.usage.totalTokens}`)
        console.log(`   Active subagents: ${subagents.length}`)
      }}
    >
      <System>
        You can spawn temporary subagents that will automatically remove
        themselves when they complete their task. IMPORTANT: Once a subagent
        completes its task, it automatically removes itself and is NO LONGER
        AVAILABLE. If you try to call it again, the tool will not exist.
        WORKFLOW: 1. Use create_subagent to create a subagent with a name,
        description, and system prompt 2. The subagent will appear as a tool you
        can call 3. Call the subagent tool with a task 4. The subagent will
        automatically remove itself after completing its task 5. After removal,
        the tool will no longer be available CURRENT SUBAGENTS:{' '}
        {subagents.length > 0
          ? subagents.map((s) => s.name).join(', ')
          : 'none (use create_subagent to create one)'}
      </System>

      <Tools>
        <CreateSubagentTool
          subagents={subagents}
          onCreate={(subagent) => {
            setSubagents((prev) => [
              ...prev,
              { ...subagent, id: `${subagent.name}_${Date.now()}` },
            ])
          }}
        />

        {subagents.map((subagent) => (
          <EphemeralSubagent
            key={subagent.id}
            config={subagent}
            onRemove={() => {
              console.log(`🗑️  Subagent "${subagent.name}" removing itself`)
              setSubagents((prev) => prev.filter((s) => s.id !== subagent.id))
            }}
          />
        ))}
      </Tools>

      <Message role="user">
        Please do the following to demonstrate ephemeral subagents: 1. Create a
        calculator subagent using create_subagent 2. Use the calculator tool to
        calculate: (15 * 23) + (42 / 7) - 8 3. After the calculator completes,
        try to call the calculator tool AGAIN with a different calculation: 100
        / 4 The second call should fail because the calculator subagent will
        have automatically removed itself after the first task. This proves that
        once a subagent unmounts, you no longer have access to it.
      </Message>
    </Agent>
  )
}

console.log('🚀 Create Ephemeral Subagent Example\n')

try {
  const result = await render(<MainAgent />)
  console.log('\n✅ Result:\n', result.content)
  console.log('\n📊 Usage:', result.usage)
} catch (error) {
  console.error('❌ Error:', error)
  process.exit(1)
}
