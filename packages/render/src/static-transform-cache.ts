import { Matrix } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";

/** Immutable authored placements only. Their common parent can move or be hidden;
 * placement/deck edits rebuild the owning loader and dispose this cache. */
export function cacheStaticTransforms(root: TransformNode, meshes: readonly AbstractMesh[]) {
  const scene = root.getScene();
  const inverse = Matrix.Invert(root.computeWorldMatrix(true));
  const entries = meshes.map(mesh => ({
    mesh,
    local: mesh.computeWorldMatrix(true).multiply(inverse),
    world: Matrix.Identity(),
    syncBounds: mesh.doNotSyncBoundingInfo,
  }));
  let previous: Matrix | undefined;
  const refresh = () => {
    const world = root.computeWorldMatrix(true);
    if (previous?.equals(world)) return;
    previous ??= Matrix.Identity();
    previous.copyFrom(world);
    for (const entry of entries) {
      if (entry.mesh.isDisposed()) continue;
      entry.local.multiplyToRef(world, entry.world);
      entry.mesh.freezeWorldMatrix(entry.world);
      // Cached matrices still require world-space pick/frustum/shadow bounds.
      entry.mesh._updateBoundingInfo();
      entry.mesh.doNotSyncBoundingInfo = true;
    }
  };
  refresh();
  const observer = scene.onBeforeRenderObservable.add(refresh);
  return {
    refresh,
    dispose() {
      scene.onBeforeRenderObservable.remove(observer);
      for (const entry of entries) if (!entry.mesh.isDisposed()) {
        entry.mesh.doNotSyncBoundingInfo = entry.syncBounds;
        entry.mesh.unfreezeWorldMatrix();
      }
    },
  };
}
