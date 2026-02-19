import { ConcurrentRoot } from 'react-reconciler/constants'
import { reconciler } from './reconciler'
import type { AgentInstance } from '../instances'

export interface ContainerInfo {
  container: AgentInstance
  fiber: ReturnType<typeof reconciler.createContainer> | null
}

export function createContainer(agentInstance: AgentInstance): ContainerInfo {
  const createContainerFn = reconciler.createContainer as (
    ...args: Array<
      AgentInstance | number | string | boolean | null | ((error: Error) => void)
    >
  ) => ReturnType<typeof reconciler.createContainer>

  const fiber = createContainerFn(
    agentInstance,
    ConcurrentRoot,
    null,
    false,
    null,
    '',
    (error: Error) => console.error('Recoverable error:', error),
    null,
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
