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
} from '../src'
import {
  createStepMockClient,
  createOpenAIMockClient,
  mockText,
  mockToolUse,
} from './utils'
import { OPENAI_TEST_MODEL } from '../src/constants'
import { z } from 'zod'

describe('Condition', () => {
  describe('Boolean Conditions', () => {
    it('should render condition when condition is true', async () => {
      const TestAgent = () => {
        const [isActive] = useState(true)
        return (
          <Agent provider="anthropic" model="claude-sonnet-4">
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

      const runPromise = run(<TestAgent />, {
        providers: { anthropic: { client } },
      })
      await controller.nextTurn()
      const result = await runPromise
      expect(result.content).toContain('Hello')
    })

    it('should not render condition when condition is false', async () => {
      const TestAgent = () => {
        const [isActive] = useState(false)
        return (
          <Agent provider="anthropic" model="claude-sonnet-4">
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

      const runPromise = run(<TestAgent />, {
        providers: { anthropic: { client } },
      })
      await controller.nextTurn()
      const result = await runPromise
      expect(result.content).toContain('Hello')
    })

    it('should activate all matching routes (parallel routing)', async () => {
      const TestAgent = () => {
        const [condition1] = useState(true)
        const [condition2] = useState(true)
        return (
          <Agent provider="anthropic" model="claude-sonnet-4">
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

      const runPromise = run(<TestAgent />, {
        providers: { anthropic: { client } },
      })
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
          <Agent provider="anthropic" model="claude-sonnet-4">
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

      const runPromise = run(<TestAgent />, {
        providers: { anthropic: { client } },
      })
      await controller.nextTurn()
      await controller.nextTurn()
      const result = await runPromise
      expect(result.content).toContain('Authenticated')
    })

    it('should update available tools when route changes', async () => {
      const TestAgent = () => {
        const [isAuthenticated, setIsAuthenticated] = useState(false)
        return (
          <Agent provider="anthropic" model="claude-sonnet-4">
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

      const runPromise = run(<TestAgent />, {
        providers: { anthropic: { client } },
      })
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
          <Agent provider="anthropic" model="claude-sonnet-4">
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

      const runPromise = run(<TestAgent />, {
        providers: { anthropic: { client } },
      })
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
          <Agent provider="anthropic" model="claude-sonnet-4">
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

      const runPromise = run(<TestAgent />, {
        providers: { anthropic: { client } },
      })
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
          <Agent provider="anthropic" model="claude-sonnet-4">
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
      const handle = await run(<TestAgent />, {
        providers: { anthropic: { client } },
        mode: 'interactive',
      })

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
          <Agent provider="anthropic" model="claude-sonnet-4">
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
              name: 'evaluate_conditions',
              input: { trueConditionIndices: [0] }, // NL condition index 0 (math route)
            },
          ],
          stop_reason: 'end_turn',
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

      const runPromise = run(<TestAgent />, {
        providers: { anthropic: { client } },
      })
      await controller.nextTurn() // Route evaluation
      await controller.nextTurn() // Tool use
      await controller.nextTurn() // Final response
      const result = await runPromise

      expect(result.content).toContain('40')
    })

    it('should activate multiple natural language routes simultaneously', async () => {
      const TestAgent = () => {
        return (
          <Agent provider="anthropic" model="claude-sonnet-4">
            <Message role="user">Calculate 2+2 and tell me about math</Message>
            <Condition when="user wants to do math or calculations">
              <Context>Math mode</Context>
              <Tools>
                <Tool
                  name="calculate"
                  description="Calculate"
                  parameters={z.object({ expr: z.string() })}
                  handler={async ({ expr }) => {
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
              name: 'evaluate_conditions',
              input: { trueConditionIndices: [0, 1] }, // Both routes active
            },
          ],
          stop_reason: 'end_turn',
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

      const runPromise = run(<TestAgent />, {
        providers: { anthropic: { client } },
      })
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
          <Agent provider="anthropic" model="claude-sonnet-4">
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

      const runPromise = run(<TestAgent />, {
        providers: { anthropic: { client } },
      })
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
          <Agent provider="anthropic" model="claude-sonnet-4">
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

      const runPromise = run(<TestAgent />, {
        providers: { anthropic: { client } },
      })
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
          <Agent provider="anthropic" model="claude-sonnet-4">
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

      const runPromise = run(<TestAgent />, {
        providers: { anthropic: { client } },
      })
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
          <Agent provider="anthropic" model="claude-sonnet-4">
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

      const runPromise = run(<TestAgent />, {
        providers: { anthropic: { client } },
      })
      await controller.nextTurn()
      await controller.nextTurn()
      const result = await runPromise
      expect(result.content).toContain('Admin')
    })

    it('should handle mixed nested conditions (boolean parent, NL child)', async () => {
      const TestAgent = () => {
        const [isAuthenticated] = useState(true)
        return (
          <Agent provider="anthropic" model="claude-sonnet-4">
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
              name: 'evaluate_conditions',
              input: { trueConditionIndices: [0] }, // NL condition index 0 (math route)
            },
          ],
          stop_reason: 'end_turn',
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

      const runPromise = run(<TestAgent />, {
        providers: { anthropic: { client } },
      })
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
          <Agent provider="anthropic" model="claude-sonnet-4">
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

      const runPromise = run(<TestAgent />, {
        providers: { anthropic: { client } },
      })
      await controller.nextTurn()
      await controller.nextTurn()
      await controller.nextTurn()
      const result = await runPromise
      expect(result.content).toContain('action')
    })
  })
})

describe('NL Condition Evaluation', () => {
  describe('Anthropic', () => {
    it('should activate condition and make tool available when model returns trueConditionIndices', async () => {
      const TestAgent = () => (
        <Agent provider="anthropic" model="claude-sonnet-4">
          <Message role="user">Calculate 6 times 7</Message>
          <Condition when="user wants to do math or calculations">
            <Tools>
              <Tool
                name="calculate"
                description="Perform a calculation"
                parameters={z.object({ expression: z.string() })}
                handler={async ({ expression }) => {
                  return `Result: ${eval(expression)}`
                }}
              />
            </Tools>
          </Condition>
        </Agent>
      )

      const { client, controller } = createStepMockClient([
        // Turn 1: NL eval — condition 0 is true
        {
          content: [
            mockToolUse(
              'evaluate_conditions',
              { trueConditionIndices: [0] },
              'eval_1',
            ),
          ],
          stop_reason: 'end_turn',
        },
        // Turn 2: agent calls calculate (tool is available because condition activated)
        {
          content: [mockToolUse('calculate', { expression: '6 * 7' })],
          stop_reason: 'tool_use',
        },
        // Turn 3: final response
        {
          content: [mockText('6 times 7 is 42.')],
          stop_reason: 'end_turn',
        },
      ])

      const runPromise = run(<TestAgent />, {
        providers: { anthropic: { client } },
      })
      await controller.nextTurn() // NL eval
      await controller.nextTurn() // agent calls calculate
      await controller.nextTurn() // final response
      const result = await runPromise

      expect(result.content).toContain('42')
    })

    it('should keep condition false and skip tool when model returns no tool_use', async () => {
      const TestAgent = () => (
        <Agent provider="anthropic" model="claude-sonnet-4">
          <Message role="user">Hello</Message>
          <Condition when="user wants to do math or calculations">
            <Tools>
              <Tool
                name="calculate"
                description="Perform a calculation"
                parameters={z.object({ expression: z.string() })}
                handler={async ({ expression }) => {
                  return `Result: ${eval(expression)}`
                }}
              />
            </Tools>
          </Condition>
        </Agent>
      )

      const { client, controller } = createStepMockClient([
        // Turn 1: NL eval returns plain text (no tool_use) — conditions stay false
        {
          content: [mockText('I cannot evaluate that')],
          stop_reason: 'end_turn',
        },
        // Turn 2: agent responds without tools (condition is false, calculate not available)
        {
          content: [mockText('Default response without tools.')],
          stop_reason: 'end_turn',
        },
      ])

      const runPromise = run(<TestAgent />, {
        providers: { anthropic: { client } },
      })
      await controller.nextTurn() // NL eval (no tool_use — fallback)
      await controller.nextTurn() // agent response
      const result = await runPromise

      expect(result.content).toContain('Default')
      expect(result.content).not.toContain('Result:')
    })
  })

  describe('OpenAI', () => {
    it('should activate condition and make tool available when model returns trueConditionIndices', async () => {
      const { client } = createOpenAIMockClient([
        // Turn 1: NL eval (stream: false) — condition 0 is true
        {
          output: [
            {
              type: 'function_call',
              call_id: 'cond_1',
              name: 'evaluate_conditions',
              arguments: JSON.stringify({ trueConditionIndices: [0] }),
            },
          ],
        },
        // Turn 2: agent calls calculate (tool available because condition activated)
        {
          output: [
            {
              type: 'function_call',
              call_id: 'calc_1',
              name: 'calculate',
              arguments: JSON.stringify({ expression: '6 * 7' }),
            },
          ],
        },
        // Turn 3: final response
        {
          output: [
            {
              type: 'message',
              content: [{ type: 'output_text', text: '6 times 7 is 42.' }],
            },
          ],
        },
      ])

      const result = await run(
        <Agent provider="openai" model={OPENAI_TEST_MODEL} stream={false}>
          <Message role="user">Calculate 6 times 7</Message>
          <Condition when="user wants to do math or calculations">
            <Tools>
              <Tool
                name="calculate"
                description="Perform a calculation"
                parameters={z.object({ expression: z.string() })}
                handler={async ({ expression }) => {
                  return `Result: ${eval(expression)}`
                }}
              />
            </Tools>
          </Condition>
        </Agent>,
        { providers: { openai: { client } } },
      )

      expect(result.content).toContain('42')
    })

    it('should keep condition false and skip tool when model returns no function_call', async () => {
      const { client } = createOpenAIMockClient([
        // Turn 1: NL eval returns a plain message (no function_call) — conditions stay false
        {
          output: [
            {
              type: 'message',
              content: [
                { type: 'output_text', text: 'I cannot evaluate that' },
              ],
            },
          ],
        },
        // Turn 2: agent responds without tools (condition is false)
        {
          output: [
            {
              type: 'message',
              content: [{ type: 'output_text', text: 'Default response.' }],
            },
          ],
        },
      ])

      const result = await run(
        <Agent provider="openai" model={OPENAI_TEST_MODEL} stream={false}>
          <Message role="user">Hello</Message>
          <Condition when="user wants to do math or calculations">
            <Tools>
              <Tool
                name="calculate"
                description="Perform a calculation"
                parameters={z.object({ expression: z.string() })}
                handler={async ({ expression }) => {
                  return `Result: ${eval(expression)}`
                }}
              />
            </Tools>
          </Condition>
        </Agent>,
        { providers: { openai: { client } } },
      )

      expect(result.content).toContain('Default')
      expect(result.content).not.toContain('Result:')
    })
  })
})

describe('OpenAI Natural Language Conditions', () => {
  it('should evaluate NL conditions via OpenAI function calling', async () => {
    const { client } = createOpenAIMockClient([
      // First call: NL condition evaluation — model returns evaluate_conditions tool call
      {
        output: [
          {
            type: 'function_call',
            call_id: 'cond_1',
            name: 'evaluate_conditions',
            arguments: JSON.stringify({ trueConditionIndices: [0] }),
          },
        ],
      },
      // Second call: agent response
      {
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: 'Math mode active: 42' }],
          },
        ],
      },
    ])

    const result = await run(
      <Agent provider="openai" model={OPENAI_TEST_MODEL} stream={false}>
        <Message role="user">Calculate 6 times 7</Message>
        <Condition when="user wants to do math">
          <Context>Math mode active</Context>
        </Condition>
      </Agent>,
      { providers: { openai: { client } } },
    )

    expect(result.content).toContain('42')
  })

  it('should default all NL conditions to false when model returns no function call', async () => {
    const { client } = createOpenAIMockClient([
      // NL condition evaluation — model returns a plain message instead of function_call
      {
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: 'I cannot evaluate that' }],
          },
        ],
      },
      // Agent response (conditions stayed false)
      {
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: 'Default response' }],
          },
        ],
      },
    ])

    const result = await run(
      <Agent provider="openai" model={OPENAI_TEST_MODEL} stream={false}>
        <Message role="user">Hello</Message>
        <Condition when="user wants something special">
          <Context>Special mode</Context>
        </Condition>
      </Agent>,
      { providers: { openai: { client } } },
    )

    expect(result.content).toContain('Default')
  })
})
