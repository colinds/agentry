import { render, Agent, System, Tools, Message, useMessages } from '@agentry/runtime';
import { MODEL } from '@agentry/shared';

function ResearcherAgent() {
  const messages = useMessages();
  console.log(`[Researcher] Subagent has ${messages.length} messages: ${JSON.stringify(messages)}`);
  
  return (
    <Agent
      name="researcher"
      description="Research specialist who finds information"
    >
      <System>You are a research expert. Provide thorough, accurate information.</System>
    </Agent>
  );
}

function CoderAgent() {
  const messages = useMessages();
  console.log(`[Coder] Subagent has ${messages.length} messages: ${JSON.stringify(messages)}`);
  
  return (
    <Agent
      name="coder"
      description="Code generation specialist"
      temperature={0.3}  // Override: lower temp for coding
    >
      <System>You are a coding expert. Write clean, production-ready code.</System>
    </Agent>
  );
}

const result = await render(
  <Agent
    model={MODEL}
    name="manager"
    maxTokens={4096}
    temperature={0.7}
  >
    <System>You are a project manager who delegates tasks to specialists.</System>

    <Tools>
      <ResearcherAgent />
      <CoderAgent />
    </Tools>

    <Message role="user">
      First, research what the capital of France is. Then write a simple JavaScript function that adds two numbers.
    </Message>
  </Agent>
);

console.log('Manager result:', result.content);
console.log('Total usage:', result.usage);
