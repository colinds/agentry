import OpenAI, { type ClientOptions } from 'openai'
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
import { MCP } from './components/MCP'

export function openai(options?: ClientOptions): OpenAI {
  return new OpenAI(options)
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
  MCP,
  useExecutionState,
  useMessages,
  useAgentState,
}
export type { AgentResult } from './types'
