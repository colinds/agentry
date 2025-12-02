/**
 * Hooks Example - React patterns for agent composition
 *
 * Demonstrates:
 * - JSX <Tool> with inline props for declarative tool registration
 * - Subagents as specialist tools (Agent inside Tools)
 * - useExecutionState() for tracking agent state
 * - useMessages() for accessing conversation history
 * - Component composition patterns for organizing agent logic
 */

import { useState, useEffect } from 'react'
import { z } from 'zod'
import {
  render,
  Agent,
  System,
  Message,
  Tools,
  Tool,
  useExecutionState,
  useMessages,
} from 'agentry'
import { MODEL } from '@agentry/shared'

/**
 * ResearchTools - Core research capabilities
 */
function ResearchTools({
  onCapabilityDiscovered,
}: {
  onCapabilityDiscovered: (capability: 'WEATHER' | 'NEWS' | 'ANALYST') => void
}) {
  return (
    <Tools>
      <Tool
        name="research_topic"
        description="Research a topic area to discover what capabilities it unlocks"
        inputSchema={z.object({
          topic: z
            .enum(['weather', 'news', 'analytics'])
            .describe('The topic area to research'),
        })}
        handler={async ({ topic }) => {
          console.log(`🔍 [Research] Investigating: ${topic}`)

          const discoveries: Record<string, 'WEATHER' | 'NEWS' | 'ANALYST'> = {
            weather: 'WEATHER',
            news: 'NEWS',
            analytics: 'ANALYST',
          }

          const capability = discoveries[topic]
          return JSON.stringify({
            topic,
            discovery: capability,
            hint: `Found ${capability} capability! Use unlock_capability to enable it.`,
          })
        }}
      />
      <Tool
        name="unlock_capability"
        description="Unlock a discovered capability to gain access to new tools"
        inputSchema={z.object({
          capability: z
            .enum(['WEATHER', 'NEWS', 'ANALYST'])
            .describe('The capability to unlock'),
        })}
        handler={async ({ capability }) => {
          console.log(`🔓 [Unlock] ${capability} capability enabled!`)
          onCapabilityDiscovered(capability)

          const descriptions: Record<string, string> = {
            WEATHER: 'get_weather tool - Check weather for any location',
            NEWS: 'get_news tool - Fetch headlines by category',
            ANALYST: 'data_analyst subagent - Delegate complex analysis tasks',
          }

          return `SUCCESS: ${capability} unlocked! You now have access to: ${descriptions[capability]}`
        }}
      />
    </Tools>
  )
}

/**
 * WeatherTools - Weather capability (conditionally rendered)
 */
function WeatherTools() {
  useEffect(() => {
    console.log('🌤️  [WeatherTools] Mounted')
    return () => console.log('🌤️  [WeatherTools] Unmounted')
  }, [])

  return (
    <Tools>
      <Tool
        name="get_weather"
        description="Get current weather for a location"
        inputSchema={z.object({
          location: z.string().describe('The location to check'),
        })}
        handler={async ({ location }) => {
          const temp = Math.floor(Math.random() * 30) + 50
          const conditions = ['sunny', 'cloudy', 'rainy', 'partly cloudy'][
            Math.floor(Math.random() * 4)
          ]
          console.log(`🌡️  [Weather] ${location}: ${temp}°F, ${conditions}`)
          return JSON.stringify({
            location,
            temperature: `${temp}°F`,
            conditions,
          })
        }}
      />
    </Tools>
  )
}

/**
 * NewsTools - News capability (conditionally rendered)
 */
function NewsTools() {
  useEffect(() => {
    console.log('📰 [NewsTools] Mounted')
    return () => console.log('📰 [NewsTools] Unmounted')
  }, [])

  return (
    <Tools>
      <Tool
        name="get_news"
        description="Get latest news headlines by category"
        inputSchema={z.object({
          category: z
            .enum(['tech', 'science', 'business'])
            .describe('News category'),
        })}
        handler={async ({ category }) => {
          const headlines: Record<string, string[]> = {
            tech: [
              'AI Makes Breakthrough',
              'New Framework Released',
              'Cloud Computing Trends',
            ],
            science: [
              'Mars Mission Update',
              'Climate Research Findings',
              'Quantum Computing Advance',
            ],
            business: [
              'Markets Rally',
              'Startup Funding Surges',
              'Global Trade Expands',
            ],
          }
          console.log(
            `📰 [News] ${category}: fetched ${headlines[category]?.length || 0} headlines`,
          )
          return JSON.stringify({
            category,
            headlines: headlines[category] || [],
          })
        }}
      />
    </Tools>
  )
}

/**
 * AnalystSubagent - A specialist subagent for data analysis (conditionally rendered)
 *
 * Demonstrates: Agent as a tool (subagent pattern)
 */
function AnalystSubagent() {
  useEffect(() => {
    console.log('📊 [AnalystSubagent] Mounted')
    return () => console.log('📊 [AnalystSubagent] Unmounted')
  }, [])

  return (
    <Tools>
      <Agent
        name="data_analyst"
        description="A specialist subagent that analyzes data and provides insights. Delegate complex analysis tasks to this expert."
        temperature={0.3}
      >
        <System>
          You are a data analysis expert. When given data or topics to analyze:
          1. Break down the key components 2. Identify patterns and trends 3.
          Provide actionable insights 4. Be concise but thorough Always
          structure your analysis clearly with bullet points or numbered lists.
        </System>
      </Agent>
    </Tools>
  )
}

/**
 * ExecutionMonitor - Logs execution state changes
 */
function ExecutionMonitor() {
  const state = useExecutionState()

  useEffect(() => {
    console.log(`⚡ [State] ${state.status}`)
  }, [state.status])

  return null
}

/**
 * MessageTracker - Tracks conversation messages
 */
function MessageTracker() {
  const messages = useMessages()

  useEffect(() => {
    if (messages.length > 0) {
      console.log(`💬 [Messages] Count: ${messages.length}`)
    }
  }, [messages.length])

  return null
}

function ResearchAssistant() {
  const [hasWeather, setHasWeather] = useState(false)
  const [hasNews, setHasNews] = useState(false)
  const [hasAnalyst, setHasAnalyst] = useState(false)

  const handleCapabilityDiscovered = (
    capability: 'WEATHER' | 'NEWS' | 'ANALYST',
  ) => {
    if (capability === 'WEATHER') setHasWeather(true)
    if (capability === 'NEWS') setHasNews(true)
    if (capability === 'ANALYST') setHasAnalyst(true)
  }

  return (
    <Agent model={MODEL} maxTokens={4096}>
      <System>
        You are a research assistant that discovers and unlocks capabilities.
        WORKFLOW: 1. Use research_topic to discover capabilities (weather, news,
        analytics) 2. Use unlock_capability to enable discovered capabilities 3.
        Use the newly unlocked tools CURRENT STATUS: - research_topic: ✅ Always
        available - unlock_capability: ✅ Always available - get_weather:{' '}
        {hasWeather ? '✅ Unlocked' : '🔒 Research "weather" to discover'}-
        get_news: {hasNews ? '✅ Unlocked' : '🔒 Research "news" to discover'}-
        data_analyst:{' '}
        {hasAnalyst
          ? '✅ Unlocked (subagent)'
          : '🔒 Research "analytics" to discover'}
      </System>

      {/* State monitoring via hooks */}
      <ExecutionMonitor />
      <MessageTracker />

      {/* Research tools - always available */}
      <ResearchTools onCapabilityDiscovered={handleCapabilityDiscovered} />

      {/* Conditionally rendered tool components */}
      {hasWeather && <WeatherTools />}
      {hasNews && <NewsTools />}
      {hasAnalyst && <AnalystSubagent />}

      <Message role="user">
        Please help me: 1. Research weather and unlock that capability 2.
        Research analytics and unlock the analyst 3. Get the weather in San
        Francisco 4. Ask the data analyst to analyze trends in AI adoption
      </Message>
    </Agent>
  )
}

console.log('🚀 Hooks Example - Research Assistant with Dynamic Capabilities\n')
console.log('Demonstrating React patterns for agent composition:')
console.log('  • JSX <Tool> - Declarative tool registration with inline props')
console.log('  • Subagents - Agent-as-tool for specialist delegation')
console.log('  • useExecutionState() - Track agent state')
console.log('  • useMessages() - Access conversation history')
console.log('  • Component composition - Organize agent logic\n')
console.log('═'.repeat(60) + '\n')

try {
  const result = await render(<ResearchAssistant />)

  console.log('\n' + '═'.repeat(60))
  console.log('✅ Final Result:\n')
  console.log(result.content)
  console.log('\n📊 Token Usage:', result.usage)
} catch (error) {
  console.error('❌ Error:', error)
  process.exit(1)
}
