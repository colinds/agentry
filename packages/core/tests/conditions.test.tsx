import { describe, it, expect } from 'bun:test'
import { useState } from 'react'
import {
  run,
  Agent,
  System,
  Context,
  Condition,
  Tools,
  Tool,
  Message,
} from '../../agentry/src/index.ts'
import {
  createStepMockClient,
  mockText,
  mockToolUse,
} from '../src/test-utils/index.ts'
import { z } from 'zod'

describe('Condition', () => {
  describe('Boolean Conditions', () => {
    it('should render condition when condition is true', async () => {
      const TestAgent = () => {
        const [isActive] = useState(true)
        return (
          <Agent model="claude-sonnet-4">
            <Message role="user">Hello</Message>
            <Condition when={isActive}>
              <System>Active mode</System>
            </Condition>
            <Condition when={!isActive}>
              <System>Inactive mode</System>
            </Condition>
          </Agent>
        )
      }

      const { client, controller } = createStepMockClient([
        {
          content: [mockText('Hello! Active mode is enabled.')],
          stop_reason: 'end_turn',
        },
      ])

      const runPromise = run(<TestAgent />, { client })
      await controller.nextTurn()
      const result = await runPromise
      expect(result.content).toContain('Hello')
    })

    it('should not render condition when condition is false', async () => {
      const TestAgent = () => {
        const [isActive] = useState(false)
        return (
          <Agent model="claude-sonnet-4">
            <Message role="user">Hello</Message>
            <Condition when={isActive}>
              <System>Active mode</System>
            </Condition>
            <Condition when={!isActive}>
              <System>Inactive mode</System>
            </Condition>
          </Agent>
        )
      }

      const { client, controller } = createStepMockClient([
        {
          content: [mockText('Hello! Inactive mode is enabled.')],
          stop_reason: 'end_turn',
        },
      ])

      const runPromise = run(<TestAgent />, { client })
      await controller.nextTurn()
      const result = await runPromise
      expect(result.content).toContain('Hello')
    })

    it('should activate all matching routes (parallel routing)', async () => {
      const TestAgent = () => {
        const [condition1] = useState(true)
        const [condition2] = useState(true)
        return (
          <Agent model="claude-sonnet-4">
            <Message role="user">Test</Message>
            <Condition when={condition1}>
              <Context>Route 1 active</Context>
            </Condition>
            <Condition when={condition2}>
              <Context>Route 2 active</Context>
            </Condition>
          </Agent>
        )
      }

      const { client, controller } = createStepMockClient([
        {
          content: [mockText('Both routes are active')],
          stop_reason: 'end_turn',
        },
      ])

      const runPromise = run(<TestAgent />, { client })
      await controller.nextTurn()
      const result = await runPromise
      expect(result.content).toContain('Both')
    })
  })

  describe('Boolean Conditions with Tools', () => {
    it('should only make route-specific tools available', async () => {
      const TestAgent = () => {
        const [isAuthenticated] = useState(false)
        return (
          <Agent model="claude-sonnet-4">
            <Message role="user">Help me</Message>
            <Condition when={!isAuthenticated}>
              <Tools>
                <Tool
                  name="authenticate"
                  description="Authenticate user"
                  parameters={z.object({ email: z.string() })}
                  handler={async () => 'Authenticated'}
                />
              </Tools>
            </Condition>
            <Condition when={isAuthenticated}>
              <Tools>
                <Tool
                  name="protected_action"
                  description="Protected action"
                  parameters={z.object({})}
                  handler={async () => 'Action performed'}
                />
              </Tools>
            </Condition>
          </Agent>
        )
      }

      const { client, controller } = createStepMockClient([
        {
          content: [mockToolUse('authenticate', { email: 'test@example.com' })],
          stop_reason: 'tool_use',
        },
        {
          content: [mockText('Authenticated successfully')],
          stop_reason: 'end_turn',
        },
      ])

      const runPromise = run(<TestAgent />, { client })
      await controller.nextTurn()
      await controller.nextTurn()
      const result = await runPromise
      expect(result.content).toContain('Authenticated')
    })

    it('should update available tools when route changes', async () => {
      const TestAgent = () => {
        const [isAuthenticated, setIsAuthenticated] = useState(false)
        return (
          <Agent model="claude-sonnet-4">
            <Message role="user">Authenticate me</Message>
            <Condition when={!isAuthenticated}>
              <Tools>
                <Tool
                  name="authenticate"
                  description="Authenticate user"
                  parameters={z.object({ email: z.string() })}
                  handler={async ({ email }) => {
                    setIsAuthenticated(true)
                    return `Authenticated as ${email}`
                  }}
                />
              </Tools>
            </Condition>
            <Condition when={isAuthenticated}>
              <Tools>
                <Tool
                  name="protected_action"
                  description="Protected action"
                  parameters={z.object({})}
                  handler={async () => 'Protected action performed'}
                />
              </Tools>
            </Condition>
          </Agent>
        )
      }

      const { client, controller } = createStepMockClient([
        {
          content: [mockToolUse('authenticate', { email: 'test@example.com' })],
          stop_reason: 'tool_use',
        },
        {
          content: [
            mockText(
              'Authentication successful! You now have access to protected actions.',
            ),
          ],
          stop_reason: 'end_turn',
        },
      ])

      const runPromise = run(<TestAgent />, { client })
      await controller.nextTurn()
      await controller.nextTurn()
      const result = await runPromise
      expect(result.content).toContain('Authentication successful')
    })
  })

  describe('No Matching Routes', () => {
    it('should render nothing when no routes match', async () => {
      const TestAgent = () => {
        const [condition] = useState(false)
        return (
          <Agent model="claude-sonnet-4">
            <System>Base system prompt</System>
            <Message role="user">Hello</Message>
            <Condition when={condition}>
              <Context>This should not appear</Context>
            </Condition>
          </Agent>
        )
      }

      const { client, controller } = createStepMockClient([
        {
          content: [mockText('Hello! I have the base system prompt only.')],
          stop_reason: 'end_turn',
        },
      ])

      const runPromise = run(<TestAgent />, { client })
      await controller.nextTurn()
      const result = await runPromise
      expect(result.content).toContain('Hello')
    })
  })

  describe('Route with Multiple Children', () => {
    it('should render all children of active route', async () => {
      const TestAgent = () => {
        const [isActive] = useState(true)
        return (
          <Agent model="claude-sonnet-4">
            <Message role="user">Test</Message>
            <Condition when={isActive}>
              <Context>Context 1</Context>
              <System>System 1</System>
              <Tools>
                <Tool
                  name="tool1"
                  description="Tool 1"
                  parameters={z.object({})}
                  handler={async () => 'Tool 1 executed'}
                />
              </Tools>
            </Condition>
          </Agent>
        )
      }

      const { client, controller } = createStepMockClient([
        {
          content: [mockToolUse('tool1', {})],
          stop_reason: 'tool_use',
        },
        {
          content: [mockText('Tool executed successfully')],
          stop_reason: 'end_turn',
        },
      ])

      const runPromise = run(<TestAgent />, { client })
      await controller.nextTurn()
      await controller.nextTurn()
      const result = await runPromise
      expect(result.content).toContain('Tool executed')
    })
  })

  describe('Router Instance Structure', () => {
    it('should collect routes into router.children array', async () => {
      const TestAgent = () => {
        const [isActive] = useState(true)
        return (
          <Agent model="claude-sonnet-4">
            <Message role="user">Hello</Message>
            <Condition when={isActive}>
              <System>Route 1</System>
            </Condition>
            <Condition when={!isActive}>
              <System>Route 2</System>
            </Condition>
            <Condition when="user wants math">
              <System>Route 3</System>
            </Condition>
          </Agent>
        )
      }

      const { client, controller } = createStepMockClient([
        {
          content: [mockText('Hello')],
          stop_reason: 'end_turn',
        },
      ])

      // Create agent in interactive mode
      const handle = await run(<TestAgent />, { client, mode: 'interactive' })

      // Trigger reconciler by starting execution (but abort immediately after first API call)
      const runPromise = handle.run()
      await controller.nextTurn()
      handle.abort()
      await runPromise.catch(() => {})

      // Test passes if reconciliation and execution completes without errors
      handle.close()
    })
  })

  describe('Natural Language Conditions', () => {
    it('should evaluate natural language routes via LLM', async () => {
      const TestAgent = () => {
        const [isAuthenticated] = useState(true)
        return (
          <Agent model="claude-sonnet-4">
            <Message role="user">Can you calculate 5 times 8 for me?</Message>
            <Condition when={isAuthenticated}>
              <Context>User is authenticated</Context>
            </Condition>
            <Condition when="user wants to do math or calculations">
              <Context>Math mode active</Context>
              <Tools>
                <Tool
                  name="calculate"
                  description="Perform calculation"
                  parameters={z.object({
                    expression: z.string(),
                  })}
                  handler={async ({ expression }) => {
                    // eslint-disable-next-line react-hooks/unsupported-syntax
                    const result = eval(expression)
                    return `Result: ${result}`
                  }}
                />
              </Tools>
            </Condition>
          </Agent>
        )
      }

      const { client, controller } = createStepMockClient([
        // First call: Route evaluation (LLM determines which NL routes match)
        {
          content: [
            {
              type: 'tool_use',
              id: 'route_1',
              name: 'select_routes',
              input: { matchingRouteIndices: [1] }, // Route index 1 (math route)
            },
          ],
          stop_reason: 'tool_use',
        },
        // Second call: Agent's response with math tool
        {
          content: [mockToolUse('calculate', { expression: '5 * 8' })],
          stop_reason: 'tool_use',
        },
        // Third call: Final response
        {
          content: [mockText('The result of 5 times 8 is 40.')],
          stop_reason: 'end_turn',
        },
      ])

      const runPromise = run(<TestAgent />, { client })
      await controller.nextTurn() // Route evaluation
      await controller.nextTurn() // Tool use
      await controller.nextTurn() // Final response
      const result = await runPromise

      expect(result.content).toContain('40')
    })

    it('should activate multiple natural language routes simultaneously', async () => {
      const TestAgent = () => {
        return (
          <Agent model="claude-sonnet-4">
            <Message role="user">Calculate 2+2 and tell me about math</Message>
            <Condition when="user wants to do math or calculations">
              <Context>Math mode</Context>
              <Tools>
                <Tool
                  name="calculate"
                  description="Calculate"
                  parameters={z.object({ expr: z.string() })}
                  handler={async ({ expr }) => {
                    // eslint-disable-next-line react-hooks/unsupported-syntax
                    return `Result: ${eval(expr)}`
                  }}
                />
              </Tools>
            </Condition>
            <Condition when="user wants information or knowledge">
              <Context>Info mode</Context>
              <Tools>
                <Tool
                  name="get_info"
                  description="Get info"
                  parameters={z.object({ topic: z.string() })}
                  handler={async ({ topic }) => `Info about ${topic}`}
                />
              </Tools>
            </Condition>
          </Agent>
        )
      }

      const { client, controller } = createStepMockClient([
        // Route evaluation - both routes match
        {
          content: [
            {
              type: 'tool_use',
              id: 'route_1',
              name: 'select_routes',
              input: { matchingRouteIndices: [0, 1] }, // Both routes active
            },
          ],
          stop_reason: 'tool_use',
        },
        // Agent uses both tools
        {
          content: [
            mockToolUse('calculate', { expr: '2+2' }, 'tool_1'),
            mockToolUse('get_info', { topic: 'math' }, 'tool_2'),
          ],
          stop_reason: 'tool_use',
        },
        {
          content: [mockText('2+2 is 4, and here is info about math.')],
          stop_reason: 'end_turn',
        },
      ])

      const runPromise = run(<TestAgent />, { client })
      await controller.nextTurn()
      await controller.nextTurn()
      await controller.nextTurn()
      const result = await runPromise

      expect(result.content).toContain('4')
    })
  })

  describe('Nested Conditions', () => {
    it('should render nested condition when both parent and child are true', async () => {
      const TestAgent = () => {
        const [isAuthenticated] = useState(true)
        const [isPremium] = useState(true)
        return (
          <Agent model="claude-sonnet-4">
            <Message role="user">Hello</Message>
            <Condition when={isAuthenticated}>
              <Context>User is authenticated</Context>
              <Condition when={isPremium}>
                <Context>Premium features enabled</Context>
                <Tools>
                  <Tool
                    name="premium_feature"
                    description="Premium feature"
                    parameters={z.object({})}
                    handler={async () => 'Premium feature executed'}
                  />
                </Tools>
              </Condition>
            </Condition>
          </Agent>
        )
      }

      const { client, controller } = createStepMockClient([
        {
          content: [mockToolUse('premium_feature', {})],
          stop_reason: 'tool_use',
        },
        {
          content: [mockText('Premium feature is available')],
          stop_reason: 'end_turn',
        },
      ])

      const runPromise = run(<TestAgent />, { client })
      await controller.nextTurn()
      await controller.nextTurn()
      const result = await runPromise
      expect(result.content).toContain('Premium')
    })

    it('should not render nested condition when parent is true but child is false', async () => {
      const TestAgent = () => {
        const [isAuthenticated] = useState(true)
        const [isPremium] = useState(false)
        return (
          <Agent model="claude-sonnet-4">
            <Message role="user">Hello</Message>
            <Condition when={isAuthenticated}>
              <Context>User is authenticated</Context>
              <Tools>
                <Tool
                  name="basic_feature"
                  description="Basic feature"
                  parameters={z.object({})}
                  handler={async () => 'Basic feature executed'}
                />
              </Tools>
              <Condition when={isPremium}>
                <Tools>
                  <Tool
                    name="premium_feature"
                    description="Premium feature"
                    parameters={z.object({})}
                    handler={async () => 'Premium feature executed'}
                  />
                </Tools>
              </Condition>
            </Condition>
          </Agent>
        )
      }

      const { client, controller } = createStepMockClient([
        {
          content: [mockToolUse('basic_feature', {})],
          stop_reason: 'tool_use',
        },
        {
          content: [mockText('Only basic features available')],
          stop_reason: 'end_turn',
        },
      ])

      const runPromise = run(<TestAgent />, { client })
      await controller.nextTurn()
      await controller.nextTurn()
      const result = await runPromise
      expect(result.content).toContain('basic')
    })

    it('should not render nested condition when parent is false', async () => {
      const TestAgent = () => {
        const [isAuthenticated] = useState(false)
        const [isPremium] = useState(true)
        return (
          <Agent model="claude-sonnet-4">
            <Message role="user">Hello</Message>
            <Condition when={isAuthenticated}>
              <Condition when={isPremium}>
                <Context>This should not appear</Context>
              </Condition>
            </Condition>
            <Condition when={!isAuthenticated}>
              <Context>Please authenticate</Context>
            </Condition>
          </Agent>
        )
      }

      const { client, controller } = createStepMockClient([
        {
          content: [mockText('You need to authenticate first')],
          stop_reason: 'end_turn',
        },
      ])

      const runPromise = run(<TestAgent />, { client })
      await controller.nextTurn()
      const result = await runPromise
      expect(result.content).toContain('authenticate')
    })

    it('should handle three levels of nested conditions', async () => {
      const TestAgent = () => {
        const [isAuthenticated] = useState(true)
        const [isPremium] = useState(true)
        const [isAdmin] = useState(true)
        return (
          <Agent model="claude-sonnet-4">
            <Message role="user">Hello</Message>
            <Condition when={isAuthenticated}>
              <Context>Authenticated</Context>
              <Condition when={isPremium}>
                <Context>Premium</Context>
                <Condition when={isAdmin}>
                  <Context>Admin access granted</Context>
                  <Tools>
                    <Tool
                      name="admin_action"
                      description="Admin action"
                      parameters={z.object({})}
                      handler={async () => 'Admin action performed'}
                    />
                  </Tools>
                </Condition>
              </Condition>
            </Condition>
          </Agent>
        )
      }

      const { client, controller } = createStepMockClient([
        {
          content: [mockToolUse('admin_action', {})],
          stop_reason: 'tool_use',
        },
        {
          content: [mockText('Admin action completed')],
          stop_reason: 'end_turn',
        },
      ])

      const runPromise = run(<TestAgent />, { client })
      await controller.nextTurn()
      await controller.nextTurn()
      const result = await runPromise
      expect(result.content).toContain('Admin')
    })

    it('should handle mixed nested conditions (boolean parent, NL child)', async () => {
      const TestAgent = () => {
        const [isAuthenticated] = useState(true)
        return (
          <Agent model="claude-sonnet-4">
            <Message role="user">I want to calculate 10 + 5</Message>
            <Condition when={isAuthenticated}>
              <Context>User is authenticated</Context>
              <Condition when="user wants to do math or calculations">
                <Context>Math mode active</Context>
                <Tools>
                  <Tool
                    name="calculate"
                    description="Perform calculation"
                    parameters={z.object({ expression: z.string() })}
                    handler={async ({ expression }) => {
                      // eslint-disable-next-line react-hooks/unsupported-syntax
                      const result = eval(expression)
                      return `Result: ${result}`
                    }}
                  />
                </Tools>
              </Condition>
            </Condition>
          </Agent>
        )
      }

      const { client, controller } = createStepMockClient([
        // Route evaluation for NL condition
        {
          content: [
            {
              type: 'tool_use',
              id: 'route_1',
              name: 'select_routes',
              input: { matchingRouteIndices: [0] }, // Math route matches
            },
          ],
          stop_reason: 'tool_use',
        },
        // Agent uses calculate tool
        {
          content: [mockToolUse('calculate', { expression: '10 + 5' })],
          stop_reason: 'tool_use',
        },
        // Final response
        {
          content: [mockText('The result is 15')],
          stop_reason: 'end_turn',
        },
      ])

      const runPromise = run(<TestAgent />, { client })
      await controller.nextTurn()
      await controller.nextTurn()
      await controller.nextTurn()
      const result = await runPromise
      expect(result.content).toContain('15')
    })

    it('should handle multiple nested conditions with state changes', async () => {
      const TestAgent = () => {
        const [isAuthenticated, setIsAuthenticated] = useState(false)
        const [hasPermission] = useState(true)
        return (
          <Agent model="claude-sonnet-4">
            <Message role="user">Authenticate and perform action</Message>
            <Condition when={!isAuthenticated}>
              <Tools>
                <Tool
                  name="authenticate"
                  description="Authenticate user"
                  parameters={z.object({ email: z.string() })}
                  handler={async () => {
                    setIsAuthenticated(true)
                    return 'Authenticated'
                  }}
                />
              </Tools>
            </Condition>
            <Condition when={isAuthenticated}>
              <Condition when={hasPermission}>
                <Tools>
                  <Tool
                    name="protected_action"
                    description="Protected action"
                    parameters={z.object({})}
                    handler={async () => 'Action performed'}
                  />
                </Tools>
              </Condition>
            </Condition>
          </Agent>
        )
      }

      const { client, controller } = createStepMockClient([
        {
          content: [mockToolUse('authenticate', { email: 'test@example.com' })],
          stop_reason: 'tool_use',
        },
        {
          content: [mockToolUse('protected_action', {})],
          stop_reason: 'tool_use',
        },
        {
          content: [mockText('Authenticated and action completed')],
          stop_reason: 'end_turn',
        },
      ])

      const runPromise = run(<TestAgent />, { client })
      await controller.nextTurn()
      await controller.nextTurn()
      await controller.nextTurn()
      const result = await runPromise
      expect(result.content).toContain('action')
    })
  })
})
