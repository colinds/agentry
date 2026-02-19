import Anthropic, { type ClientOptions } from '@anthropic-ai/sdk'
import {
  Agent,
  Tool,
  AgentTool,
  System,
  Context,
  Message,
  Tools,
  Condition,
  useExecutionState,
  useMessages,
  useAgentState,
} from './components'
import { WebSearch } from './components/built-ins/WebSearch'
import { CodeExecution } from './components/built-ins/CodeExecution'
import { Memory } from './components/built-ins/Memory'
import { MCP } from './components/MCP'

export function anthropic(options?: ClientOptions): Anthropic {
  return new Anthropic(options)
}

export {
  Agent,
  Tool,
  AgentTool,
  System,
  Context,
  Message,
  Tools,
  Condition,
  WebSearch,
  CodeExecution,
  Memory,
  MCP,
  useExecutionState,
  useMessages,
  useAgentState,
}
export type { AgentResult } from './types'
