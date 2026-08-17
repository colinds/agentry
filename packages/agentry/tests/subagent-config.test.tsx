import { test, expect } from 'bun:test'
import { Type } from 'typebox'
import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from '@earendil-works/pi-ai'
import { run, Agent, System, Tools, AgentTool, Message } from '../src'

test('an <AgentTool> subagent honours its own <Agent maxTokens>', async () => {
  const faux = fauxProvider({ provider: 'anthropic' })
  const models = createModels()
  models.setProvider(faux.provider)

  const seen: Array<{ sys: string; maxTokens: number | undefined }> = []
  faux.setResponses([
    (ctx, options) => {
      seen.push({ sys: String(ctx.systemPrompt), maxTokens: options?.maxTokens })
      return fauxAssistantMessage([fauxToolCall('helper', {})], {
        stopReason: 'toolUse',
      })
    },
    (ctx, options) => {
      seen.push({ sys: String(ctx.systemPrompt), maxTokens: options?.maxTokens })
      return fauxAssistantMessage([fauxText('sub done')])
    },
    (ctx, options) => {
      seen.push({ sys: String(ctx.systemPrompt), maxTokens: options?.maxTokens })
      return fauxAssistantMessage([fauxText('done')])
    },
  ])

  await run(
    <Agent
      provider="anthropic"
      model={faux.getModel().id}
      maxTokens={9999}
      stream={false}
    >
      <System>parent</System>
      <Tools>
        <AgentTool
          name="helper"
          description="h"
          parameters={Type.Object({})}
          agent={() => (
            <Agent name="helper" maxTokens={7777}>
              <System>subagent</System>
              <Message role="user">do the thing</Message>
            </Agent>
          )}
        />
      </Tools>
      <Message role="user">go</Message>
    </Agent>,
    { models },
  )

  const sub = seen.find((c) => c.sys.includes('subagent'))
  expect(sub).toBeDefined()
  expect(sub!.maxTokens).toBe(7777)
})

test('runAgent provider/model overrides beat the element\'s own props', async () => {
  const primary = fauxProvider({ provider: 'anthropic' })
  const secondary = fauxProvider({ provider: 'openai' })
  const models = createModels()
  models.setProvider(primary.provider)
  models.setProvider(secondary.provider)

  const seen: string[] = []
  const record = (text: string) => (ctx: unknown, _o: unknown, _s: unknown, model: { provider: string }) => {
    seen.push(model.provider)
    return fauxAssistantMessage([fauxText(text)])
  }
  primary.setResponses([record('parent') as never, record('parent2') as never])
  secondary.setResponses([record('sub') as never])

  const { createAgent } = await import('../src')
  const handle = createAgent(
    <Agent provider="anthropic" model={primary.getModel().id} maxTokens={100} stream={false}>
      <System>parent</System>
      <Message role="user">go</Message>
    </Agent>,
    { models },
  )
  await handle.run()

  // Element declares anthropic; the caller overrides to openai.
  const ctx = {
    models,
    provider: 'anthropic',
    model: primary.getModel().id,
  }
  const { createRunAgent } = await import('../src/run/runAgentFunction')
  const runAgent = createRunAgent(ctx as never)
  await runAgent(
    <Agent provider="anthropic" model={primary.getModel().id}>
      <System>sub</System>
      <Message role="user">hi</Message>
    </Agent>,
    { provider: 'openai', model: secondary.getModel().id },
  )
  expect(seen).toContain('openai')
  handle.close()
})
