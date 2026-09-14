import { setMeshRole } from "./mesh-roles";
import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import { createSelectionSilhouette } from "./selection-silhouette";

/** Shared-geometry mask proxies keep per-placement selection independent of
 * hardware instance batching. They never enter the visible camera layer or picks.
 * Original native materials, geometry and stable placement IDs remain untouched. */
export function createLayoutSelection(scene: Scene) {
  let sources: AbstractMesh[] = [];
  let proxies: Mesh[] = [];
  let matrixFlags: number[] = [];
  let disposed = false;
  function refreshTransforms() {
    for (let i = 0; i < sources.length; i++) {
      const matrix = sources[i].computeWorldMatrix();
      if (matrixFlags[i] !== matrix.updateFlag) {
        proxies[i].freezeWorldMatrix(matrix.clone());
        matrixFlags[i] = matrix.updateFlag;
      }
    }
  }
  // Dragging moves the local preview node before the document edit commits.
  const frame = scene.onBeforeRenderObservable.add(refreshTransforms);
  let effect: ReturnType<typeof createSelectionSilhouette> | undefined;
  function clear() {
    effect?.dispose();
    effect = undefined;
    for (const proxy of proxies) proxy.dispose();
    proxies = [];
    sources = [];
    matrixFlags = [];
  }
  return {
    update(meshes: AbstractMesh[], selected: string) {
      if (disposed) return;
      const visible = meshes.filter(
        (m) => m.isEnabled() && m.isVisible && m.visibility > 0,
      );
      if (!selected || !visible.some((m) => m.metadata?.partId === selected)) {
        clear();
        return;
      }
      if (
        visible.length !== sources.length ||
        visible.some((m, i) => m !== sources[i])
      ) {
        clear();
        sources = visible;
        proxies = sources.map((source) => {
          const geometry =
            source instanceof Mesh
              ? source.geometry
              : (source as InstancedMesh).sourceMesh?.geometry;
          const proxy = new Mesh(
            `layout-selection-mask-${source.uniqueId}`,
            scene,
          );
          setMeshRole(proxy, "proxy");
          geometry?.applyToMesh(proxy);
          proxy.material = source.material;
          proxy.metadata = { partId: source.metadata?.partId, role: "proxy" };
          proxy.layerMask = 0;
          proxy.isPickable = false;
          proxy.freezeWorldMatrix(source.computeWorldMatrix(true).clone());
          return proxy;
        });
        refreshTransforms();
        effect = createSelectionSilhouette(scene, proxies, selected);
      } else {
        refreshTransforms();
        effect?.select(selected);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clear();
      scene.onBeforeRenderObservable.remove(frame);
    },
  };
}
