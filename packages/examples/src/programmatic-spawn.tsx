import { run, Agent, System, Tools, Tool, Message, useMessages } from 'agentry'
import { MODEL } from '@agentry/shared'
import { z } from 'zod'
import type React from 'react'

/**
 * Example: Programmatic Agent Spawning
 *
 * Demonstrates how to use context.runAgent() to programmatically
 * create and execute agents on-demand from within tool handlers.
 *
 * Key features:
 * - Conditional agent spawning based on runtime data
 * - Parallel spawning for concurrent execution
 * - Result aggregation from multiple spawned agents
 * - Custom configuration per spawned agent
 */

// Reusable agent components
function PythonExpertAgent({ code }: { code: string }): React.ReactElement {
  const messages = useMessages()
  console.log('PythonExpertAgent messages:', messages.length)

  return (
    <Agent name="python-expert" temperature={0.2}>
      <System>
        You are a Python expert. Analyze code for best practices, performance,
        and Pythonic patterns.
      </System>
      <Message role="user">
        Analyze this Python code:
        {'\n\n'}
        {code}
      </Message>
    </Agent>
  )
}

function TypeScriptExpertAgent({ code }: { code: string }): React.ReactElement {
  const messages = useMessages()
  console.log('TypeScriptExpertAgent messages:', messages.length)

  return (
    <Agent name="typescript-expert" temperature={0.2}>
      <System>
        You are a TypeScript expert. Analyze code for type safety, best
        practices, and modern patterns.
      </System>
      <Message role="user">
        Analyze this TypeScript code:
        {'\n\n'}
        {code}
      </Message>
    </Agent>
  )
}

function RustExpertAgent({ code }: { code: string }): React.ReactElement {
  const messages = useMessages()
  console.log('RustExpertAgent messages:', messages.length)

  return (
    <Agent name="rust-expert" temperature={0.2}>
      <System>
        You are a Rust expert. Analyze code for memory safety, ownership
        patterns, and idiomatic Rust.
      </System>
      <Message role="user">
        Analyze this Rust code:
        {'\n\n'}
        {code}
      </Message>
    </Agent>
  )
}

function TechnicalAnalystAgent({
  content,
}: {
  content: string
}): React.ReactElement {
  const messages = useMessages()
  console.log('TechnicalAnalystAgent messages:', messages.length)

  return (
    <Agent name="tech-analyst" temperature={0.3}>
      <System>
        You are a technical analyst. Focus on implementation, architecture, and
        technical feasibility.
      </System>
      <Message role="user">Technical analysis of: {content}</Message>
    </Agent>
  )
}

function BusinessAnalystAgent({
  content,
}: {
  content: string
}): React.ReactElement {
  const messages = useMessages()
  console.log('BusinessAnalystAgent messages:', messages.length)

  return (
    <Agent name="biz-analyst" temperature={0.5}>
      <System>
        You are a business analyst. Focus on market fit, ROI, and business
        value.
      </System>
      <Message role="user">Business analysis of: {content}</Message>
    </Agent>
  )
}

function CreativeAnalystAgent({
  content,
}: {
  content: string
}): React.ReactElement {
  const messages = useMessages()
  console.log('CreativeAnalystAgent messages:', messages.length)

  return (
    <Agent name="creative-analyst" temperature={0.9}>
      <System>
        You are a creative analyst. Focus on innovation, user experience, and
        novel approaches.
      </System>
      <Message role="user">Creative analysis of: {content}</Message>
    </Agent>
  )
}

function SecurityAnalystAgent({
  content,
}: {
  content: string
}): React.ReactElement {
  const messages = useMessages()
  console.log('SecurityAnalystAgent messages:', messages.length)
  return (
    <Agent name="security-analyst" temperature={0.2}>
      <System>
        You are a security analyst. Focus on vulnerabilities, threats, and
        security best practices.
      </System>
      <Message role="user">Security analysis of: {content}</Message>
    </Agent>
  )
}

function ResearcherAgent({
  topic,
  depth,
}: {
  topic: string
  depth: string
}): React.ReactElement {
  const messages = useMessages()
  console.log('ResearcherAgent messages:', messages.length)

  return (
    <Agent name="researcher">
      <System>
        You are a researcher. Provide {depth} analysis with appropriate detail
        level.
      </System>
      <Message role="user">Research topic: {topic}</Message>
    </Agent>
  )
}

function SummarizerAgent({
  research,
}: {
  research: string
}): React.ReactElement {
  const messages = useMessages()
  console.log('SummarizerAgent messages:', messages.length)

  return (
    <Agent name="summarizer" temperature={0.3}>
      <System>
        You are a concise summarizer. Create clear, actionable summaries.
      </System>
      <Message role="user">
        Summarize this research in 3-5 key points:
        {'\n\n'}
        {research}
      </Message>
    </Agent>
  )
}

console.log('🚀 Programmatic Agent Spawning Example\n')

const result = await run(
  <Agent model={MODEL} maxTokens={8192}>
    <System>
      You are a content analyzer that can spawn specialized agents based on the
      type of analysis requested. You have access to tools that spawn different
      expert agents on-demand.
    </System>

    <Tools>
      {/* Example 1: Conditional Spawning */}
      <Tool
        name="analyze_code"
        description="Analyze code by spawning the appropriate specialist agent based on programming language"
        parameters={z.object({
          code: z.string().describe('The code to analyze'),
          language: z
            .enum(['python', 'typescript', 'rust'])
            .describe('Programming language'),
        })}
        handler={async (input, context) => {
          console.log(`\n📝 Spawning ${input.language} specialist agent...`)

          // Spawn different agents based on language using components
          const AgentComponent =
            input.language === 'python'
              ? PythonExpertAgent
              : input.language === 'typescript'
                ? TypeScriptExpertAgent
                : RustExpertAgent

          const result = await context.runAgent(
            <AgentComponent code={input.code} />,
          )

          console.log(
            `✅ ${input.language} analysis complete (${result.usage.inputTokens + result.usage.outputTokens} tokens)`,
          )

          return `Language: ${input.language}\nTokens Used: ${result.usage.inputTokens + result.usage.outputTokens}\n\nAnalysis:\n${result.content}`
        }}
      />

      {/* Example 2: Parallel Spawning */}
      <Tool
        name="multi_perspective_analysis"
        description="Analyze content from multiple perspectives in parallel by spawning multiple expert agents concurrently"
        parameters={z.object({
          content: z.string().describe('Content to analyze'),
          perspectives: z
            .array(z.enum(['technical', 'business', 'creative', 'security']))
            .describe('Which perspectives to analyze from'),
        })}
        handler={async (input, context) => {
          console.log(
            `\n🔄 Spawning ${input.perspectives.length} agents in parallel...`,
          )

          const startTime = Date.now()

          // Spawn multiple agents in parallel using components
          const results = await Promise.all(
            input.perspectives.map(async (perspective) => {
              const AgentComponent =
                perspective === 'technical'
                  ? TechnicalAnalystAgent
                  : perspective === 'business'
                    ? BusinessAnalystAgent
                    : perspective === 'creative'
                      ? CreativeAnalystAgent
                      : SecurityAnalystAgent

              const result = await context.runAgent(
                <AgentComponent content={input.content} />,
              )

              return {
                perspective,
                analysis: result.content,
                tokens: result.usage.inputTokens + result.usage.outputTokens,
              }
            }),
          )

          const duration = Date.now() - startTime
          const totalTokens = results.reduce((sum, r) => sum + r.tokens, 0)

          console.log(
            `✅ All ${input.perspectives.length} analyses complete in ${duration}ms (${totalTokens} total tokens)`,
          )

          const summary = results
            .map(
              (r) =>
                `**${r.perspective.toUpperCase()} ANALYSIS** (${r.tokens} tokens):\n${r.analysis}\n`,
            )
            .join('\n')

          return `${summary}\nTotal Tokens: ${totalTokens}\nDuration: ${duration}ms`
        }}
      />

      {/* Example 3: Dynamic Configuration */}
      <Tool
        name="research_with_depth"
        description="Conduct research with configurable depth level by spawning agents with different token limits"
        parameters={z.object({
          topic: z.string().describe('Research topic'),
          depth: z
            .enum(['shallow', 'medium', 'deep'])
            .describe('Research depth'),
        })}
        handler={async (input, context) => {
          console.log(
            `\n🔍 Starting ${input.depth} research on: ${input.topic}`,
          )

          // Configure agent based on depth
          const config =
            input.depth === 'shallow'
              ? { maxTokens: 512, temperature: 0.3 }
              : input.depth === 'medium'
                ? { maxTokens: 2048, temperature: 0.5 }
                : { maxTokens: 4096, temperature: 0.7 }

          const result = await context.runAgent(
            <ResearcherAgent topic={input.topic} depth={input.depth} />,
            config,
          )

          console.log(
            `✅ Research complete (${result.usage.inputTokens + result.usage.outputTokens} tokens)`,
          )

          return `Research Depth: ${input.depth}\nTokens Used: ${result.usage.inputTokens + result.usage.outputTokens}\n\nFindings:\n${result.content}`
        }}
      />

      {/* Example 4: Chain Spawning */}
      <Tool
        name="research_and_summarize"
        description="First spawn a research agent, then spawn a summarizer agent with the research results"
        parameters={z.object({
          topic: z.string().describe('Topic to research and summarize'),
        })}
        handler={async (input, context) => {
          console.log(`\n📚 Step 1: Researching ${input.topic}...`)

          // First spawn: Research agent
          const researchResult = await context.runAgent(
            <ResearcherAgent topic={input.topic} depth="detailed" />,
            { temperature: 0.5 },
          )

          console.log(
            `✅ Research complete (${researchResult.usage.inputTokens + researchResult.usage.outputTokens} tokens)`,
          )
          console.log(`\n📝 Step 2: Summarizing research...`)

          // Second spawn: Summarizer agent
          const summaryResult = await context.runAgent(
            <SummarizerAgent research={researchResult.content} />,
          )

          console.log(
            `✅ Summary complete (${summaryResult.usage.inputTokens + summaryResult.usage.outputTokens} tokens)`,
          )

          const totalTokens =
            researchResult.usage.inputTokens +
            researchResult.usage.outputTokens +
            summaryResult.usage.inputTokens +
            summaryResult.usage.outputTokens

          return `**RESEARCH SUMMARY** (${totalTokens} total tokens)\n\n**Key Points:**\n${summaryResult.content}\n\n**Full Research:**\n${researchResult.content}`
        }}
      />
    </Tools>

    <Message role="user">
      I need to analyze a new feature idea: "Real-time collaborative code
      editing with AI assistance". Can you analyze it from technical, business,
      and security perspectives in parallel?
    </Message>
  </Agent>,
)

console.log('\n' + '='.repeat(60))
console.log('📊 Final Result')
console.log('='.repeat(60))
console.log('\nAgent Response:')
console.log(result.content)
console.log('\n' + '='.repeat(60))
console.log('📈 Statistics')
console.log('='.repeat(60))
console.log(`Total messages: ${result.messages.length}`)
console.log(
  `Total tokens: ${result.usage.inputTokens + result.usage.outputTokens}`,
)
console.log(`Input tokens: ${result.usage.inputTokens}`)
console.log(`Output tokens: ${result.usage.outputTokens}`)
console.log(`Stop reason: ${result.stopReason}`)
console.log('='.repeat(60) + '\n')
