import { Node } from "@babylonjs/core/node";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

// Pinned Babylon 9.25 adapter: the base method invalidates only this node.
// TransformNode's override recursively dirties children, including frozen ones.
const invalidateNode = Node.prototype.markAsDirty;
const stock = [TransformNode, Mesh, InstancedMesh].map((constructor) => ({
  constructor,
  compute: constructor.prototype.computeWorldMatrix,
  world: constructor.prototype.getWorldMatrix,
  dirty: constructor.prototype.markAsDirty,
  // These protected hooks can redirect ancestry or change other transforms.
  parent: (constructor.prototype as unknown as TransformHooks)
    ._getEffectiveParent,
  after: (constructor.prototype as unknown as TransformHooks)
    ._afterComputeWorldMatrix,
  cache: (constructor.prototype as unknown as TransformHooks)._updateCache,
  synced: (constructor.prototype as unknown as TransformHooks)
    ._markSyncedWithParent,
  scaling: (constructor.prototype as unknown as TransformHooks)
    ._updateNonUniformScalingState,
}));
type TransformHooks = {
  _getEffectiveParent: unknown;
  _afterComputeWorldMatrix: unknown;
  _updateCache: unknown;
  _markSyncedWithParent: unknown;
  _updateNonUniformScalingState: unknown;
};

function supported(node: Node): node is TransformNode {
  const methods = stock.find((entry) => node.constructor === entry.constructor);
  if (!methods || !(node instanceof TransformNode)) return false;
  const hooks = node as unknown as TransformHooks;
  if (
    node.computeWorldMatrix !== methods.compute ||
    node.getWorldMatrix !== methods.world ||
    node.markAsDirty !== methods.dirty ||
    hooks._getEffectiveParent !== methods.parent ||
    hooks._afterComputeWorldMatrix !== methods.after ||
    hooks._updateCache !== methods.cache ||
    hooks._markSyncedWithParent !== methods.synced ||
    hooks._updateNonUniformScalingState !== methods.scaling ||
    node.isWorldMatrixFrozen ||
    node.billboardMode !== 0 ||
    node.infiniteDistance ||
    node.onAfterWorldMatrixUpdateObservable.hasObservers()
  )
    return false;
  if (node instanceof Mesh || node instanceof InstancedMesh) {
    if (
      node._masterMesh ||
      node.skeleton ||
      node.morphTargetManager ||
      node.bakedVertexAnimationManager ||
      (node instanceof Mesh && node.hasThinInstances) ||
      node.doNotSyncBoundingInfo
    )
      return false;
  }
  if (
    node instanceof InstancedMesh &&
    (node.sourceMesh.constructor !== Mesh ||
      node.sourceMesh.billboardMode !== 0 ||
      node.sourceMesh.getLODLevels().length > 0)
  )
    return false;
  return true;
}

/** Refresh the complete shadow-fit list, including disabled banks. Rebuild
 * supported nodes once, parent first, without recursively forcing ancestors.
 * Rebuilding unconditionally preserves changes absent from isSynchronized(),
 * such as scalingDeterminant, and bypasses the same-render-ID shortcut. */
export function refreshShadowCasterTransforms(
  casters: readonly AbstractMesh[],
) {
  const visited = new Set<Node>();
  const chain: TransformNode[] = [];
  for (const mesh of casters) {
    if (mesh.isDisposed()) continue;
    chain.length = 0;
    let safe = true;
    for (
      let node: Node | null = mesh;
      node && !visited.has(node);
      node = node.parent
    ) {
      if (!supported(node)) {
        safe = false;
        break;
      }
      chain.push(node);
    }
    if (!safe) {
      mesh.computeWorldMatrix(true);
      // A custom callback can change a previously visited ancestor or sibling.
      visited.clear();
      continue;
    }
    for (let i = chain.length - 1; i >= 0; i--) {
      const node = chain[i];
      invalidateNode.call(node);
      node.computeWorldMatrix();
      visited.add(node);
    }
  }
}
