import { setMeshRole } from "./mesh-roles";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";

export interface ExteriorPrimitive {
  source: Mesh;
  /** Complete native-to-ship transform, including the authored placement. */
  matrix: Matrix;
  placementIds: readonly string[];
}
const supportedKinds = new Set([
  "position",
  "normal",
  "tangent",
  "uv",
  "uv2",
  "uv3",
  "uv4",
  "uv5",
  "uv6",
  "color",
]);

/** Bake static native vertices once, not once per contact. Material identity and
 * vertex layouts are strict batch boundaries; transparent primitives retain
 * their own bounds and sorting. No UV/material/texture or source buffer edits. */
export function batchOpaqueExterior(
  scene: Scene,
  primitives: readonly ExteriorPrimitive[],
) {
  const groups = new Map<string, ExteriorPrimitive[]>();
  const separate: ExteriorPrimitive[] = [];
  for (const primitive of primitives) {
    const mesh = primitive.source,
      material = mesh.material;
    const kinds = mesh.getVerticesDataKinds().sort();
    if (
      !material ||
      material.getClassName() === "MultiMaterial" ||
      material.needAlphaBlendingForMesh(mesh) ||
      mesh.skeleton ||
      mesh.morphTargetManager ||
      mesh.getTotalIndices() === 0 ||
      mesh.subMeshes.length !== 1 ||
      kinds.some((kind) => !supportedKinds.has(kind))
    ) {
      separate.push(primitive);
      continue;
    }
    const key = [
      material.uniqueId,
      mesh.sideOrientation,
      mesh.renderingGroupId,
      mesh.layerMask,
      mesh.receiveShadows,
      mesh.useVertexColors,
      mesh.hasVertexAlpha,
      mesh.visibility,
      kinds.join(","),
    ].join("|");
    const group = groups.get(key) ?? [];
    group.push(primitive);
    groups.set(key, group);
  }
  const batches: ExteriorPrimitive[] = [];
  try {
    for (const group of groups.values()) {
      const data = group.map(({ source, matrix }) => {
        const result = VertexData.ExtractFromMesh(source, true, true);
        const normals = result.normals?.slice(),
          tangents = result.tangents?.slice();
        const determinant = matrix.determinant();
        if (!Number.isFinite(determinant) || determinant === 0)
          throw Error("Invalid exterior transform");
        // Babylon's bake flips triangle winding for a reflected transform. Use
        // inverse-transpose normals and reflected tangent handedness as well.
        result.transform(matrix);
        const normalMatrix = Matrix.Transpose(Matrix.Invert(matrix));
        if (normals && result.normals)
          for (let i = 0; i < normals.length; i += 3) {
            const normal = Vector3.TransformNormal(
              Vector3.FromArray(normals, i),
              normalMatrix,
            ).normalize();
            result.normals[i] = normal.x;
            result.normals[i + 1] = normal.y;
            result.normals[i + 2] = normal.z;
          }
        if (tangents && result.tangents)
          for (let i = 0; i < tangents.length; i += 4) {
            const tangent = Vector3.TransformNormal(
              Vector3.FromArray(tangents, i),
              matrix,
            ).normalize();
            result.tangents[i] = tangent.x;
            result.tangents[i + 1] = tangent.y;
            result.tangents[i + 2] = tangent.z;
            result.tangents[i + 3] =
              tangents[i + 3] * (determinant < 0 ? -1 : 1);
          }
        return result;
      });
      const merged = data[0];
      merged.merge(data.slice(1), true, true);
      const source = group[0].source;
      const batch = new Mesh(`remote-exterior-batch-${batches.length}`, scene);
      setMeshRole(batch, "remote");
      merged.applyToMesh(batch);
      batch.material = source.material;
      batch.sideOrientation = source.sideOrientation;
      batch.renderingGroupId = source.renderingGroupId;
      batch.layerMask = source.layerMask;
      batch.receiveShadows = source.receiveShadows;
      batch.useVertexColors = source.useVertexColors;
      batch.hasVertexAlpha = source.hasVertexAlpha;
      batch.visibility = source.visibility;
      batch.isVisible = false;
      batch.isPickable = false;
      const placementIds = [
        ...new Set(group.flatMap((p) => p.placementIds)),
      ].sort();
      batch.metadata = {
        remoteExteriorBatch: true,
        role: "remote",
        sourcePlacementIds: placementIds,
      };
      batches.push({ source: batch, matrix: Matrix.Identity(), placementIds });
    }
    return {
      primitives: [...batches, ...separate],
      batches: batches.map((p) => p.source),
      metrics: {
        inputPrimitives: primitives.length,
        inputSubMeshes: primitives.reduce(
          (sum, p) => sum + p.source.subMeshes.length,
          0,
        ),
        opaqueBatches: batches.length,
        separatePrimitives: separate.length,
        outputPrimitives: batches.length + separate.length,
        outputSubMeshes:
          batches.length +
          separate.reduce((sum, p) => sum + p.source.subMeshes.length, 0),
        triangles: primitives.reduce(
          (sum, p) => sum + p.source.getTotalIndices() / 3,
          0,
        ),
      },
    };
  } catch (error) {
    for (const batch of batches) batch.source.dispose(false, false);
    throw error;
  }
}
