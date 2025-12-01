import { useState } from 'react'
import { z } from 'zod'
import {
  render,
  Agent,
  System,
  Tools,
  Tool,
  Message,
  useMessages,
  CodeExecution,
} from '@agentry/runtime'
import { MODEL } from '@agentry/shared'

function CoderAgent() {
  return (
    <Agent name="coder" description="Coding specialist" temperature={0.3}>
      <System priority={1000}>
        You are a coding expert. Use code_execution to write and run code.
      </System>
      <Tools>
        <CodeExecution />
      </Tools>
    </Agent>
  )
}

function ProjectManager() {
  const [hasCoder, setHasCoder] = useState(false)

  const messages = useMessages()
  console.log('Latest message: ', messages.at(-1))

  return (
    <Agent model={MODEL}>
      <System priority={1000}>
        You are a project manager coordinating development tasks.
      </System>
      <System priority={500}>
        Use create_coder with a task description and optional language to spawn
        a coder subagent, then delegate coding tasks to it.
      </System>

      <Tools>
        <Tool
          name="create_coder"
          description="Spawn a coder subagent for code tasks"
          inputSchema={z.object({
            language: z
              .string()
              .describe(
                'Preferred programming language (e.g., python, javascript)',
              ),
            task: z.string().describe('Brief description of the coding task'),
          })}
          handler={async ({ language, task }) => {
            setHasCoder(true)
            return `Coder subagent created for ${task}${language ? ` (${language})` : ''}. Use coder(task="...") to delegate.`
          }}
        />
        {hasCoder && <CoderAgent />}
      </Tools>

      <Message role="user">
        Analyze the current directory structure and create a Python script that
        lists all .tsx files, then run it to show the results.
      </Message>
    </Agent>
  )
}

const result = await render(<ProjectManager />)
console.log('Result:', result.content)
