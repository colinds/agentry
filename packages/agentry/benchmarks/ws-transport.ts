/**
 * SSE vs WebSocket on OpenAI's Responses API.
 *
 * Why: pi implements a WebSocket transport only for the Codex
 * (ChatGPT-subscription) provider, motivated by subscription token economics —
 * "sends only the new conversation items instead of resending the full chat
 * history". API-key users already get that benefit via `prompt_cache_key` and
 * `previous_response_id` over plain HTTP, so an upstream PR adding WS to
 * `openai-responses` has to justify itself on *latency* alone.
 *
 * Both sides use the OpenAI SDK directly, so this isolates the transport rather
 * than pi's overhead.
 *
 * Two measurements, because they answer different questions:
 *   cold — connection setup included. The one-shot case.
 *   warm — socket already open, reused for each request. What an agent loop
 *          actually looks like, and the only case where WS can win.
 */
import OpenAI from 'openai'
import { ResponsesWS } from 'openai/resources/responses/ws'

const RUNS = Number(process.argv[2] ?? 8)
const MODEL = process.env.BENCH_MODEL ?? 'gpt-4.1-mini'
const PROMPT = 'Count from 1 to 15, comma separated. Nothing else.'

interface Sample {
  ttftMs: number
  totalMs: number
}

const median = (xs: number[]) =>
  [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0

function report(name: string, samples: Sample[]) {
  const ttft = samples.map((s) => s.ttftMs)
  const total = samples.map((s) => s.totalMs)
  console.log(
    `${name.padEnd(10)} n=${String(samples.length).padStart(2)}  ` +
      `TTFT med ${median(ttft).toFixed(0).padStart(5)}ms  ` +
      `total med ${median(total).toFixed(0).padStart(5)}ms`,
  )
  return { ttft: median(ttft), total: median(total) }
}

async function sseRun(client: OpenAI): Promise<Sample> {
  const t0 = performance.now()
  let ttft = 0

  const stream = await client.responses.create({
    model: MODEL,
    input: PROMPT,
    stream: true,
  })
  for await (const event of stream) {
    if (!ttft && event.type === 'response.output_text.delta') {
      ttft = performance.now() - t0
    }
  }
  return { ttftMs: ttft, totalMs: performance.now() - t0 }
}

/** Opens a socket and resolves once it is ready to accept a request. */
function openSocket(client: OpenAI): Promise<ResponsesWS> {
  return new Promise((resolve, reject) => {
    const ws = new ResponsesWS(client)
    const timer = setTimeout(() => reject(new Error('ws open timeout')), 30_000)
    ws.socket.on('open', () => {
      clearTimeout(timer)
      resolve(ws)
    })
    ws.socket.on('error', (e: Error) => {
      clearTimeout(timer)
      reject(e)
    })
  })
}

/** One request on an already-open socket. */
function wsRequest(ws: ResponsesWS): Promise<Sample> {
  return new Promise((resolve, reject) => {
    const t0 = performance.now()
    let ttft = 0

    const timer = setTimeout(() => reject(new Error('ws request timeout')), 60_000)
    const onDelta = () => {
      if (!ttft) ttft = performance.now() - t0
    }
    const onDone = () => {
      clearTimeout(timer)
      ws.off('response.output_text.delta', onDelta)
      ws.off('response.completed', onDone)
      resolve({ ttftMs: ttft, totalMs: performance.now() - t0 })
    }

    ws.on('response.output_text.delta', onDelta)
    ws.on('response.completed', onDone)
    ws.on('error', (e: unknown) => {
      clearTimeout(timer)
      reject(e instanceof Error ? e : new Error(JSON.stringify(e)))
    })

    ws.send({ type: 'response.create', model: MODEL, input: PROMPT })
  })
}

/** Connection setup included — the one-shot case. */
async function wsColdRun(client: OpenAI): Promise<Sample> {
  const t0 = performance.now()
  const ws = await openSocket(client)
  const sample = await wsRequest(ws)
  ws.close()
  // Re-base onto the true start so setup is counted.
  const elapsed = performance.now() - t0
  return {
    ttftMs: sample.ttftMs + (elapsed - sample.totalMs),
    totalMs: elapsed,
  }
}

const client = new OpenAI()
console.log(`model=${MODEL} runs=${RUNS}\n`)

// Warm up so DNS/TLS setup does not land in the first sample.
await sseRun(client).catch(() => {})

const sse: Sample[] = []
const wsCold: Sample[] = []
const wsWarm: Sample[] = []

// Warm socket: opened once, reused for every warm sample — the agent-loop case.
const warmSocket = await openSocket(client)

for (let i = 0; i < RUNS; i++) {
  try {
    sse.push(await sseRun(client))
  } catch (e) {
    console.error(`sse ${i}:`, (e as Error).message)
  }
  try {
    wsWarm.push(await wsRequest(warmSocket))
  } catch (e) {
    console.error(`ws warm ${i}:`, (e as Error).message)
  }
  try {
    wsCold.push(await wsColdRun(client))
  } catch (e) {
    console.error(`ws cold ${i}:`, (e as Error).message)
  }
}

warmSocket.close()

console.log()
const s = report('SSE', sse)
const cold = report('WS cold', wsCold)
const warm = report('WS warm', wsWarm)

const pct = (base: number, other: number) => ((base - other) / base) * 100

console.log(
  `\nvs SSE — WS cold TTFT ${pct(s.ttft, cold.ttft).toFixed(1)}% ` +
    `| WS warm TTFT ${pct(s.ttft, warm.ttft).toFixed(1)}%  ` +
    `(positive = WS faster)`,
)

const warmWin = pct(s.ttft, warm.ttft)
console.log(
  warmWin > 15
    ? `\nVERDICT: warm WS is ${warmWin.toFixed(0)}% faster to first token — an upstream PR is justifiable.`
    : `\nVERDICT: no material win (${warmWin.toFixed(0)}%) — do not pursue the upstream PR.`,
)
