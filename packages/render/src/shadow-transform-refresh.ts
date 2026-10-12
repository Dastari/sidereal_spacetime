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
  synchronized: constructor.prototype.isSynchronized,
  localSynchronized: constructor.prototype._isSynchronized,
  parentSynchronized: constructor.prototype.isSynchronizedWithParent,
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

function supported(
  node: Node,
  allowLiveFallback = false,
): node is TransformNode {
  const methods = stock.find((entry) => node.constructor === entry.constructor);
  if (!methods || !(node instanceof TransformNode)) return false;
  const hooks = node as unknown as TransformHooks;
  if (
    node.computeWorldMatrix !== methods.compute ||
    node.getWorldMatrix !== methods.world ||
    node.markAsDirty !== methods.dirty ||
    node.isSynchronized !== methods.synchronized ||
    node._isSynchronized !== methods.localSynchronized ||
    node.isSynchronizedWithParent !== methods.parentSynchronized ||
    hooks._getEffectiveParent !== methods.parent ||
    hooks._afterComputeWorldMatrix !== methods.after ||
    hooks._updateCache !== methods.cache ||
    hooks._markSyncedWithParent !== methods.synced ||
    hooks._updateNonUniformScalingState !== methods.scaling ||
    (!allowLiveFallback && node.isWorldMatrixFrozen) ||
    node.billboardMode !== 0 ||
    node.infiniteDistance ||
    node.onAfterWorldMatrixUpdateObservable.hasObservers()
  )
    return false;
  if (node instanceof Mesh || node instanceof InstancedMesh) {
    if (
      node._masterMesh ||
      (!allowLiveFallback &&
        (node.skeleton ||
          node.morphTargetManager ||
          node.bakedVertexAnimationManager)) ||
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

/** One synchronous preparation phase. Force the first supported ancestry
 * refresh, even in the same render ID. Custom callbacks clear the memo. */
export function createOwnedTransformRefresh() {
  const visited = new Set<Node>();
  const chain: TransformNode[] = [];
  return (mesh: Node) => {
    if (mesh.isDisposed()) return;
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
      return;
    }
    for (let i = chain.length - 1; i >= 0; i--) {
      const node = chain[i];
      invalidateNode.call(node);
      node.computeWorldMatrix();
      visited.add(node);
    }
  };
}

/** Refresh the complete shadow-fit list, including disabled banks. */
export function refreshShadowCasterTransforms(
  casters: readonly AbstractMesh[],
) {
  const refresh = createOwnedTransformRefresh();
  for (const mesh of casters) refresh(mesh);
}

type OwnedBank = { root: TransformNode; revision: number; disposed: boolean };
const ownedBanks = new WeakMap<AbstractMesh, OwnedBank>();
const boundMethods = [Mesh, InstancedMesh].map((constructor) => ({
  constructor,
  get: constructor.prototype.getBoundingInfo,
  update: constructor.prototype._updateBoundingInfo,
  sub: constructor.prototype._updateSubMeshesBoundingInfo,
}));

/** Producer contract: these meshes have fixed local transforms/ancestry under
 * root. The producer must invalidate BEFORE changing those values or replacing
 * bounds; supported geometry API updates automatically invalidate. No metadata
 * or arbitrary scene mesh is inferred to satisfy this ownership contract. */
export function registerOwnedShadowCasterBank(
  root: TransformNode,
  meshes: readonly Mesh[],
) {
  if (!meshes.length || meshes.some((m) => m.parent !== root || !supported(m)))
    throw new Error(
      "Owned shadow bank requires stock rigid children of its root",
    );
  const bank: OwnedBank = { root, revision: 0, disposed: false };
  const restores: (() => void)[] = [];
  const members = new Set(meshes);
  const invalidate = () => {
    if (!bank.disposed) bank.revision++;
  };
  const release = () => {
    if (bank.disposed) return;
    bank.disposed = true;
    root.onDisposeObservable.remove(rootDisposed);
    for (const restore of restores) restore();
    for (const mesh of members)
      if (ownedBanks.get(mesh) === bank) ownedBanks.delete(mesh);
    members.clear();
  };
  const rootDisposed = root.onDisposeObservable.addOnce(release);
  for (const mesh of meshes) {
    if (ownedBanks.has(mesh)) {
      release();
      throw new Error("Shadow bank already registered");
    }
    ownedBanks.set(mesh, bank);
    const disposed = mesh.onDisposeObservable.addOnce(() => {
      if (ownedBanks.get(mesh) === bank) ownedBanks.delete(mesh);
      members.delete(mesh);
      invalidate();
      if (!members.size) release();
    });
    restores.push(() => mesh.onDisposeObservable.remove(disposed));
  }
  for (const geometry of new Set(
    meshes.map((m) => m.geometry).filter((g) => !!g),
  )) {
    const previous = geometry.onGeometryUpdated;
    const callback: typeof previous = (...args) => {
      invalidate();
      previous?.(...args);
    };
    geometry.onGeometryUpdated = callback;
    restores.push(() => {
      if (geometry.onGeometryUpdated === callback)
        geometry.onGeometryUpdated = previous;
    });
  }
  return { invalidate, dispose: release };
}

/** One shadow owner. Root matrix comparison is per producer-owned bank, never
 * a full per-leaf fingerprint. Unowned actors keep forced preparation. Unknown
 * callback paths restore the original ordered phase and discard bank history. */
export function createShadowCasterTransformCache() {
  let history = new WeakMap<
    OwnedBank,
    {
      values: Float64Array;
      revision: number;
      token: object;
      determinant: number;
    }
  >();
  const prepared = new WeakMap<AbstractMesh, object>();
  const determinants = new WeakMap<Node, number>();
  return {
    update(casters: readonly AbstractMesh[]) {
      const banks = new Set<OwnedBank>();
      for (const mesh of casters) {
        const bank = ownedBanks.get(mesh);
        if (bank && !bank.disposed && !mesh.isDisposed()) banks.add(bank);
      }
      if (!banks.size) {
        refreshShadowCasterTransforms(casters);
        return;
      }
      // Moving/content-changing banks use the original phase immediately.
      // Inspect only a few owned roots here; avoid leaf qualification overhead
      // on frames where nothing could be skipped.
      let moving = false;
      for (const bank of banks) {
        for (let node: Node | null = bank.root; node; node = node.parent) {
          if (!supported(node, true)) {
            history = new WeakMap();
            refreshShadowCasterTransforms(casters);
            return;
          }
          const raw = node as unknown as {
            _isDirty: boolean;
            _position: { _isDirty: boolean };
            _rotation: { _isDirty: boolean };
            _scaling: { _isDirty: boolean };
            _rotationQuaternion?: { _isDirty: boolean };
            scalingDeterminant: number;
          };
          moving ||=
            raw._isDirty ||
            raw._position._isDirty ||
            raw._rotation._isDirty ||
            raw._scaling._isDirty ||
            !!raw._rotationQuaternion?._isDirty ||
            determinants.get(node) !== raw.scalingDeterminant;
        }
        const previous = history.get(bank),
          matrix = bank.root.worldMatrixFromCache.m;
        moving ||= !previous || previous.revision !== bank.revision;
        if (previous)
          for (let i = 0; i < 16; i++)
            moving ||= !Object.is(matrix[i], previous.values[i]);
      }
      if (moving) {
        refreshShadowCasterTransforms(casters);
        for (const bank of banks) {
          const values = Float64Array.from(bank.root.worldMatrixFromCache.m),
            token = {};
          history.set(bank, {
            values,
            revision: bank.revision,
            determinant: bank.root.scalingDeterminant,
            token,
          });
          for (
            let node: TransformNode | null = bank.root;
            node;
            node = node.parent as TransformNode | null
          )
            determinants.set(node, node.scalingDeterminant);
        }
        return;
      }
      // Check the existing stock callback boundary, including live crew, before
      // skipping any cohort. No new getter/fingerprint traversal is introduced.
      const seen = new Set<Node>();
      for (const mesh of casters) {
        if (mesh.isDisposed()) continue;
        for (
          let node: Node | null = mesh;
          node && !seen.has(node);
          node = node.parent
        ) {
          const bounds = boundMethods.find(
            (entry) => node.constructor === entry.constructor,
          );
          if (
            !supported(node, true) ||
            (bounds &&
              ((node as AbstractMesh).getBoundingInfo !== bounds.get ||
                (node as AbstractMesh)._updateBoundingInfo !== bounds.update ||
                (node as AbstractMesh)._updateSubMeshesBoundingInfo !==
                  bounds.sub))
          ) {
            history = new WeakMap();
            refreshShadowCasterTransforms(casters);
            return;
          }
          seen.add(node);
        }
      }
      const refresh = createOwnedTransformRefresh(),
        dirty = new Set<OwnedBank>();
      for (const bank of banks) {
        let previous = history.get(bank);
        let stale = !previous || previous.revision !== bank.revision;
        for (
          let node: TransformNode | null = bank.root;
          node;
          node = node.parent as TransformNode | null
        ) {
          stale ||=
            !node.isSynchronized() ||
            determinants.get(node) !== node.scalingDeterminant;
        }
        if (stale) refresh(bank.root);
        for (
          let node: TransformNode | null = bank.root;
          node;
          node = node.parent as TransformNode | null
        )
          determinants.set(node, node.scalingDeterminant);
        const matrix = bank.root.worldMatrixFromCache.m;
        let changed = !previous || previous.revision !== bank.revision;
        if (previous)
          for (let i = 0; i < 16; i++)
            changed ||= !Object.is(matrix[i], previous.values[i]);
        if (changed) dirty.add(bank);
        if (!previous) {
          previous = {
            values: new Float64Array(16),
            revision: bank.revision,
            token: {},
            determinant: bank.root.scalingDeterminant,
          };
          history.set(bank, previous);
        }
        if (changed) previous.token = {};
        for (let i = 0; i < 16; i++) previous.values[i] = matrix[i];
        previous.revision = bank.revision;
        previous.determinant = bank.root.scalingDeterminant;
      }
      if (dirty.size === banks.size) {
        refreshShadowCasterTransforms(casters);
        for (const mesh of casters) {
          const bank = ownedBanks.get(mesh);
          const token = bank && history.get(bank)?.token;
          if (token) prepared.set(mesh, token);
        }
        return;
      }
      for (const mesh of casters) {
        const bank = ownedBanks.get(mesh);
        const token = bank && history.get(bank)?.token;
        if (
          !bank ||
          bank.disposed ||
          dirty.has(bank) ||
          prepared.get(mesh) !== token
        ) {
          refresh(mesh);
          if (token) prepared.set(mesh, token);
        }
      }
    },
    dispose() {
      history = new WeakMap();
    },
  };
}
