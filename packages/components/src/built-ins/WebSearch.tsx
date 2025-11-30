import type { ReactNode } from 'react';
import type { BetaWebSearchTool20250305 } from '@anthropic-ai/sdk/resources/beta';

export interface WebSearchProps {
  /** maximum number of searches allowed */
  maxUses?: number;
  /** allowed domains for search */
  allowedDomains?: string[];
  /** blocked domains for search */
  blockedDomains?: string[];
  /** user location for localized results */
  userLocation?: {
    city?: string;
    region?: string;
    country?: string;
    timezone?: string;
  };
}

/**
 * WebSearch built-in tool - enables web search capability
 *
 * this uses Anthropic's server-side web search tool
 *
 * @example
 * ```tsx
 * <Agent model="claude-sonnet-4-5">
 *   <Tools>
 *     <WebSearch maxUses={5} />
 *   </Tools>
 * </Agent>
 * ```
 */
export function WebSearch(props: WebSearchProps): ReactNode {
  // build user location with required 'type' field if provided
  const userLocation: BetaWebSearchTool20250305['user_location'] = props.userLocation
    ? {
        type: 'approximate',
        city: props.userLocation.city,
        region: props.userLocation.region,
        country: props.userLocation.country,
        timezone: props.userLocation.timezone,
      }
    : undefined;

  const tool: BetaWebSearchTool20250305 = {
    type: 'web_search_20250305',
    name: 'web_search',
    max_uses: props.maxUses,
    allowed_domains: props.allowedDomains,
    blocked_domains: props.blockedDomains,
    user_location: userLocation,
  };

  return <sdk_tool tool={tool} key="web_search" />;
}
