import { z } from 'zod';
import { render, defineTool, Agent, System, Tools, Tool, WebSearch } from '@agentry/runtime';

// define a search tool
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

// run in interactive mode
const agent = await render(
  <Agent model="claude-haiku-4-5" maxTokens={2048} stream={true}>
    <System priority={1000}>You are a helpful assistant with access to documentation and web search.</System>
    <Tools>
      <Tool {...docsSearchTool} />
      <WebSearch maxUses={3} />
    </Tools>
  </Agent>,
  { mode: 'interactive' },
);

// stream first question
console.log('User: What frameworks are popular for building React apps?\n');
console.log('Assistant: ');

for await (const event of agent.stream()) {
  if (event.type === 'text') {
    process.stdout.write(event.text);
  }
}

console.log('\n\n---\n');

// send follow-up
await agent.sendMessage('Can you search the docs for more info on state management?');

console.log('\nConversation completed!');
agent.close();
