import { useState } from 'react';
import { z } from 'zod';
import { render, Agent, System, Tools, Tool, Message } from '@agentry/runtime';
import { MODEL } from '@agentry/shared';

interface Subagent {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  temperature?: number;
}

function CreateSubagentTool({
  subagents,
  onCreate,
}: {
  subagents: Subagent[];
  onCreate: (subagent: Omit<Subagent, 'id'>) => void;
}) {
  return (
    <Tool
      name="create_subagent"
      description="Create a new specialist subagent. Requires: name (lowercase with underscores), description (what it does), systemPrompt (full instructions for the subagent)."
      inputSchema={z.object({
        name: z.string().describe('Subagent name in lowercase with underscores, e.g. "tester_agent" (required)'),
        description: z.string().describe('Brief description of what the subagent does (required)'),
        systemPrompt: z.string().describe('Complete system prompt/instructions that define the subagent\'s behavior and expertise (required)'),
        temperature: z.number().min(0).max(2).optional().describe('Temperature 0-2, optional'),
      })}
      handler={async (input) => {
        const { name, description, systemPrompt, temperature } = input;
        
        if (subagents.some((s) => s.name === name)) {
          return `Error: ${name} already exists`;
        }
        if (!/^[a-z][a-z0-9_]*$/.test(name)) {
          return `Error: invalid name format`;
        }

        console.log(`[create_subagent] ${name}: ${description}`);
        onCreate({ name, description, systemPrompt, temperature });
        return `Created ${name}. Use ${name}(task) to call it.`;
      }}
    />
  );
}

function SubagentComponent({ config, parentName }: { config: Subagent; parentName?: string }) {
  const [subagents, setSubagents] = useState<Subagent[]>([]);
  const prefix = parentName ? `${parentName}→${config.name}` : config.name;
  console.log(`[${prefix}] ${subagents.length} subagents`);

  return (
    <Agent name={config.name} description={config.description} temperature={config.temperature}>
      <System>{config.systemPrompt}</System>
      <Tools>
        <CreateSubagentTool
          subagents={subagents}
          onCreate={(subagent) => {
            const prefix = parentName ? `${parentName}→${config.name}` : config.name;
            console.log(`${prefix} Spawning: ${subagent.name}`);
            setSubagents((prev) => [...prev, { ...subagent, id: `${subagent.name}_${Date.now()}` }]);
          }}
        />
        {subagents.map((s) => {
          const fullParentName = parentName ? `${parentName}→${config.name}` : config.name;
          return <SubagentComponent key={s.id} config={s} parentName={fullParentName} />;
        })}
      </Tools>
    </Agent>
  );
}


function Factory() {
  const [subagents, setSubagents] = useState<Subagent[]>([]);

  return (
    <Agent
      model={MODEL}
      maxTokens={2048}
      temperature={0.7}
      stream={true}
      onStepFinish={(result) => {
        console.log(`[factory] Step ${result.stepNumber}:`, {
          subagents: subagents.length,
          text: result.text.substring(0, 100),
          toolCalls: result.toolCalls.map(tc => `${tc.name}(${JSON.stringify(tc.input)})`),
          tokens: result.usage.totalTokens,
        });
      }}
    >
      <System>
        You must create a coder subagent to write code. The coder MUST:
        1. Write the function
        2. Use create_subagent to create a tester subagent
        3. IMMEDIATELY call the tester subagent (use the tool name returned by create_subagent) with the code
        4. Wait for the tester's results
        5. Return both the code and test results

        When creating the coder subagent, give it a system prompt that explicitly states:
        "After creating the tester subagent, you MUST call it using the tool name (e.g., tester_add_numbers(task='...')). Do not end your turn until you have called the tester and received results."

        {subagents.length > 0 && `\n\nCreated: ${subagents.map((s) => s.name).join(', ')}`}
      </System>

      <Tools>
        <CreateSubagentTool
          subagents={subagents}
          onCreate={(subagent) => {
            console.log(`[factory] Spawning: ${subagent.name}`);
            setSubagents((prev) => [...prev, { ...subagent, id: `${subagent.name}_${Date.now()}` }]);
          }}
        />
        {subagents.map((s) => (
          <SubagentComponent key={s.id} config={s} />
        ))}
      </Tools>

      <Message role="user">
        Write a function that adds two numbers. The coder must:
        1. Create a tester subagent using create_subagent
        2. IMMEDIATELY call the tester subagent by its tool name (the name you gave it) with the code as the task
        3. Wait for the tester's response
        4. Return both the code and the actual test results from the tester

        Do not make up test results. You must actually call the tester subagent and use its response.
      </Message>
    </Agent>
  );
}

const result = await render(<Factory />);
console.log(result.content);
console.log('Usage:', result.usage);

