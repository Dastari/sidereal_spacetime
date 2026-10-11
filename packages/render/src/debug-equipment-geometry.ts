import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import {
  isAuthoredEquipmentRole,
  type AuthoredRange,
} from "./prefab-ship/wayfarer-authored-study";

/** A debug-only index overlay. Default batches/channels/materials remain intact.
 * Mixed batches retain structure; pure contents are suppressed as ordinary nodes.
 * Logical placement ranges stay original for accepted edit and collision owners. */
export function createEquipmentGeometryOverride(scene: Scene) {
  const hidden = new Map<
    Mesh,
    {
      geometry: Mesh["geometry"];
      original: number[];
      masked: ReturnType<Mesh["getIndices"]>;
    }
  >();
  const restore = () => {
    for (const [mesh, state] of hidden)
      if (
        !mesh.isDisposed() &&
        mesh.geometry === state.geometry &&
        mesh.getIndices() === state.masked
      )
        mesh.setIndices(state.original);
    hidden.clear();
  };
  return {
    restore,
    apply(enabled: boolean) {
      if (enabled) {
        restore();
        return;
      }
      const meshes = scene.meshes ?? [];
      for (const [mesh, state] of hidden) {
        if (
          mesh.isDisposed() ||
          mesh.geometry !== state.geometry ||
          mesh.getIndices() !== state.masked
        )
          hidden.delete(mesh);
        else if (!meshes.includes(mesh)) {
          mesh.setIndices(state.original);
          hidden.delete(mesh);
        }
      }
      for (const mesh of meshes) {
        if (
          !(mesh instanceof Mesh) ||
          hidden.has(mesh) ||
          !mesh.geometry ||
          mesh.geometry.meshes.length !== 1
        )
          continue;
        const ranges = mesh.metadata?.authoredStudy?.placementRanges as
          AuthoredRange[] | undefined;
        const indices = mesh.getIndices();
        if (!Array.isArray(ranges) || !ranges.length || !indices) continue;
        let cursor = 0,
          contents = 0,
          valid = true;
        for (const range of ranges) {
          if (
            !range ||
            range.indexStart !== cursor ||
            !Number.isSafeInteger(range.indexCount) ||
            range.indexCount <= 0 ||
            range.indexCount % 3 !== 0
          ) {
            valid = false;
            break;
          }
          cursor += range.indexCount;
          if (isAuthoredEquipmentRole(range.role)) contents++;
        }
        // Unknown/partial metadata fails open. Pure batches use their node flag.
        if (
          !valid ||
          cursor !== indices.length ||
          !contents ||
          contents === ranges.length
        )
          continue;
        const original = Array.from(indices),
          visible: number[] = [];
        for (const range of ranges)
          if (!isAuthoredEquipmentRole(range.role))
            for (
              let i = range.indexStart;
              i < range.indexStart + range.indexCount;
              i++
            )
              visible.push(original[i]);
        mesh.setIndices(visible);
        hidden.set(mesh, {
          geometry: mesh.geometry,
          original,
          masked: mesh.getIndices(),
        });
      }
    },
    dispose: restore,
  };
}
