/**
 * WebSearch Example - Real-world web search patterns
 *
 * Demonstrates:
 * - WebSearch built-in tool with different configurations
 * - Using search results to inform subsequent actions
 * - Component composition for organizing search capabilities
 * - useExecutionState() for tracking search progress
 * - useMessages() for analyzing search history
 * - Multi-step workflows using web search results
 */

import { useState, useEffect } from 'react'
import { z } from 'zod'
import {
  createAI,
  Agent,
  System,
  Message,
  Tools,
  Tool,
  useExecutionState,
  useMessages,
} from 'agentry'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { WebSearch as AnthropicWebSearch } from 'agentry/anthropic'
import { WebSearch as OpenAIWebSearch } from 'agentry/openai'
import { MODEL, OPENAI_MODEL } from './constants'

const EXAMPLE_PROVIDER =
  process.env.EXAMPLE_PROVIDER === 'openai' ? 'openai' : 'anthropic'
const WebSearch =
  EXAMPLE_PROVIDER === 'openai' ? OpenAIWebSearch : AnthropicWebSearch
const EXAMPLE_MODEL = EXAMPLE_PROVIDER === 'openai' ? OPENAI_MODEL : MODEL
const ai =
  EXAMPLE_PROVIDER === 'openai'
    ? createAI({ providers: { openai: { client: new OpenAI() } } })
    : createAI({
        providers: { anthropic: { client: new Anthropic() } },
      })

/**
 * AnalysisTools - Tools for analyzing and summarizing web search results
 */
function AnalysisTools() {
  return (
    <Tools>
      <Tool
        name="summarize_findings"
        description="Summarize key findings from web search results into a structured format"
        strict
        parameters={z.object({
          topic: z.string().describe('The research topic'),
          key_points: z
            .array(z.string())
            .describe('Array of key findings from searches'),
          confidence: z
            .enum(['high', 'medium', 'low'])
            .describe('Confidence level in the findings'),
        })}
        handler={async ({ topic, key_points, confidence }) => {
          console.log(`📊 [Analysis] Summarizing findings for: ${topic}`)
          console.log(`   Confidence: ${confidence}`)
          console.log(`   Key points: ${key_points.length}`)

          return JSON.stringify({
            topic,
            summary: key_points,
            confidence,
            timestamp: new Date().toISOString(),
            recommendation:
              confidence === 'high'
                ? 'Findings are well-supported by multiple sources'
                : 'Consider additional research for verification',
          })
        }}
      />
    </Tools>
  )
}

/**
 * TechnicalWebSearch - Domain-restricted search for technical documentation
 */
function TechnicalWebSearch({ maxSearches = 3 }: { maxSearches?: number }) {
  useEffect(() => {
    console.log(`🔧 [TechnicalWebSearch] Mounted (max ${maxSearches} searches)`)
    return () => console.log('🔧 [TechnicalWebSearch] Unmounted')
  }, [maxSearches])

  return (
    <WebSearch
      maxUses={maxSearches}
      allowedDomains={[
        'github.com',
        'npmjs.com',
        'typescriptlang.org',
        'react.dev',
        'nodejs.org',
      ]}
    />
  )
}

/**
 * ExecutionMonitor - Logs execution state and search activity
 */
function ExecutionMonitor() {
  const state = useExecutionState()

  useEffect(() => {
    console.log(`⚡ [State] ${state.status}`)
  }, [state.status])

  return null
}

/**
 * SearchActivityTracker - Tracks search activity in messages
 */
function SearchActivityTracker() {
  const messages = useMessages()

  useEffect(() => {
    const searchCalls = messages.filter((msg) => {
      if (msg.role !== 'assistant') return false
      if (typeof msg.content === 'string') return false

      return msg.content.some(
        (block) =>
          block.type === 'tool_use' &&
          'name' in block &&
          block.name === 'web_search',
      )
    })

    if (searchCalls.length > 0) {
      console.log(`🔎 [Activity] Web searches performed: ${searchCalls.length}`)
    }
  }, [messages])

  return null
}

/**
 * Technical Research Assistant
 * Demonstrates using web search results for multi-step analysis
 */
function TechnicalResearcher() {
  const [enableAnalysis] = useState(true)

  return (
    <Agent provider={EXAMPLE_PROVIDER} model={EXAMPLE_MODEL} maxTokens={4096}>
      <System>
        You are a technical documentation researcher specializing in
        JavaScript/TypeScript ecosystems. AVAILABLE SOURCES (domain-restricted):
        - github.com, npmjs.com, typescriptlang.org, react.dev, nodejs.org
        WORKFLOW: 1. Use web_search to find information from technical
        documentation 2. Extract specific facts and code examples 3. Use
        summarize_findings to create a structured summary 4. Provide links to
        the most relevant sources Focus on official documentation and
        well-established community resources.
      </System>

      <ExecutionMonitor />
      <SearchActivityTracker />

      <TechnicalWebSearch maxSearches={3} />
      {enableAnalysis && <AnalysisTools />}

      <Message role="user">
        Research how to use React Server Components with TypeScript. Please: 1.
        Search for official documentation and examples 2. Find key
        implementation details 3. Summarize your findings with confidence level
        Keep it concise and include relevant links.
      </Message>
    </Agent>
  )
}

console.log('🚀 WebSearch Example - Technical Research Assistant\n')
console.log('Demonstrating:')
console.log('  • WebSearch with domain restrictions (technical docs only)')
console.log('  • Multi-step research and analysis pipeline')
console.log('  • Component composition for search capabilities')
console.log('  • useExecutionState() and useMessages() hooks')
console.log('  • Using search results to inform subsequent actions\n')
console.log('═'.repeat(60) + '\n')

try {
  const result = await ai.run(<TechnicalResearcher />)

  console.log('\n' + '═'.repeat(60))
  console.log('✅ Research Complete:\n')
  console.log(result.content)
  console.log('\n📊 Token Usage:', result.usage)
} catch (error) {
  console.error('❌ Error:', error)
  process.exit(1)
}

console.log('\n✨ Example completed!')
