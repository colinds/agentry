import { render, Agent, System, Tools, Message } from '@agentry/runtime';

// Example showing manager delegating to specialist subagents
const result = await render(
  <Agent
    model="claude-haiku-4-5"
    name="manager"
    maxTokens={4096}
    temperature={0.7}
  >
    <System>You are a project manager who delegates tasks to specialists.</System>

    <Tools>
      {/* Researcher subagent */}
      <Agent
        name="researcher"
        description="Research specialist who finds information"
      >
        <System>You are a research expert. Provide thorough, accurate information.</System>
      </Agent>

      {/* Coder subagent */}
      <Agent
        name="coder"
        description="Code generation specialist"
        temperature={0.3}  // Override: lower temp for coding
      >
        <System>You are a coding expert. Write clean, production-ready code.</System>
      </Agent>
    </Tools>

    <Message role="user">
      First, research what the capital of France is. Then write a simple JavaScript function that adds two numbers.
    </Message>
  </Agent>
);

console.log('Manager result:', result.content);
console.log('Total usage:', result.usage);
