import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Material } from "@babylonjs/core/Materials/material";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";

export interface PlacementTriangles {
  start: number;
  count: number;
  placementId: string;
}
export function placementAtFace(
  mesh: Pick<AbstractMesh, "metadata">,
  faceId: number,
) {
  if (mesh.metadata?.partId) return mesh.metadata.partId;
  if (!Number.isInteger(faceId) || faceId < 0) return undefined;
  return (
    (
      mesh.metadata?.trianglePlacements as PlacementTriangles[] | undefined
    )?.find((r) => faceId >= r.start && faceId < r.start + r.count)
      ?.placementId ?? mesh.metadata?.partId
  );
}
export function placementTriangleIndices(mesh: Mesh, placementId: string) {
  const indices = mesh.getIndices() ?? [];
  return (
    (mesh.metadata?.trianglePlacements as PlacementTriangles[] | undefined)
      ?.filter((r) => r.placementId === placementId)
      .flatMap((r) =>
        Array.from(indices.slice(r.start * 3, (r.start + r.count) * 3)),
      ) ?? []
  );
}
const kinds = new Set([
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
/** Preserve every authored channel, including reflected tangent handedness and
 * inverse-transpose normals. Triangle winding follows Babylon's handedness bake. */
export function transformAuthoredVertices(data: VertexData, matrix: Matrix) {
  const normals = data.normals?.slice(),
    tangents = data.tangents?.slice();
  const determinant = matrix.determinant();
  if (!Number.isFinite(determinant) || determinant === 0)
    throw Error("Invalid structural batch transform");
  data.transform(matrix);
  const normalMatrix = Matrix.Transpose(Matrix.Invert(matrix));
  if (normals && data.normals)
    for (let i = 0; i < normals.length; i += 3) {
      const n = Vector3.TransformNormal(
        Vector3.FromArray(normals, i),
        normalMatrix,
      ).normalize();
      data.normals[i] = n.x;
      data.normals[i + 1] = n.y;
      data.normals[i + 2] = n.z;
    }
  if (tangents && data.tangents)
    for (let i = 0; i < tangents.length; i += 4) {
      const t = Vector3.TransformNormal(
        Vector3.FromArray(tangents, i),
        matrix,
      ).normalize();
      data.tangents[i] = t.x;
      data.tangents[i + 1] = t.y;
      data.tangents[i + 2] = t.z;
      data.tangents[i + 3] = tangents[i + 3] * (determinant < 0 ? -1 : 1);
    }
}
/** Only callers owning a static, common visibility/light policy may opt in.
 * Called before lighting, glow and picking capture mesh lists. Deck and role
 * boundaries remain separate; moving doors and independently controlled props
 * must stay outside this input. Original geometry/material buffers are immutable. */
export function mergeStructuralPlacements(
  parent: TransformNode,
  sources: readonly Mesh[],
) {
  const groups = new Map<
    string,
    { source: Mesh; material: Material; data: VertexData; count: number }[]
  >();
  const accepted = new Set<Mesh>();
  parent.computeWorldMatrix(true);
  const inverse = Matrix.Invert(parent.getWorldMatrix());
  for (const source of sources) {
    const metadata = source.metadata,
      material = source.material;
    const attributes = source.getVerticesDataKinds().sort();
    if (
      !metadata?.partId ||
      !metadata.deckId ||
      !metadata.visibilityGroup ||
      !metadata.lightGroup ||
      !["hull", "roof", "wall", "floor"].includes(metadata.role) ||
      source.skeleton ||
      source.morphTargetManager ||
      source.hasVertexAlpha ||
      source.visibility !== 1 ||
      !source.isEnabled() ||
      !source.isVisible ||
      source.billboardMode ||
      !material ||
      attributes.some((k) => !kinds.has(k)) ||
      !source.getTotalIndices()
    )
      continue;
    const subMaterials = source.subMeshes.map((s) => s.getMaterial());
    if (
      subMaterials.some(
        (m) =>
          !m ||
          m.needAlphaBlendingForMesh(source) ||
          m.needAlphaTestingForMesh(source) ||
          m.disableDepthWrite ||
          m.stencil.enabled ||
          m.zOffset !== 0 ||
          m.zOffsetUnits !== 0,
      )
    )
      continue;
    const matrix = source.computeWorldMatrix(true).multiply(inverse);
    for (const sub of source.subMeshes) {
      const mat = sub.getMaterial()!;
      const data = VertexData.ExtractFromMesh(source, true, true);
      data.indices = Array.from(
        source
          .getIndices()!
          .slice(sub.indexStart, sub.indexStart + sub.indexCount),
      );
      transformAuthoredVertices(data, matrix);
      const key = JSON.stringify([
        metadata.role,
        metadata.category,
        metadata.deckId,
        metadata.instanceId,
        metadata.visibilityGroup,
        metadata.lightGroup,
        mat.uniqueId,
        source.sideOrientation,
        source.renderingGroupId,
        source.layerMask,
        source.receiveShadows,
        source.isPickable,
        source.useVertexColors,
        source.alphaIndex,
        attributes,
      ]);
      const group = groups.get(key) ?? [];
      group.push({ source, material: mat, data, count: sub.indexCount / 3 });
      groups.set(key, group);
    }
    accepted.add(source);
  }
  const batches: Mesh[] = [];
  try {
    for (const group of groups.values()) {
      const source = group[0].source,
        data = group[0].data;
      data.merge(
        group.slice(1).map((p) => p.data),
        true,
        true,
      );
      let start = 0;
      const ranges = group.map((p) => {
        const range = {
          start,
          count: p.count,
          placementId: p.source.metadata.partId,
        };
        start += p.count;
        return range;
      });
      const mesh = new Mesh("GEO-structural-batch", parent.getScene());
      data.applyToMesh(mesh);
      mesh.parent = parent;
      mesh.material = group[0].material;
      mesh.sideOrientation = source.sideOrientation;
      mesh.renderingGroupId = source.renderingGroupId;
      mesh.layerMask = source.layerMask;
      mesh.receiveShadows = source.receiveShadows;
      mesh.isPickable = source.isPickable;
      mesh.useVertexColors = source.useVertexColors;
      mesh.alphaIndex = source.alphaIndex;
      mesh.metadata = {
        role: source.metadata.role,
        category: source.metadata.category,
        deckId: source.metadata.deckId,
        instanceId: source.metadata.instanceId,
        visibilityGroup: source.metadata.visibilityGroup,
        lightGroup: source.metadata.lightGroup,
        materialRole: "opaque",
        trianglePlacements: ranges,
      };
      batches.push(mesh);
    }
  } catch (error) {
    for (const mesh of batches) mesh.dispose(false, false);
    throw error;
  }
  // Disposal happens only after every output was built successfully.
  for (const source of accepted) source.dispose(false, false);
  return {
    meshes: [...sources.filter((s) => !accepted.has(s)), ...batches],
    batches,
  };
}
