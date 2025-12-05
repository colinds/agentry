import { useState } from 'react'
import { z } from 'zod'
import {
  run,
  Agent,
  System,
  Tools,
  Tool,
  Context,
  WebSearch,
  useMessages,
  Message,
  AgentTool,
} from 'agentry'
import { MODEL } from '@agentry/shared'

function CompanyResearcherAgent({
  company,
  context,
}: {
  company: string
  context: string
}) {
  return (
    <Agent name="company_researcher">
      <System>
        You are an expert researcher with a specialization in startups.
      </System>
      <Tools>
        <WebSearch maxUses={3} />
      </Tools>
      <Message role="user">
        Research the company: {company}
        Context: {context}
      </Message>
    </Agent>
  )
}

function CompanyResearcher({
  company,
  context,
}: {
  company: string
  context: string
}) {
  return (
    <AgentTool
      name="company_researcher"
      description="AI startup researcher that can search the web"
      parameters={z.object({
        task: z.string().describe('What to research about the company'),
      })}
      agent={(input) => (
        <CompanyResearcherAgent
          company={company}
          context={`${context}\n\nTask: ${input.task}`}
        />
      )}
    />
  )
}

function Coordinator() {
  const [params, setParams] = useState<{
    company: string
    context: string
  } | null>(null)
  const messages = useMessages()
  console.log(`There are ${messages.length} messages.`)

  return (
    <Agent model={MODEL}>
      <System>
        You help with lightweight startup research. You can spawn subagents to
        help with your research.
      </System>
      {params && (
        <Context>
          You have access to a researcher agent for {params.company}.
        </Context>
      )}

      <Tools>
        <Tool
          name="spawn_company_researcher"
          description="Spawn a company researcher for a specific company"
          strict
          parameters={z.object({
            company: z.string().describe('Startup to research'),
            context: z.string().describe('Context for the research'),
          })}
          handler={async ({ company, context }) => {
            setParams({ company, context })
            return `Agent created.`
          }}
        />
        {params && (
          <CompanyResearcher
            company={params.company}
            context={params.context}
          />
        )}
      </Tools>
    </Agent>
  )
}

const agent = await run(<Coordinator />, { mode: 'interactive' })
const result = await agent.sendMessage('Tell me more about Cursor.')
console.log('Result:', result.content)
