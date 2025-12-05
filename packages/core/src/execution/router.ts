import type Anthropic from '@anthropic-ai/sdk'
import type { BetaMessageParam } from '../types/messages.ts'
import type { RouterInstance, RouteInstance } from '../instances/types.ts'
import { debug } from '../debug.ts'

/**
 * Evaluate routes and return indices of matching routes
 */
export async function evaluateRoutes(
  router: RouterInstance,
  messages: BetaMessageParam[],
  client: Anthropic,
  model: string,
  signal?: AbortSignal,
): Promise<number[]> {
  const matchedIndices: number[] = []

  for (let i = 0; i < router.children.length; i++) {
    const route = router.children[i]
    if (route && typeof route.when === 'boolean' && route.when === true) {
      matchedIndices.push(i)
    }
  }

  const nlRoutes = router.children
    .map((route, index) => ({ route, index }))
    .filter(
      ({ route, index }) =>
        typeof route.when === 'string' && !matchedIndices.includes(index),
    )

  if (nlRoutes.length > 0) {
    const nlMatches = await evaluateNaturalLanguageRoutes(
      nlRoutes,
      messages,
      client,
      model,
      signal,
    )
    matchedIndices.push(...nlMatches)
  }

  debug('reconciler:router', `Active routes: [${matchedIndices.join(', ')}]`)
  return matchedIndices
}

async function evaluateNaturalLanguageRoutes(
  routes: Array<{ route: RouteInstance; index: number }>,
  messages: BetaMessageParam[],
  client: Anthropic,
  model: string,
  signal?: AbortSignal,
): Promise<number[]> {
  const routeDescriptions = routes
    .map(({ route, index }) => `${index}. ${route.when}`)
    .join('\n')

  const conversationSummary = summarizeMessages(messages)
  const validIndices = routes.map(({ index }) => index)

  const response = await client.beta.messages.create(
    {
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      system: `You are a routing assistant. Given a conversation, determine which routes match. Multiple routes can match simultaneously.

Routes:
${routeDescriptions}

Return ALL indices of routes that match the current conversation state.`,
      messages: [
        {
          role: 'user',
          content: `Conversation:\n${conversationSummary}\n\nWhich routes match?`,
        },
      ],
      tools: [
        {
          name: 'select_routes',
          description: 'Select all matching route indices',
          input_schema: {
            type: 'object',
            properties: {
              matchingRouteIndices: {
                type: 'array',
                items: {
                  type: 'number',
                  enum: validIndices,
                },
                description:
                  'Array of indices for routes that match (can be empty if none match)',
              },
            },
            required: ['matchingRouteIndices'],
            additionalProperties: false,
          },
          strict: true,
        },
      ],
      betas: ['structured-outputs-2025-11-13'],
      tool_choice: { type: 'tool', name: 'select_routes' },
    },
    { signal },
  )

  const toolUse = response.content.find((block) => block.type === 'tool_use')
  if (toolUse && toolUse.type === 'tool_use') {
    const input = toolUse.input as { matchingRouteIndices: number[] }
    const matches = input.matchingRouteIndices || []
    debug(
      'reconciler:router',
      `NL route evaluation result: [${matches.join(', ')}]`,
    )
    return matches
  }

  return []
}

function summarizeMessages(messages: BetaMessageParam[]): string {
  const recent = messages.slice(-10)
  return recent
    .map((msg) => {
      const content =
        typeof msg.content === 'string'
          ? msg.content.slice(0, 500)
          : msg.content
              .map((c) => (c.type === 'text' ? c.text : '[non-text]'))
              .join(' ')
              .slice(0, 500)
      return `${msg.role}: ${content}`
    })
    .join('\n')
}
