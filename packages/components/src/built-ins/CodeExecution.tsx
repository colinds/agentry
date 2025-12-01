import type { ReactNode } from 'react'
import type { CodeExecutionTool } from '@agentry/core'

/**
 * CodeExecution built-in tool - enables code execution capability
 *
 * This uses Anthropic's server-side code execution tool, which allows Claude
 * to run Bash commands and manipulate files in a secure, sandboxed environment.
 *
 * The code execution tool requires the `code-execution-2025-08-25` beta header,
 * which is automatically added when this component is used.
 *
 * @example
 * ```tsx
 * <Agent model="claude-sonnet-4-5">
 *   <Tools>
 *     <CodeExecution />
 *   </Tools>
 * </Agent>
 * ```
 */
export function CodeExecution(): ReactNode {
  const tool: CodeExecutionTool = {
    type: 'code_execution_20250825',
    name: 'code_execution',
  }

  return <sdk_tool tool={tool} key="code_execution" />
}
