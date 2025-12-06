import type Anthropic from '@anthropic-ai/sdk'
import type { BetaMessageParam } from '../types/messages.ts'
import type { ConditionInstance, Instance } from '../instances/types.ts'
import { isConditionInstance } from '../instances/types.ts'
import { debug } from '../debug.ts'

/**
 * Find all condition instances in the tree
 */
export function findAllConditions(root: Instance): ConditionInstance[] {
  const conditions: ConditionInstance[] = []

  const traverse = (inst: Instance) => {
    if (isConditionInstance(inst)) {
      conditions.push(inst)
    }
    if ('children' in inst && Array.isArray(inst.children)) {
      inst.children.forEach(traverse)
    }
  }

  traverse(root)
  return conditions
}

/**
 * Evaluate all conditions and update isActive state
 * Returns true if any condition changed state
 */
export async function evaluateConditions(
  root: Instance,
  messages: BetaMessageParam[],
  client: Anthropic,
  model: string,
  signal?: AbortSignal,
  options?: { evaluateNL?: boolean },
): Promise<boolean> {
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

  if (nlConditions.length > 0 && options?.evaluateNL !== false) {
    const nlResults = await evaluateNaturalLanguageConditions(
      nlConditions,
      messages,
      client,
      model,
      signal,
    )

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
 * Batch evaluate multiple natural language conditions via single LLM call
 */
async function evaluateNaturalLanguageConditions(
  conditions: ConditionInstance[],
  messages: BetaMessageParam[],
  client: Anthropic,
  model: string,
  signal?: AbortSignal,
): Promise<boolean[]> {
  const conditionDescriptions = conditions
    .map((c, index) => `${index}. ${c.when}`)
    .join('\n')

  const validIndices = conditions.map((_, index) => index)

  const evalMessages = ensureValidMessageStart(messages)

  const startTime = performance.now()
  const response = await client.beta.messages.create(
    {
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      system: `You are a condition evaluation assistant. Given a conversation, determine which conditions are true. Multiple conditions can be true simultaneously.

Conditions:
${conditionDescriptions}

Return ALL indices of conditions that are TRUE based on the current conversation state.`,
      messages: [
        ...evalMessages,
        {
          role: 'user',
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
    const input = toolUse.input as { trueConditionIndices: number[] }
    const trueIndices = new Set(input.trueConditionIndices || [])

    debug(
      'reconciler:conditions',
      `NL evaluation (${durationMs}ms): ${trueIndices.size}/${conditions.length} conditions true [${Array.from(trueIndices).join(', ')}]`,
    )

    return conditions.map((_, index) => trueIndices.has(index))
  }

  // fallback: all false if evaluation fails
  debug(
    'reconciler:conditions',
    'NL evaluation failed, defaulting all to false',
  )
  return conditions.map(() => false)
}

// ensure messages don't start with a tool_result (which requires a preceding tool_use)
function ensureValidMessageStart(
  messages: BetaMessageParam[],
): BetaMessageParam[] {
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
