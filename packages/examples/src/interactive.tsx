import { useEffect } from 'react';
import { z } from 'zod';
import { render, defineTool, Agent, System, Tools, Tool, WebSearch } from '@agentry/runtime';
import { MODEL } from '@agentry/shared';

const InteractiveAgent = () => {
  const docsSearchTool = defineTool({
    name: 'search_docs',
    description: 'search through documentation',
    parameters: z.object({
      query: z.string().describe('search query'),
      limit: z.number().optional().default(5).describe('max results'),
    }),
    handler: async ({ query, limit }) => {
      // simulate a docs search
      return `Found ${limit} results for "${query}":\n1. Getting Started\n2. API Reference\n3. Examples`;
    },
  });

  return (
    <Agent model={MODEL} maxTokens={2048} stream={true}>
      <System priority={1000}>You are a helpful assistant with access to documentation and web search.</System>
      <Tools>
        <Tool {...docsSearchTool} />
        <WebSearch maxUses={3} />
      </Tools>
    </Agent>
  )
}

// run in interactive mode
const agent = await render(
  <InteractiveAgent />,
  { mode: 'interactive' },
);

// stream first question
const question1 = 'What frameworks are popular for building React apps?';
console.log(`User: ${question1}\n`);
console.log('Assistant: ');

for await (const event of agent.stream(question1)) {
  if (event.type === 'text') {
    process.stdout.write(event.text);
  }
}

console.log('\n\n---\n');

// stream follow-up
const question2 = 'Can you search the docs for more info on state management?';
console.log(`User: ${question2}\n`);
console.log('Assistant: ');

for await (const event of agent.stream(question2)) {
  if (event.type === 'text') {
    process.stdout.write(event.text);
  }
}

console.log('\nConversation completed!');
agent.close();
