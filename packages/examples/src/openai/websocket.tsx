/**
 * WebSocket mode example
 *
 * OpenAI's Responses API supports a persistent WebSocket connection that sends
 * only incremental input on continuation turns via `previous_response_id`,
 * cutting per-turn latency ~40% in multi-tool-call loops.
 *
 * Enable it with a single flag:
 *   providers: { openai: { client, websocket: true } }
 *
 * Run:
 *   bun run example:openai:websocket
 */

import { z } from 'zod'
import { run, Agent, System, Tools, Tool, Message } from 'agentry'
import OpenAI from 'openai'
import { OPENAI_MODEL as EXAMPLE_OPENAI_MODEL } from '../constants'

const MODEL = process.env.OPENAI_MODEL ?? EXAMPLE_OPENAI_MODEL
const client = new OpenAI()

// ── Tools ─────────────────────────────────────────────────────────────────────

const productDb: Record<
  string,
  { name: string; price: number; stock: number }
> = {
  P001: { name: 'Widget Pro', price: 29.99, stock: 142 },
  P002: { name: 'Gadget Plus', price: 49.99, stock: 7 },
  P003: { name: 'Doohickey Max', price: 9.99, stock: 0 },
}

// ── Run ───────────────────────────────────────────────────────────────────────

console.log(`WebSocket mode — model: ${MODEL}`)
console.log('─'.repeat(50))

const t0 = performance.now()
let toolCallCount = 0

const result = await run(
  <Agent
    provider="openai"
    model={MODEL}
    maxTokens={1024}
    stream={true}
    onMessage={(event) => {
      if (event.type === 'tool_use_start') {
        toolCallCount++
        console.log(`\n[tool] ${event.toolName}(${event.toolId})`)
      } else if (event.type === 'text') {
        process.stdout.write(event.text)
      }
    }}
  >
    <System>
      You are a shopping assistant. Use the provided tools to look up product
      information and estimate shipping costs. Be concise.
    </System>
    <Tools>
      <Tool
        name="lookup_product"
        description="Look up a product by ID to get name, price and stock level"
        parameters={z.object({
          id: z.string().describe('Product ID, e.g. P001'),
        })}
        handler={async ({ id }) => {
          const product = productDb[id]
          const result = product
            ? JSON.stringify(product)
            : `Product ${id} not found`
          console.log(`  → ${result}`)
          return result
        }}
      />
      <Tool
        name="estimate_shipping"
        description="Estimate shipping cost and delivery time"
        parameters={z.object({
          product_id: z.string(),
          quantity: z.number().int().positive(),
          destination: z.string().describe('Country code, e.g. US or UK'),
        })}
        handler={async ({ product_id, quantity, destination }) => {
          const base = destination === 'US' ? 5.99 : 14.99
          const total = (base + 0.5 * quantity).toFixed(2)
          const days = destination === 'US' ? '2-3' : '7-10'
          const result = JSON.stringify({
            product_id,
            quantity,
            destination,
            shipping: total,
            days,
          })
          console.log(`  → ${result}`)
          return result
        }}
      />
    </Tools>
    <Message role="user">
      I want to order 3x Widget Pro (P001) and 2x Gadget Plus (P002) shipped to
      the US. Look up both products, estimate shipping for each, then give me a
      total cost breakdown including shipping.
    </Message>
  </Agent>,
  {
    providers: { openai: { client, websocket: true } },
  },
)

const ms = Math.round(performance.now() - t0)

console.log('\n')
console.log('─'.repeat(50))
console.log(`Tool calls: ${toolCallCount}`)
console.log(`Time:       ${ms}ms`)
console.log(
  `Tokens:     ${result.usage.inputTokens} in / ${result.usage.outputTokens} out`,
)
