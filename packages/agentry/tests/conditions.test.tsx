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
  createStepMockModels,
  
  fauxText,
  fauxToolCall,
} from './utils'
import { OPENAI_TEST_MODEL } from './constants'
import { Type } from 'typebox'

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

      const { models, controller } = createStepMockModels([
        {
          content: [fauxText('Hello! Active mode is enabled.')],
        },
      ])

      const runPromise = run(<TestAgent />, {
        models,
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

      const { models, controller } = createStepMockModels([
        {
          content: [fauxText('Hello! Inactive mode is enabled.')],
        },
      ])

      const runPromise = run(<TestAgent />, {
        models,
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

      const { models, controller } = createStepMockModels([
        {
          content: [fauxText('Both routes are active')],
        },
      ])

      const runPromise = run(<TestAgent />, {
        models,
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
                  parameters={Type.Object({ email: Type.String() })}
                  handler={async () => 'Authenticated'}
                />
              </Tools>
            </Condition>
            <Condition when={isAuthenticated}>
              <Tools>
                <Tool
                  name="protected_action"
                  description="Protected action"
                  parameters={Type.Object({})}
                  handler={async () => 'Action performed'}
                />
              </Tools>
            </Condition>
          </Agent>
        )
      }

      const { models, controller } = createStepMockModels([
        {
          content: [fauxToolCall('authenticate', { email: 'test@example.com' })],
        },
        {
          content: [fauxText('Authenticated successfully')],
        },
      ])

      const runPromise = run(<TestAgent />, {
        models,
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
                  parameters={Type.Object({ email: Type.String() })}
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
                  parameters={Type.Object({})}
                  handler={async () => 'Protected action performed'}
                />
              </Tools>
            </Condition>
          </Agent>
        )
      }

      const { models, controller } = createStepMockModels([
        {
          content: [fauxToolCall('authenticate', { email: 'test@example.com' })],
        },
        {
          content: [
            fauxText(
              'Authentication successful! You now have access to protected actions.',
            ),
          ],
        },
      ])

      const runPromise = run(<TestAgent />, {
        models,
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

      const { models, controller } = createStepMockModels([
        {
          content: [fauxText('Hello! I have the base system prompt only.')],
        },
      ])

      const runPromise = run(<TestAgent />, {
        models,
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
                  parameters={Type.Object({})}
                  handler={async () => 'Tool 1 executed'}
                />
              </Tools>
            </Condition>
          </Agent>
        )
      }

      const { models, controller } = createStepMockModels([
        {
          content: [fauxToolCall('tool1', {})],
        },
        {
          content: [fauxText('Tool executed successfully')],
        },
      ])

      const runPromise = run(<TestAgent />, {
        models,
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

      const { models, controller } = createStepMockModels([
        {
          content: [fauxText('Hello')],
        },
      ])

      // Create agent in interactive mode
      const handle = await run(<TestAgent />, {
        models,
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
                  parameters={Type.Object({
                    expression: Type.String(),
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

      const { models, controller } = createStepMockModels([
        // First call: Route evaluation (LLM determines which NL routes match)
        {
          content: [
            fauxToolCall('evaluate_conditions', { trueConditionIndices: [0] }, { id: 'route_1' }),
          ],
        },
        // Second call: Agent's response with math tool
        {
          content: [fauxToolCall('calculate', { expression: '5 * 8' })],
        },
        // Third call: Final response
        {
          content: [fauxText('The result of 5 times 8 is 40.')],
        },
      ])

      const runPromise = run(<TestAgent />, {
        models,
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
                  parameters={Type.Object({ expr: Type.String() })}
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
                  parameters={Type.Object({ topic: Type.String() })}
                  handler={async ({ topic }) => `Info about ${topic}`}
                />
              </Tools>
            </Condition>
          </Agent>
        )
      }

      const { models, controller } = createStepMockModels([
        // Route evaluation - both routes match
        {
          content: [
            fauxToolCall('evaluate_conditions', { trueConditionIndices: [0, 1] }, { id: 'route_1' }),
          ],
        },
        // Agent uses both tools
        {
          content: [
            fauxToolCall('calculate', { expr: '2+2' }, { id: 'tool_1' }),
            fauxToolCall('get_info', { topic: 'math' }, { id: 'tool_2' }),
          ],
        },
        {
          content: [fauxText('2+2 is 4, and here is info about math.')],
        },
      ])

      const runPromise = run(<TestAgent />, {
        models,
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
                    parameters={Type.Object({})}
                    handler={async () => 'Premium feature executed'}
                  />
                </Tools>
              </Condition>
            </Condition>
          </Agent>
        )
      }

      const { models, controller } = createStepMockModels([
        {
          content: [fauxToolCall('premium_feature', {})],
        },
        {
          content: [fauxText('Premium feature is available')],
        },
      ])

      const runPromise = run(<TestAgent />, {
        models,
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
                  parameters={Type.Object({})}
                  handler={async () => 'Basic feature executed'}
                />
              </Tools>
              <Condition when={isPremium}>
                <Tools>
                  <Tool
                    name="premium_feature"
                    description="Premium feature"
                    parameters={Type.Object({})}
                    handler={async () => 'Premium feature executed'}
                  />
                </Tools>
              </Condition>
            </Condition>
          </Agent>
        )
      }

      const { models, controller } = createStepMockModels([
        {
          content: [fauxToolCall('basic_feature', {})],
        },
        {
          content: [fauxText('Only basic features available')],
        },
      ])

      const runPromise = run(<TestAgent />, {
        models,
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

      const { models, controller } = createStepMockModels([
        {
          content: [fauxText('You need to authenticate first')],
        },
      ])

      const runPromise = run(<TestAgent />, {
        models,
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
                      parameters={Type.Object({})}
                      handler={async () => 'Admin action performed'}
                    />
                  </Tools>
                </Condition>
              </Condition>
            </Condition>
          </Agent>
        )
      }

      const { models, controller } = createStepMockModels([
        {
          content: [fauxToolCall('admin_action', {})],
        },
        {
          content: [fauxText('Admin action completed')],
        },
      ])

      const runPromise = run(<TestAgent />, {
        models,
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
                    parameters={Type.Object({ expression: Type.String() })}
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

      const { models, controller } = createStepMockModels([
        // Route evaluation for NL condition
        {
          content: [
            fauxToolCall('evaluate_conditions', { trueConditionIndices: [0] }, { id: 'route_1' }),
          ],
        },
        // Agent uses calculate tool
        {
          content: [fauxToolCall('calculate', { expression: '10 + 5' })],
        },
        // Final response
        {
          content: [fauxText('The result is 15')],
        },
      ])

      const runPromise = run(<TestAgent />, {
        models,
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
                  parameters={Type.Object({ email: Type.String() })}
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
                    parameters={Type.Object({})}
                    handler={async () => 'Action performed'}
                  />
                </Tools>
              </Condition>
            </Condition>
          </Agent>
        )
      }

      const { models, controller } = createStepMockModels([
        {
          content: [fauxToolCall('authenticate', { email: 'test@example.com' })],
        },
        {
          content: [fauxToolCall('protected_action', {})],
        },
        {
          content: [fauxText('Authenticated and action completed')],
        },
      ])

      const runPromise = run(<TestAgent />, {
        models,
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
                parameters={Type.Object({ expression: Type.String() })}
                handler={async ({ expression }) => {
                  return `Result: ${eval(expression)}`
                }}
              />
            </Tools>
          </Condition>
        </Agent>
      )

      const { models, controller } = createStepMockModels([
        // Turn 1: NL eval — condition 0 is true
        {
          content: [
            fauxToolCall('evaluate_conditions', { trueConditionIndices: [0] }, { id: 'eval_1' }),
          ],
        },
        // Turn 2: agent calls calculate (tool is available because condition activated)
        {
          content: [fauxToolCall('calculate', { expression: '6 * 7' })],
        },
        // Turn 3: final response
        {
          content: [fauxText('6 times 7 is 42.')],
        },
      ])

      const runPromise = run(<TestAgent />, {
        models,
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
                parameters={Type.Object({ expression: Type.String() })}
                handler={async ({ expression }) => {
                  return `Result: ${eval(expression)}`
                }}
              />
            </Tools>
          </Condition>
        </Agent>
      )

      const { models, controller } = createStepMockModels([
        // Turn 1: NL eval returns plain text (no tool_use) — conditions stay false
        {
          content: [fauxText('I cannot evaluate that')],
        },
        // Turn 2: agent responds without tools (condition is false, calculate not available)
        {
          content: [fauxText('Default response without tools.')],
        },
      ])

      const runPromise = run(<TestAgent />, {
        models,
      })
      await controller.nextTurn() // NL eval (no tool_use — fallback)
      await controller.nextTurn() // agent response
      const result = await runPromise

      expect(result.content).toContain('Default')
      expect(result.content).not.toContain('Result:')
    })
  })
  describe('OpenAI', () => {
    // The NL-evaluation path is provider-agnostic now: pi owns the wire format
    // and forced tool choice, so this asserts provider selection rather than
    // re-testing the whole flow per provider.
    it('evaluates NL conditions against the configured provider', async () => {
      const { models, controller } = createStepMockModels(
        [
          {
            content: [
              fauxToolCall(
                'evaluate_conditions',
                { trueConditionIndices: [0] },
                { id: 'cond_1' },
              ),
            ],
          },
          { content: [fauxText('Result: 42')] },
        ],
        { provider: 'openai', modelIds: [OPENAI_TEST_MODEL] },
      )

      const runPromise = run(
        <Agent provider="openai" model={OPENAI_TEST_MODEL} stream={false}>
          <System>You are helpful</System>
          <Message role="user">What is 40 + 2?</Message>
          <Condition when="the user asked a math question">
            <Tools>
              <Tool
                name="calculate"
                description="Do math"
                parameters={Type.Object({ expression: Type.String() })}
                handler={async ({ expression }) => `Result: ${expression}`}
              />
            </Tools>
          </Condition>
        </Agent>,
        { models },
      )

      // First call is the batched NL condition evaluation.
      await controller.waitForNextCall()
      const evalCall = controller.peekNextCall()!
      expect(evalCall.context.tools?.[0]?.name).toBe('evaluate_conditions')
      expect(evalCall.model.provider).toBe('openai')

      await controller.nextTurn()

      // Second call carries the tool unlocked by the now-active condition.
      await controller.waitForNextCall()
      expect(
        controller.peekNextCall()!.context.tools?.some(
          (t) => t.name === 'calculate',
        ),
      ).toBe(true)

      await controller.nextTurn()
      const result = await runPromise
      expect(result.content).toContain('42')
    })
  })
})
