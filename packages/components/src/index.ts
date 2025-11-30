// Import type definitions to ensure they're included
import './jsx-elements.d.ts';

// core components
export { Agent, type AgentProps } from './Agent.tsx';
export { Tool, type ToolProps } from './Tool.tsx';
export { System, type SystemProps } from './System.tsx';
export { Context, type ContextProps } from './Context.tsx';
export { Message, type MessageProps } from './Message.tsx';
export { Tools, type ToolsProps } from './Tools.tsx';

// built-in tools
export { WebSearch, type WebSearchProps } from './built-ins/WebSearch.tsx';

// MCP server connection
export { MCP, type MCPProps } from './MCP.tsx';

// re-export core utilities for convenience
export { defineTool } from '@agentry/core';

// re-export element types for advanced use
export type { AgentryElements } from './jsx-elements.d.ts';
