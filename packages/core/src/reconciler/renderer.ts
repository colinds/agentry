import { ConcurrentRoot } from 'react-reconciler/constants'
import { reconciler } from './reconciler.ts'
import type { AgentInstance } from '../instances/index.ts'

export interface ContainerInfo {
  container: AgentInstance
  fiber: unknown
}

export function createContainer(agentInstance: AgentInstance): ContainerInfo {
  const createContainerFn = reconciler.createContainer as unknown as (
    ...args: unknown[]
  ) => unknown

  const fiber = createContainerFn(
    agentInstance,
    ConcurrentRoot, // Use ConcurrentRoot for better scheduling and transitions
    null, // hydrationCallbacks
    false, // isStrictMode
    null, // concurrentUpdatesByDefaultOverride
    '', // identifierPrefix
    (error: Error) => console.error('Recoverable error:', error), // onRecoverableError
    null, // transitionCallbacks
  )

  return {
    container: agentInstance,
    fiber,
  }
}

export function updateContainer(
  element: React.ReactNode,
  containerInfo: ContainerInfo,
  callback?: () => void,
): void {
  if (!containerInfo.fiber) {
    throw new Error('Container not initialized')
  }

  reconciler.updateContainer(
    element,
    containerInfo.fiber,
    null, //parentComponent
    callback,
  )
}

export function flushSync<T>(fn: () => T): T {
  // @ts-expect-error - reconciler types are not maintained, using flushSyncFromReconciler
  return reconciler.flushSyncFromReconciler(fn)
}

export function unmountContainer(containerInfo: ContainerInfo): void {
  if (containerInfo.fiber) {
    reconciler.updateContainer(null, containerInfo.fiber, null, () => {
      containerInfo.fiber = null
    })
  }
}
