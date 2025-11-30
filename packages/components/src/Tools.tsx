import type { ReactNode } from 'react';

export interface ToolsProps {
  children?: ReactNode;
}

/**
 * tools container - groups tools together
 *
 * @example
 * ```tsx
 * <Agent model="claude-sonnet-4-5">
 *   <Tools>
 *     <Tool {...searchTool} />
 *     <Tool {...calculateTool} />
 *     <WebSearch />
 *   </Tools>
 * </Agent>
 * ```
 */
export function Tools({ children }: ToolsProps): ReactNode {
  return <tools>{children}</tools>;
}
