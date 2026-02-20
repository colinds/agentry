import type { AgentComponentPublicProps } from '../src/components/Agent.tsx'

// Compile-time checks — no test runner needed.
// If any of the @ts-expect-error comments are "unused", the constraint is broken.

// ✅ Root agent: both provider and model
const _root: AgentComponentPublicProps = {
  provider: 'anthropic',
  model: 'claude-haiku-4-5',
}

// ✅ Subagent: inherit everything
const _sub: AgentComponentPublicProps = {}

// ❌ model without provider — must not compile
// @ts-expect-error model requires provider
const _modelOnly: AgentComponentPublicProps = { model: 'claude-haiku-4-5' }

// ❌ provider without model — must not compile
// @ts-expect-error provider requires model
const _providerOnly: AgentComponentPublicProps = { provider: 'anthropic' }

export { _root, _sub, _modelOnly, _providerOnly }
