import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { transformAuthoredVertices } from "./structural-batches";
import type { Material } from "@babylonjs/core/Materials/material";
import type { MeshRole } from "./mesh-roles";

/** Immutable prototype batching. Placement identity is bound when a prototype
 * is placed; per-source triangle ranges retain its authored primitive identity. */
export function batchStaticMaterials(
  sources: Mesh[],
  role?: MeshRole,
  disposeSources = true,
): Mesh[] {
  const groups = new Map<
    string,
    {
      source: Mesh;
      data: VertexData;
      material: Material | null;
      count: number;
    }[]
  >();
  const separate: Mesh[] = [],
    accepted = new Set<Mesh>();
  for (const mesh of sources) {
    if (mesh.skeleton || mesh.morphTargetManager)
      throw Error("Animated asset cannot use static material batching");
    const materials = mesh.subMeshes.map((s) => s.getMaterial());
    if (
      materials.some(
        (m) =>
          m &&
          (m.needAlphaBlendingForMesh(mesh) ||
            m.needAlphaTestingForMesh(mesh) ||
            m.zOffset !== 0 ||
            m.zOffsetUnits !== 0),
      )
    ) {
      separate.push(mesh);
      continue;
    }
    const attributes = mesh.getVerticesDataKinds().sort();
    if (
      attributes.some(
        (k) =>
          ![
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
          ].includes(k),
      )
    ) {
      separate.push(mesh);
      continue;
    }
    const matrix = mesh.computeWorldMatrix(true);
    for (const sub of mesh.subMeshes) {
      const material = sub.getMaterial();
      const key = JSON.stringify([
        material?.uniqueId,
        attributes,
        mesh.sideOrientation,
        mesh.renderingGroupId,
        mesh.layerMask,
        mesh.receiveShadows,
        mesh.useVertexColors,
        mesh.hasVertexAlpha,
      ]);
      const data = VertexData.ExtractFromMesh(mesh, true, true);
      data.indices = Array.from(
        mesh
          .getIndices()!
          .slice(sub.indexStart, sub.indexStart + sub.indexCount),
      );
      transformAuthoredVertices(data, matrix);
      const group = groups.get(key) ?? [];
      group.push({ source: mesh, data, material, count: sub.indexCount / 3 });
      groups.set(key, group);
    }
    accepted.add(mesh);
  }
  const batches: Mesh[] = [];
  try {
    for (const group of groups.values()) {
      const source = group[0].source;
      const data = group[0].data;
      data.merge(
        group.slice(1).map((p) => p.data),
        true,
        true,
      );
      const mesh = new Mesh(
        source.name + "--material-batch",
        source.getScene(),
      );
      data.applyToMesh(mesh);
      mesh.material = group[0].material;
      mesh.sideOrientation = source.sideOrientation;
      mesh.renderingGroupId = source.renderingGroupId;
      mesh.layerMask = source.layerMask;
      mesh.receiveShadows = source.receiveShadows;
      mesh.useVertexColors = source.useVertexColors;
      mesh.hasVertexAlpha = source.hasVertexAlpha;
      mesh.isVisible = false;
      mesh.isPickable = false;
      let start = 0;
      mesh.metadata = {
        role: role ?? source.metadata?.role ?? "hull",
        materialRole: "opaque",
        prototypeBatch: true,
        triangleSources: group.map((p) => {
          const range = {
            start,
            count: p.count,
            sourceMeshId: p.source.uniqueId,
          };
          start += p.count;
          return range;
        }),
      };
      batches.push(mesh);
    }
  } catch (error) {
    for (const mesh of batches) mesh.dispose(false, false);
    throw error;
  }
  if (disposeSources) for (const mesh of accepted) mesh.dispose(false, false);
  return [...separate, ...batches];
}
