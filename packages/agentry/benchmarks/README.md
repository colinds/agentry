# Benchmarks

One-off measurements kept for the record. Outside `tsconfig` and lint scope —
they are scripts, not shipped code.

They are also outside the dependency graph. `ws-transport.ts` imports `openai`,
which is not a dependency of this package; it currently resolves only because
pi pulls it in transitively. To re-run it, install it explicitly first:

```bash
bun add -d openai
OPENAI_API_KEY=... bun run packages/agentry/benchmarks/ws-transport.ts 12
```

## `ws-transport.ts` — SSE vs WebSocket on OpenAI's Responses API

**Question.** pi implements a WebSocket transport only for the Codex
(ChatGPT-subscription) provider. Its stated motivation is subscription token
economics — *"sends only the new conversation items instead of resending the
full chat history"*. API-key users already get that benefit through
`prompt_cache_key` and `previous_response_id` over plain HTTP, so adding WS to
`openai-responses` upstream would have to justify itself on **latency alone**.

`wss://api.openai.com/v1/responses` is reachable with a plain
`Authorization: Bearer <apiKey>` — verified — so the transport is available to
API-key users. The question was only ever whether it is worth having.

**Method.** Both transports go through the OpenAI SDK directly, so the
measurement isolates the transport rather than pi's overhead. Two WS cases,
because they answer different questions:

- **cold** — connection setup included; the one-shot case.
- **warm** — socket opened once and reused per request; what an agent loop
  actually does, and the only case where WS can win.

An early version of this measured warm WS from socket-open, excluding setup,
and appeared to show a 45% win. That was not a comparison — SSE was paying for
connection establishment and WS was not.

```bash
bun --env-file=../../.env ./benchmarks/ws-transport.ts 12
```

**Result** (`gpt-4.1-mini`, n=12, median):

| transport | TTFT | total |
|---|---|---|
| SSE | 447ms | 1080ms |
| WS cold | 608ms | 1110ms |
| WS warm | 434ms | 914ms |

**Verdict: not worth pursuing.** Warm WS is 2.8% faster to first token —
noise. Cold WS is 36% *slower*, because it pays for connection setup the SDK's
HTTP keep-alive already amortises for SSE. Total wall clock is ~15% better
warm, but that figure mixes in generation time and rests on one sample set.

None of that clears the bar for importing the transport's failure modes: pi's
changelog carries nine-plus WS-specific fixes on the Codex path alone —
60-minute connection limits, idle timeouts, SSE fallback, processes kept alive
after a response, cached sessions shared across credentials.

Re-run this before revisiting. A workload with much longer conversations, where
per-request upload dominates, is the case most likely to change the answer.
