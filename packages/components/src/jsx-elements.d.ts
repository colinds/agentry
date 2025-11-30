import type {} from 'react';
import type {} from 'react/jsx-runtime';
import type {} from 'react/jsx-dev-runtime';
import type { ReactNode } from 'react';
import type { InternalTool } from '@agentry/core';
import type { BetaToolUnion } from '@anthropic-ai/sdk/resources/beta';
import type { AgentProps } from './Agent.tsx';

// Element type definitions matching our reconciler's ElementType
export interface AgentryElements {
  // Agent element - model is optional for child agents (they inherit from parent)
  agent: Omit<AgentProps, 'model'> & { model?: AgentProps['model']; children?: ReactNode };

  // Tool element
  tool: { tool: InternalTool<any>; key?: string };

  // SDK tool element (WebSearch, etc.)
  sdk_tool: { tool: BetaToolUnion; key?: string };

  // System prompt element
  system: { children: ReactNode; priority?: number };

  // Context element
  context: { children: ReactNode; priority?: number };

  // Message element
  message: { role: 'user' | 'assistant'; children: ReactNode };

  // Tools container element
  tools: { children?: ReactNode };
}

// Extend React's JSX namespace - THE KEY PATTERN
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements extends AgentryElements {}
  }
}

declare module 'react/jsx-runtime' {
  namespace JSX {
    interface IntrinsicElements extends AgentryElements {}
  }
}

declare module 'react/jsx-dev-runtime' {
  namespace JSX {
    interface IntrinsicElements extends AgentryElements {}
  }
}

export {};
