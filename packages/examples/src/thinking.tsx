import { run, Agent, System, Message, Tools, Tool } from 'agentry'
import { z } from 'zod'
import { MODEL } from './constants'

/**
 * Extended Thinking with Interleaved Tool Use
 *
 * This example demonstrates how interleaved thinking actually works:
 * - Thinking can happen BEFORE tools (planning)
 * - Thinking can happen WHILE tools are executing (if needed)
 * - Thinking can happen AFTER tools return results (analysis)
 *
 * With Haiku, Claude is smart enough to plan multiple steps ahead,
 * so you'll often see: think → execute all planned tools → think about results
 *
 * The key benefit: Claude can use a larger thinking budget (up to 200k tokens!)
 * and reason more deeply about complex problems.
 */

console.log('=== Extended Thinking with Interleaved Tool Use ===\n')
console.log('Demonstrating Haiku 4.5 with interleaved thinking enabled\n')

let thinkingBlockCount = 0
let toolCallCount = 0
let apiCallCount = 0

const result = await run(
  <Agent
    model={MODEL}
    maxTokens={8000}
    thinking={{
      type: 'enabled',
      budget_tokens: 4000,
      // interleaved: true by default - allows thinking during tool execution
    }}
    onStepFinish={(step) => {
      apiCallCount++
      console.log(`\n${'='.repeat(70)}`)
      console.log(`API Call #${apiCallCount} completed`)
      console.log(`${'='.repeat(70)}`)
      console.log(`Stop reason: ${step.finishReason}`)
      console.log(`Tools called in this turn: ${step.toolCalls?.length || 0}`)
      if (step.toolCalls && step.toolCalls.length > 0) {
        step.toolCalls.forEach((tc) => {
          console.log(`  - ${tc.name}`)
        })
      }
    }}
    onMessage={(event) => {
      if (event.type === 'thinking') {
        thinkingBlockCount++
        const preview = event.text.slice(0, 80).replace(/\n/g, ' ')
        console.log(`💭 ${preview}...`)
      } else if (event.type === 'tool_use_start') {
        toolCallCount++
        console.log(`🔧 Tool #${toolCallCount}: ${event.toolName}`)
      }
    }}
  >
    <System>
      You are a travel planner helping users plan trips efficiently.
    </System>
    <Tools>
      <Tool
        name="check_weather"
        description="Check weather for a destination"
        parameters={z.object({
          city: z.string(),
        })}
        handler={async ({ city }) => {
          return `Weather in ${city}: Sunny, 22°C, perfect for sightseeing!`
        }}
      />
      <Tool
        name="find_hotels"
        description="Find available hotels"
        parameters={z.object({
          city: z.string(),
          budget: z.enum(['budget', 'moderate', 'luxury']),
        })}
        handler={async ({ city, budget }) => {
          const hotels = {
            budget: 'City Hostel ($50/night)',
            moderate: 'Grand Hotel ($150/night)',
            luxury: 'Palace Resort ($400/night)',
          }
          return `Found in ${city}: ${hotels[budget]}`
        }}
      />
      <Tool
        name="suggest_activities"
        description="Suggest activities based on weather and location"
        parameters={z.object({
          city: z.string(),
          weather: z.string(),
        })}
        handler={async ({ city, weather }) => {
          if (weather.toLowerCase().includes('sunny')) {
            return `For ${city} in sunny weather: River cruise, walking tours, outdoor cafe, park visit`
          }
          return `For ${city}: Museums, covered markets, indoor attractions`
        }}
      />
      <Tool
        name="calculate_budget"
        description="Calculate total trip cost"
        parameters={z.object({
          hotel_cost: z.number(),
          nights: z.number(),
          activities_cost: z.number(),
        })}
        handler={async ({ hotel_cost, nights, activities_cost }) => {
          const hotel_total = hotel_cost * nights
          const total = hotel_total + activities_cost
          return `Total cost: $${total} (Hotel: $${hotel_total} + Activities: $${activities_cost})`
        }}
      />
    </Tools>
    <Message role="user">
      Help me plan a 3-night trip to Paris with a moderate budget. I want to
      know the weather, find a good hotel, get activity suggestions, and
      calculate the total cost.
    </Message>
  </Agent>,
)

console.log('\n' + '='.repeat(70))
console.log('=== Final Plan ===')
console.log('='.repeat(70) + '\n')
console.log(result.content)

console.log('\n' + '='.repeat(70))
console.log('=== Summary ===')
console.log('='.repeat(70))
console.log(
  `\nThinking blocks: ${thinkingBlockCount} | Tool calls: ${toolCallCount} | API calls: ${apiCallCount}`,
)
console.log(
  `Tokens: ${result.usage.inputTokens.toLocaleString()} in / ${result.usage.outputTokens.toLocaleString()} out`,
)
