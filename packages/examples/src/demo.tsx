import { useState } from 'react'
import { Type } from 'agentry'
import {
  createAI,
  Agent,
  System,
  Tools,
  Tool,
  Context,
  useMessages,
  Message,
  AgentTool,
} from 'agentry'
import { MODEL, OPENAI_MODEL } from './constants'

const EXAMPLE_PROVIDER =
  process.env.EXAMPLE_PROVIDER === 'openai' ? 'openai' : 'anthropic'
const EXAMPLE_MODEL = EXAMPLE_PROVIDER === 'openai' ? OPENAI_MODEL : MODEL
// createAI() carries no provider itself — the provider is chosen per <Agent>.
const ai = createAI()

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
      <Tools></Tools>
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
      parameters={Type.Object({
        task: Type.String({
          description: 'What to research about the company',
        }),
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
    <Agent provider={EXAMPLE_PROVIDER} model={EXAMPLE_MODEL}>
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
          parameters={Type.Object({
            company: Type.String({ description: 'Startup to research' }),
            context: Type.String({ description: 'Context for the research' }),
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

const agent = await ai.run(<Coordinator />, { mode: 'interactive' })
const result = await agent.sendMessage('Tell me more about Cursor.')
console.log('Result:', result.content)
