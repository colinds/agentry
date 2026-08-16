/**
 * The pi seam.
 *
 * Every runtime call into `@earendil-works/pi-ai` goes through this directory.
 * Elsewhere in the codebase pi appears only as `import type`, so an upgrade
 * that changes pi's runtime surface has a one-directory blast radius.
 */
export { toAgentStreamEvent } from './events'
export {
  getDefaultModels,
  resetSharedDefaultModels,
  resolveModel,
} from './models'
export { toPiTool, toPiTools } from './tools'
export {
  AgentryContextOverflowError,
  AgentryProviderError,
  createTurn,
} from './turn'
export type { TurnRequest } from './turn'
