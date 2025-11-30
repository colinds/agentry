import ReactReconciler from 'react-reconciler';
import { hostConfig } from './hostConfig.ts';
import type { AgentInstance } from '../instances/index.ts';

// create the reconciler (cast to work around type issues with different react-reconciler versions)
export const reconciler = ReactReconciler(hostConfig as unknown as Parameters<typeof ReactReconciler>[0]);

// enable concurrent mode features
reconciler.injectIntoDevTools({
  bundleType: process.env.NODE_ENV === 'production' ? 0 : 1,
  version: '0.0.1',
  rendererPackageName: '@agentry/core',
});

// container info type
export interface ContainerInfo {
  container: AgentInstance;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fiber: unknown;
}

// create a new container for rendering
export function createContainer(agentInstance: AgentInstance): ContainerInfo {
  // createContainer signature varies by react-reconciler version
  // cast the function to accept our arguments
  const createContainerFn = reconciler.createContainer as unknown as (
    ...args: unknown[]
  ) => unknown;

  const fiber = createContainerFn(
    agentInstance,
    0, // LegacyRoot
    null, // hydrationCallbacks
    false, // isStrictMode
    null, // concurrentUpdatesByDefaultOverride
    '', // identifierPrefix
    (error: Error) => console.error('Recoverable error:', error), // onRecoverableError
    null, // transitionCallbacks
  );

  return {
    container: agentInstance,
    fiber,
  };
}

// update the container with new elements
export function updateContainer(
  element: React.ReactNode,
  containerInfo: ContainerInfo,
  callback?: () => void,
): void {
  if (!containerInfo.fiber) {
    throw new Error('Container not initialized');
  }

  reconciler.updateContainer(
    element,
    containerInfo.fiber,
    null, // parentComponent
    callback,
  );
}

// flush sync to ensure all updates are processed
export function flushSync<T>(fn: () => T): T {
  return reconciler.flushSync(fn);
}

// unmount a container
export function unmountContainer(containerInfo: ContainerInfo): void {
  if (containerInfo.fiber) {
    reconciler.updateContainer(null, containerInfo.fiber, null, () => {
      containerInfo.fiber = null;
    });
  }
}
