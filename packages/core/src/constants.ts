/**
 * Anthropic API beta feature flags
 * 
 * These are passed via the `betas` parameter to enable beta features.
 * See: https://docs.anthropic.com/en/api/versioning#beta-versions
 */
export const ANTHROPIC_BETAS = {
  /** MCP connector for remote tool servers */
  MCP_CLIENT: 'mcp-client-2025-11-20',
} as const;

export type AnthropicBeta = (typeof ANTHROPIC_BETAS)[keyof typeof ANTHROPIC_BETAS];

