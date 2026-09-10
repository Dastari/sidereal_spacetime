import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Matrix } from "@babylonjs/core/Maths/math.vector";
import { transformAuthoredVertices, type PlacementTriangles } from "./structural-batches";

/** One controller per shadow map: never combine incompatible light membership.
 * Input proxies already express physical opacity independently of cutaway fade.
 * Sources without stable placement identity stay separate. */
export function createShadowBatches(root: TransformNode) {
  let batches: Mesh[] = [];
  return {
    rebuild(sources: readonly AbstractMesh[]) {
      const retained: AbstractMesh[] = [];
      const groups = new Map<string, Mesh[]>();
      for (const mesh of sources) {
        if (mesh.isDisposed() || !mesh.isEnabled() || !mesh.isVisible) continue;
        if (!(mesh instanceof Mesh) || mesh.metadata?.role !== "proxy" ||
            !mesh.metadata.shadowRole || !mesh.metadata.deckId || !mesh.metadata.partId || !mesh.material ||
            mesh.skeleton || mesh.morphTargetManager || !mesh.getTotalIndices()) {
          retained.push(mesh);
          continue;
        }
        const key = JSON.stringify([mesh.metadata.shadowRole, mesh.metadata.deckId,
          mesh.metadata.shadowCabin, mesh.material.uniqueId, mesh.sideOrientation,
          mesh.isVerticesDataPresent("normal")]);
        const group = groups.get(key) ?? [];
        group.push(mesh); groups.set(key, group);
      }
      const next: Mesh[] = [];
      const inverse = Matrix.Invert(root.computeWorldMatrix(true));
      try {
        for (const group of groups.values()) {
          const parts: VertexData[] = [], ranges: PlacementTriangles[] = [];
          let start = 0;
          for (const source of group) {
            const data = new VertexData();
            data.positions = Array.from(source.getVerticesData("position")!);
            const normals = source.getVerticesData("normal");
            if (normals) data.normals = Array.from(normals);
            data.indices = Array.from(source.getIndices()!);
            transformAuthoredVertices(data, source.computeWorldMatrix(true).multiply(inverse));
            const count = data.indices.length / 3;
            ranges.push({ start, count, placementId: source.metadata.partId });
            start += count; parts.push(data);
          }
          const data = parts[0];
          data.merge(parts.slice(1), true, true);
          const mesh = new Mesh("shadow-structural-batch", root.getScene());
          next.push(mesh);
          data.applyToMesh(mesh);
          mesh.parent = root;
          mesh.material = group[0].material;
          mesh.sideOrientation = group[0].sideOrientation;
          mesh.layerMask = 0x10000000;
          mesh.isPickable = false;
          mesh.metadata = { role: "proxy", shadowRole: group[0].metadata.shadowRole,
            shadowCabin: group[0].metadata.shadowCabin, deckId: group[0].metadata.deckId,
            trianglePlacements: ranges };
        }
      } catch (error) {
        for (const mesh of next) mesh.dispose(false, false);
        throw error;
      }
      for (const mesh of batches) mesh.dispose(false, false);
      batches = next;
      return [...retained, ...batches];
    },
    dispose() {
      for (const mesh of batches) mesh.dispose(false, false);
      batches = [];
    },
  };
}
