import type Anthropic from '@anthropic-ai/sdk';
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta';
import { createElement  } from 'react';
import {
  createContainer,
  updateContainer,
  unmountContainer,
  ExecutionEngine,
  createAgentStore,
  type SubagentInstance,
  type AgentInstance,
  type AgentResult,
} from '@agentry/core';
import { AgentProvider } from './hooks.ts';

export interface RenderSubagentOptions {
  client: Anthropic;
  signal?: AbortSignal;
  initialMessages?: BetaMessageParam[];
}

/**
 * internal function to render a subagent
 *
 * called from synthetic tool handlers created by the reconciler
 * not intended for direct use - use <Agent> nesting in JSX instead
 */
export async function renderSubagent(
  subagent: SubagentInstance,
  options: RenderSubagentOptions,
): Promise<AgentResult> {
  const { client, signal, initialMessages = [] } = options;

  // create isolated root container from subagent state
  const rootAgent: AgentInstance = {
    type: 'agent',
    props: { ...subagent.props },
    client,
    engine: null,
    systemParts: [...subagent.systemParts],
    tools: [...subagent.tools],
    sdkTools: [...subagent.sdkTools],
    contextParts: [...subagent.contextParts],
    messages: [...subagent.messages, ...initialMessages],
    mcpServers: [...subagent.mcpServers],
    children: [],
    pendingUpdates: subagent.pendingUpdates,
    parent: null,
    _updating: false,
  };

  const containerInfo = createContainer(rootAgent);

  // wire up abort signal from parent
  let abortHandler: (() => void) | undefined;
  if (signal) {
    abortHandler = () => {
      if (rootAgent.engine) {
        rootAgent.engine.abort();
      }
    };
    signal.addEventListener('abort', abortHandler);
  }

  try {
    // build system prompt from collected parts (sorted by priority)
    const sortedSystemParts = [...rootAgent.systemParts].sort(
      (a, b) => b.priority - a.priority,
    );
    const sortedContextParts = [...rootAgent.contextParts].sort(
      (a, b) => b.priority - a.priority,
    );

    // Build system prompt as simple string concatenation
    const allParts = [...sortedSystemParts, ...sortedContextParts];
    const system = allParts.length > 0 
      ? allParts.map((p) => p.content).join('\n\n') 
      : undefined;

    // validate model is present
    if (!rootAgent.props.model) {
      throw new Error(
        `Subagent "${subagent.name}" has no model. ` +
        `Either specify a model on the subagent or ensure the parent agent has a model to inherit.`
      );
    }

    // create store for subagent (isolated from parent)
    const store = createAgentStore();

    // Initialize store with messages before rendering
    if (rootAgent.messages.length > 0) {
      store.setState({ messages: [...rootAgent.messages] });
    }

    // create execution engine with store
    const engine = new ExecutionEngine({
      client,
      model: rootAgent.props.model,
      maxTokens: rootAgent.props.maxTokens ?? 2048,
      system,
      tools: rootAgent.tools,
      sdkTools: rootAgent.sdkTools,
      mcpServers: rootAgent.mcpServers.length > 0 ? rootAgent.mcpServers : undefined,
      messages: rootAgent.messages,
      stream: rootAgent.props.stream ?? false,
      maxIterations: rootAgent.props.maxIterations ?? 5,
      compactionControl: rootAgent.props.compactionControl,
      stopSequences: rootAgent.props.stopSequences,
      temperature: rootAgent.props.temperature,
      agentName: subagent.name,
      agentInstance: rootAgent,
      store,
    });

    rootAgent.engine = engine;

    // Wrap the subagent's React children with AgentProvider
    // Following react-three-fiber's pattern: Provider receives children as a prop
    // This allows components like MessagesLogger to access the subagent's store via useMessages()
    const wrappedElement = createElement(AgentProvider, { store, children: subagent.reactChildren });
    updateContainer(wrappedElement, containerInfo);

    // run to completion
    const result = await engine.run();
    return result;
  } finally {
    // cleanup
    if (signal && abortHandler) {
      signal.removeEventListener('abort', abortHandler);
    }
    unmountContainer(containerInfo);
  }
}
