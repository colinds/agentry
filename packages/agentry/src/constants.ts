export const ANTHROPIC_TEST_MODEL = 'claude-3-5-haiku-20241022'
export const OPENAI_TEST_MODEL = 'gpt-5-mini'

/**
 * Anthropic API beta feature flags
 *
 * These are passed via the `betas` parameter to enable beta features.
 * See: https://docs.anthropic.com/en/api/versioning#beta-versions
 */
export const ANTHROPIC_BETAS = {
  /** MCP connector for remote tool servers */
  MCP_CLIENT: 'mcp-client-2025-11-20',
  /** Code execution tool for running Bash commands and file operations */
  CODE_EXECUTION: 'code-execution-2025-08-25',
  /** Context management for memory tool */
  CONTEXT_MANAGEMENT: 'context-management-2025-06-27',
  /** Structured outputs for strict tool schemas */
  STRUCTURED_OUTPUTS: 'structured-outputs-2025-11-13',
  /** Interleaved thinking for thinking blocks interleaved with tool calls */
  INTERLEAVED_THINKING: 'interleaved-thinking-2025-05-14',
} as const
