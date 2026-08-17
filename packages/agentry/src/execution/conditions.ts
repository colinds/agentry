import { Type } from 'typebox'
import type { Api, Model, Models, Tool as PiTool } from '@earendil-works/pi-ai'
import type { AgentMessageParam } from '../types/messages'
import { userMessage } from '../types/messages'
import type { ConditionInstance, Instance } from '../instances/types'
import { isConditionInstance } from '../instances/types'
import { debug } from '../debug'
import type { ProviderName } from '../types/provider'
import type { JsonObject } from '../types/json'
import { resolveModel } from '../pi/models'
import { createTurn } from '../pi/turn'
import type { RequestOptions } from './compaction'

/**
 * Cheap models used for condition evaluation, keyed by provider. Providers not
 * listed fall back to the agent's own model.
 */
const CONDITION_DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-4.1-mini',
}

const EVALUATE_CONDITIONS_TOOL = 'evaluate_conditions'

const CONDITION_TOOL: PiTool = {
  name: EVALUATE_CONDITIONS_TOOL,
  description:
    'Report every condition that is currently true, by zero-based index.',
  parameters: Type.Object(
    {
      trueConditionIndices: Type.Array(Type.Number(), {
        description: 'Zero-based indices of all conditions that are TRUE.',
      }),
    },
    { additionalProperties: false },
  ),
  constrainedSampling: { type: 'json_schema', strict: 'prefer' },
}

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
  models,
  provider,
  model,
  signal,
  evaluateNL,
  request,
}: {
  root: Instance
  messages: AgentMessageParam[]
  models: Models
  provider: ProviderName
  /** The agent's own model, used when no cheap default is known. */
  model: string
  signal?: AbortSignal
  evaluateNL?: boolean
  request?: RequestOptions
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

  // step 2: batch evaluate all natural language conditions via one model call
  const nlConditions = conditions.filter((c) => typeof c.when === 'string')

  if (nlConditions.length > 0 && evaluateNL !== false) {
    // Resolve provider/model for NL evaluation: first condition's override → cheap default
    const firstNL = nlConditions[0]!
    const resolvedProvider = firstNL.provider ?? provider
    // Falling back to the agent's own model is what the doc above promises, and
    // it is what keeps NL conditions working on the ~35 providers that have no
    // cheap default listed. Throwing here left every NL condition permanently
    // false, since the engine catches this and NL evaluation only runs on the
    // first iteration — so the failure never even retried.
    const resolvedModelId =
      firstNL.model ??
      CONDITION_DEFAULT_MODELS[resolvedProvider] ??
      (resolvedProvider === provider ? model : undefined)

    if (!resolvedModelId) {
      throw new Error(
        `[agentry] No condition-evaluation model for provider "${resolvedProvider}". ` +
          `Set one via the model prop on <Condition>.`,
      )
    }

    const nlResults = await evaluateNaturalLanguageConditions({
      conditions: nlConditions,
      messages,
      models,
      model: resolveModel(models, resolvedProvider, resolvedModelId),
      signal,
      request,
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
  provider: string
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
 * Validate and extract the `trueConditionIndices` array from a tool call result.
 */
function parseConditionIndices(input: JsonObject, provider: string): number[] {
  const indices = input.trueConditionIndices
  if (!Array.isArray(indices) || !indices.every((i) => typeof i === 'number')) {
    throw new Error(
      `[agentry] NL condition evaluation: unexpected tool input shape from ${provider}: ${JSON.stringify(input)}`,
    )
  }
  return indices
}

/**
 * Evaluates every natural-language condition in a single model call, using a
 * constrained-sampling tool to get a structured answer back.
 *
 * This replaces the previous pair of hand-written Anthropic and OpenAI paths;
 * pi handles the wire differences, so the only per-API branch left is whether
 * the tool call can be forced.
 */
async function evaluateNaturalLanguageConditions({
  conditions,
  messages,
  models,
  model,
  signal,
  request,
}: {
  conditions: ConditionInstance[]
  messages: AgentMessageParam[]
  models: Models
  model: Model<Api>
  signal?: AbortSignal
  request?: RequestOptions
}): Promise<boolean[]> {
  const descriptions = conditions
    .map((c, i) => `${i}: ${String(c.when)}`)
    .join('\n')

  const evalMessages = ensureValidMessageStart(messages)
  const context = {
    systemPrompt: buildNLConditionSystemPrompt(descriptions),
    messages:
      evalMessages.length > 0
        ? evalMessages
        : [userMessage('Evaluate the conditions.')],
    tools: [CONDITION_TOOL],
  }

  const startTime = performance.now()

  // Goes through the same seam as every other model call, so abort/error
  // handling is shared rather than duplicated here. Only one tool is offered,
  // so "must call a tool" means "must call evaluate_conditions".
  const message = await createTurn(models, {
    model,
    context,
    maxTokens: 1024,
    headers: request?.headers,
    timeoutMs: request?.timeoutMs,
    stream: false,
    forceToolUse: true,
    signal: signal ?? new AbortController().signal,
    onStream: () => {},
  })

  const durationMs = Math.round(performance.now() - startTime)

  const call = message.content.find(
    (block) =>
      block.type === 'toolCall' && block.name === EVALUATE_CONDITIONS_TOOL,
  )

  if (call?.type === 'toolCall') {
    const indices = parseConditionIndices(
      call.arguments as JsonObject,
      model.provider,
    )
    return mapConditionResults({
      trueConditionIndices: indices,
      conditionCount: conditions.length,
      provider: model.provider,
      durationMs,
    })
  }

  throw new Error(
    '[agentry] NL condition evaluation: model did not invoke the evaluate_conditions tool. Conditions cannot be reliably evaluated.',
  )
}

/**
 * Drops leading tool-result messages, which cannot open a conversation because
 * they have no preceding tool call to pair with.
 */
function ensureValidMessageStart(
  messages: AgentMessageParam[],
): AgentMessageParam[] {
  const firstValid = messages.findIndex((m) => m.role !== 'toolResult')
  return firstValid === -1 ? [] : messages.slice(firstValid)
}
