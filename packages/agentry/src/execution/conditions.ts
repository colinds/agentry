import type Anthropic from '@anthropic-ai/sdk'
import type OpenAI from 'openai'
import type { AgentMessageParam } from '../types/messages'
import type { ConditionInstance, Instance } from '../instances/types'
import { isConditionInstance } from '../instances/types'
import { debug } from '../debug'
import type { ProviderClientMap } from '../providers/types'
import type { ProviderName } from '../types/provider'
import type { JsonObject } from '../types/json'
import { toOpenAIInput } from '../providers/openai'
import { toAnthropicMessage } from '../providers/anthropic'

function buildNLConditionSystemPrompt(conditionDescriptions: string): string {
  return `You are a condition evaluation assistant. Given a conversation, determine which conditions are true. Multiple conditions can be true simultaneously.

Conditions:
${conditionDescriptions}

Return ALL indices of conditions that are TRUE based on the current conversation state.`
}

/**
 * Find all condition instances in the tree
 */
function findAllConditions(root: Instance): ConditionInstance[] {
  const conditions: ConditionInstance[] = []

  function traverse(inst: Instance): void {
    if (isConditionInstance(inst)) {
      conditions.push(inst)
    }
    if ('children' in inst && Array.isArray(inst.children)) {
      for (const child of inst.children) {
        traverse(child)
      }
    }
  }

  traverse(root)
  return conditions
}

/**
 * Evaluate all conditions and update isActive state
 * Returns true if any condition changed state
 */
export async function evaluateConditions({
  root,
  messages,
  clients,
  provider,
  model,
  signal,
  evaluateNL,
}: {
  root: Instance
  messages: AgentMessageParam[]
  clients: Partial<ProviderClientMap>
  provider: ProviderName
  model: string
  signal?: AbortSignal
  evaluateNL?: boolean
}): Promise<boolean> {
  const conditions = findAllConditions(root)

  if (conditions.length === 0) {
    return false
  }

  let hasChanges = false

  // step 1: evaluate all boolean conditions synchronously
  const booleanConditions = conditions.filter(
    (c) => typeof c.when === 'boolean',
  )
  for (const condition of booleanConditions) {
    const newActive = condition.when as boolean
    if (condition.isActive !== newActive) {
      condition.isActive = newActive
      hasChanges = true
      debug(
        'reconciler:conditions',
        `Boolean condition ${newActive ? 'activated' : 'deactivated'}`,
      )
    }
  }

  // step 2: batch evaluate all natural language conditions via LLM
  const nlConditions = conditions.filter((c) => typeof c.when === 'string')

  if (nlConditions.length > 0 && evaluateNL !== false) {
    const nlResults = await evaluateNaturalLanguageConditions({
      conditions: nlConditions,
      messages,
      clients,
      provider,
      model,
      signal,
    })

    for (let i = 0; i < nlConditions.length; i++) {
      const condition = nlConditions[i]!
      const newActive = nlResults[i]!
      if (condition.isActive !== newActive) {
        condition.isActive = newActive
        hasChanges = true
        debug(
          'reconciler:conditions',
          `NL condition "${condition.when}" ${newActive ? 'activated' : 'deactivated'}`,
        )
      }
    }
  }

  debug(
    'reconciler:conditions',
    `Evaluated ${conditions.length} conditions (${booleanConditions.length} boolean, ${nlConditions.length} NL), hasChanges=${hasChanges}`,
  )

  return hasChanges
}

/**
 * Map provider-returned true-condition indices into a boolean[] aligned with the input conditions.
 */
function mapConditionResults({
  trueConditionIndices,
  conditionCount,
  provider,
  durationMs,
}: {
  trueConditionIndices: number[]
  conditionCount: number
  provider: ProviderName
  durationMs: number
}): boolean[] {
  const trueIndices = new Set(trueConditionIndices)
  debug(
    'reconciler:conditions',
    `NL evaluation via ${provider} (${durationMs}ms): ${trueIndices.size}/${conditionCount} conditions true [${Array.from(trueIndices).join(', ')}]`,
  )
  return Array.from({ length: conditionCount }, (_, i) => trueIndices.has(i))
}

/**
 * Validate and extract the `trueConditionIndices` array from a provider tool call result.
 * Shared by both Anthropic and OpenAI evaluation paths.
 */
function parseConditionIndices(
  input: JsonObject,
  provider: ProviderName,
): number[] {
  const indices = input.trueConditionIndices
  if (!Array.isArray(indices) || !indices.every((i) => typeof i === 'number')) {
    throw new Error(
      `[agentry] NL condition evaluation: unexpected tool input shape from ${provider}: ${JSON.stringify(input)}`,
    )
  }
  return indices
}

/**
 * Dispatch NL condition evaluation to the appropriate provider implementation.
 */
async function evaluateNaturalLanguageConditions({
  conditions,
  messages,
  clients,
  provider,
  model,
  signal,
}: {
  conditions: ConditionInstance[]
  messages: AgentMessageParam[]
  clients: Partial<ProviderClientMap>
  provider: ProviderName
  model: string
  signal?: AbortSignal
}): Promise<boolean[]> {
  if (provider === 'anthropic' && clients.anthropic) {
    return evaluateNLWithAnthropic({
      conditions,
      messages,
      client: clients.anthropic,
      model,
      signal,
    })
  }
  if (provider === 'openai' && clients.openai) {
    return evaluateNLWithOpenAI({
      conditions,
      messages,
      client: clients.openai,
      model,
      signal,
    })
  }
  throw new Error(
    `[agentry] Cannot evaluate natural-language conditions: no ${provider} client available. ` +
      `Provide a client via createAI({ clients: { ${provider}: ... } }) or set the appropriate API key.`,
  )
}

/**
 * Evaluate NL conditions using Anthropic's structured outputs beta.
 */
async function evaluateNLWithAnthropic({
  conditions,
  messages,
  client,
  model,
  signal,
}: {
  conditions: ConditionInstance[]
  messages: AgentMessageParam[]
  client: Anthropic
  model: string
  signal?: AbortSignal
}): Promise<boolean[]> {
  const conditionDescriptions = conditions
    .map((c, index) => `${index}. ${c.when}`)
    .join('\n')

  const validIndices = conditions.map((_, index) => index)

  const evalMessages = ensureValidMessageStart(messages).map(toAnthropicMessage)

  const startTime = performance.now()
  const response = await client.beta.messages.create(
    {
      model,
      max_tokens: 512,
      system: buildNLConditionSystemPrompt(conditionDescriptions),
      messages: [
        ...evalMessages,
        {
          role: 'user' as const,
          content: 'Which conditions are true?',
        },
      ],
      tools: [
        {
          name: 'evaluate_conditions',
          description: 'Select all condition indices that evaluate to true',
          input_schema: {
            type: 'object',
            properties: {
              trueConditionIndices: {
                type: 'array',
                items: {
                  type: 'number',
                  enum: validIndices,
                },
                description:
                  'Array of indices for conditions that are true (can be empty if none are true)',
              },
            },
            required: ['trueConditionIndices'],
            additionalProperties: false,
          },
          strict: true,
        },
      ],
      betas: ['structured-outputs-2025-11-13'],
      tool_choice: { type: 'tool', name: 'evaluate_conditions' },
    },
    { signal },
  )
  const durationMs = Math.round(performance.now() - startTime)

  const toolUse = response.content.find((block) => block.type === 'tool_use')
  if (toolUse && toolUse.type === 'tool_use') {
    const input = toolUse.input as JsonObject
    const indices = parseConditionIndices(input, 'anthropic')
    return mapConditionResults({
      trueConditionIndices: indices,
      conditionCount: conditions.length,
      provider: 'anthropic',
      durationMs,
    })
  }

  throw new Error(
    '[agentry] NL condition evaluation: model did not invoke the evaluate_conditions tool. Conditions cannot be reliably evaluated.',
  )
}

/**
 * Evaluate NL conditions using OpenAI's function calling via the Responses API.
 */
async function evaluateNLWithOpenAI({
  conditions,
  messages,
  client,
  model,
  signal,
}: {
  conditions: ConditionInstance[]
  messages: AgentMessageParam[]
  client: OpenAI
  model: string
  signal?: AbortSignal
}): Promise<boolean[]> {
  const conditionDescriptions = conditions
    .map((c, index) => `${index}. ${c.when}`)
    .join('\n')

  const validIndices = conditions.map((_, index) => index)
  const evalMessages = ensureValidMessageStart(messages)

  const input = [
    ...toOpenAIInput(evalMessages),
    { role: 'user' as const, content: 'Which conditions are true?' },
  ]

  const startTime = performance.now()
  const response = await client.responses.create(
    {
      model,
      instructions: buildNLConditionSystemPrompt(conditionDescriptions),
      input,
      tools: [
        {
          type: 'function',
          name: 'evaluate_conditions',
          description: 'Select all condition indices that evaluate to true',
          parameters: {
            type: 'object',
            properties: {
              trueConditionIndices: {
                type: 'array',
                items: { type: 'number', enum: validIndices },
                description:
                  'Indices of conditions that are true (empty array if none)',
              },
            },
            required: ['trueConditionIndices'],
            additionalProperties: false,
          },
          strict: true,
        },
      ],
      tool_choice: { type: 'function', name: 'evaluate_conditions' },
      stream: false,
    },
    { signal },
  )
  const durationMs = Math.round(performance.now() - startTime)

  const functionCall = response.output.find(
    (item) =>
      item.type === 'function_call' && item.name === 'evaluate_conditions',
  )
  if (functionCall && functionCall.type === 'function_call') {
    let parsed: JsonObject
    try {
      parsed = JSON.parse(functionCall.arguments) as JsonObject
    } catch (e) {
      throw new Error(
        `[agentry] NL condition evaluation: failed to parse OpenAI function call arguments: "${functionCall.arguments}"`,
        { cause: e },
      )
    }
    const indices = parseConditionIndices(parsed, 'openai')
    return mapConditionResults({
      trueConditionIndices: indices,
      conditionCount: conditions.length,
      provider: 'openai',
      durationMs,
    })
  }

  throw new Error(
    '[agentry] NL condition evaluation: model did not invoke the evaluate_conditions tool. Conditions cannot be reliably evaluated.',
  )
}

// ensure messages don't start with a tool_result (which requires a preceding tool_use)
function ensureValidMessageStart(
  messages: AgentMessageParam[],
): AgentMessageParam[] {
  if (messages.length === 0) return messages

  // find the first user message that doesn't contain tool_results
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]!
    if (msg.role !== 'user') continue

    // string content is fine
    if (typeof msg.content === 'string') {
      return messages.slice(i)
    }

    // check if it has tool_results (which would need a preceding tool_use)
    const hasToolResult = msg.content.some(
      (block) => block.type === 'tool_result',
    )
    if (!hasToolResult) {
      return messages.slice(i)
    }
  }

  // no valid start found, return empty
  return []
}
