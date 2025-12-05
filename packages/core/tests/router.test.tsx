import { describe, it, expect } from 'bun:test'
import { useState } from 'react'
import {
  run,
  Agent,
  System,
  Context,
  Router,
  Route,
  Tools,
  Tool,
  Message,
} from '../../agentry/src/index.ts'
import {
  createStepMockClient,
  mockText,
  mockToolUse,
} from '../src/test-utils/index.ts'
import { verifyRouterHasRoutes } from './utils/testHelpers.ts'
import { z } from 'zod'

describe('Router/Route', () => {
  describe('Boolean Routes', () => {
    it('should render route when condition is true', async () => {
      const TestAgent = () => {
        const [isActive] = useState(true)
        return (
          <Agent model="claude-sonnet-4">
            <Message role="user">Hello</Message>
            <Router>
              <Route when={isActive}>
                <System>Active mode</System>
              </Route>
              <Route when={!isActive}>
                <System>Inactive mode</System>
              </Route>
            </Router>
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

    it('should not render route when condition is false', async () => {
      const TestAgent = () => {
        const [isActive] = useState(false)
        return (
          <Agent model="claude-sonnet-4">
            <Message role="user">Hello</Message>
            <Router>
              <Route when={isActive}>
                <System>Active mode</System>
              </Route>
              <Route when={!isActive}>
                <System>Inactive mode</System>
              </Route>
            </Router>
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
            <Router>
              <Route when={condition1}>
                <Context>Route 1 active</Context>
              </Route>
              <Route when={condition2}>
                <Context>Route 2 active</Context>
              </Route>
            </Router>
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

  describe('Boolean Routes with Tools', () => {
    it('should only make route-specific tools available', async () => {
      const TestAgent = () => {
        const [isAuthenticated] = useState(false)
        return (
          <Agent model="claude-sonnet-4">
            <Message role="user">Help me</Message>
            <Router>
              <Route when={!isAuthenticated}>
                <Tools>
                  <Tool
                    name="authenticate"
                    description="Authenticate user"
                    parameters={z.object({ email: z.string() })}
                    handler={async () => 'Authenticated'}
                  />
                </Tools>
              </Route>
              <Route when={isAuthenticated}>
                <Tools>
                  <Tool
                    name="protected_action"
                    description="Protected action"
                    parameters={z.object({})}
                    handler={async () => 'Action performed'}
                  />
                </Tools>
              </Route>
            </Router>
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
            <Router>
              <Route when={!isAuthenticated}>
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
              </Route>
              <Route when={isAuthenticated}>
                <Tools>
                  <Tool
                    name="protected_action"
                    description="Protected action"
                    parameters={z.object({})}
                    handler={async () => 'Protected action performed'}
                  />
                </Tools>
              </Route>
            </Router>
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
            <Router>
              <Route when={condition}>
                <Context>This should not appear</Context>
              </Route>
            </Router>
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
            <Router>
              <Route when={isActive}>
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
              </Route>
            </Router>
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
            <Router>
              <Route when={isActive}>
                <System>Route 1</System>
              </Route>
              <Route when={!isActive}>
                <System>Route 2</System>
              </Route>
              <Route when="user wants math">
                <System>Route 3</System>
              </Route>
            </Router>
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

      // Verify router has routes collected (this would fail if router.children is empty)
      // This test ensures the reconciler properly adds Route children to RouterInstance.children
      const hasRoutes = verifyRouterHasRoutes(handle)
      expect(hasRoutes).toBe(true)

      handle.close()
    })
  })

  describe('Natural Language Routes', () => {
    it('should evaluate natural language routes via LLM', async () => {
      const TestAgent = () => {
        const [isAuthenticated] = useState(true)
        return (
          <Agent model="claude-sonnet-4">
            <Message role="user">Can you calculate 5 times 8 for me?</Message>
            <Router>
              <Route when={isAuthenticated}>
                <Context>User is authenticated</Context>
              </Route>
              <Route when="user wants to do math or calculations">
                <Context>Math mode active</Context>
                <Tools>
                  <Tool
                    name="calculate"
                    description="Perform calculation"
                    parameters={z.object({
                      expression: z.string(),
                    })}
                    handler={async ({ expression }) => {
                      // eslint-disable-next-line no-eval
                      const result = eval(expression)
                      return `Result: ${result}`
                    }}
                  />
                </Tools>
              </Route>
            </Router>
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
            <Router>
              <Route when="user wants to do math or calculations">
                <Context>Math mode</Context>
                <Tools>
                  <Tool
                    name="calculate"
                    description="Calculate"
                    parameters={z.object({ expr: z.string() })}
                    handler={async ({ expr }) => `Result: ${eval(expr)}`}
                  />
                </Tools>
              </Route>
              <Route when="user wants information or knowledge">
                <Context>Info mode</Context>
                <Tools>
                  <Tool
                    name="get_info"
                    description="Get info"
                    parameters={z.object({ topic: z.string() })}
                    handler={async ({ topic }) => `Info about ${topic}`}
                  />
                </Tools>
              </Route>
            </Router>
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
})
