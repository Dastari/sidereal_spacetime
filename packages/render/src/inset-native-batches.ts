import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Matrix } from "@babylonjs/core/Maths/math.vector";
import type { Material } from "@babylonjs/core/Materials/material";
import type { Scene } from "@babylonjs/core/scene";
import { transformAuthoredVertices } from "./structural-batches";
import { insetNativeMaterialKey } from "./inset-native-materials";
const controls = new WeakMap<Mesh, (visibility: number) => void>();
export function applyInsetBatchedVisibility(mesh: Mesh, visibility: number) {
  const control = controls.get(mesh);
  if (!control) return false;
  control(visibility);
  return true;
}
/** Compatibility for historical thin-instance batches. New material batches use
 * metadata.trianglePlacements and the standard placementAtFace helper. */
export function insetPlacementAtThinInstance(
  mesh: Pick<Mesh, "metadata">,
  index: number,
): string | undefined {
  if (!Number.isInteger(index) || index < 0) return undefined;
  return mesh.metadata?.thinInstancePartIds?.[index];
}
const supported = new Set([
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
/** View-scoped exact opaque material batches. Authored channels are baked once
 * into ship-local coordinates; only index ranges change for visibility. Faded
 * placements use original separately sorted meshes/materials. Sources, UVs,
 * textures, collision and native files are never edited. */
export function createInsetNativeBatches(
  scene: Scene,
  parent: TransformNode,
  sources: readonly Mesh[],
) {
  if (sources.length > 32768 || parent.getScene() !== scene)
    throw Error("Inset batch scene or work budget invalid");
  const groups = new Map<string, Mesh[]>(),
    materialKeys = new Map<Material, string>();
  for (const mesh of sources) {
    const material = mesh.material;
    if (
      mesh.getScene() !== scene ||
      !mesh.parent ||
      mesh.skeleton ||
      mesh.morphTargetManager ||
      !mesh.geometry ||
      !mesh.getTotalIndices() ||
      mesh.subMeshes.length !== 1 ||
      !material ||
      material.getClassName() === "MultiMaterial" ||
      mesh.visibility !== 1 ||
      !mesh.isVisible ||
      mesh.billboardMode ||
      mesh.scaling.x * mesh.scaling.y * mesh.scaling.z <= 0 ||
      mesh.hasVertexAlpha ||
      !mesh.metadata?.partId ||
      mesh.metadata?.hullDecal ||
      mesh.metadata?.decal ||
      mesh.alphaIndex !== Number.MAX_VALUE ||
      material.needAlphaBlendingForMesh(mesh) ||
      material.needAlphaTestingForMesh(mesh) ||
      material.zOffset !== 0 ||
      material.zOffsetUnits !== 0 ||
      material.disableDepthWrite ||
      material.stencil.enabled ||
      mesh.getVerticesDataKinds().some((k) => !supported.has(k))
    )
      continue;
    let materialKey = materialKeys.get(material);
    if (!materialKey) {
      materialKey = insetNativeMaterialKey(material);
      materialKeys.set(material, materialKey);
    }
    const key = JSON.stringify([
      materialKey,
      mesh.metadata.role,
      mesh.sideOrientation,
      mesh.renderingGroupId,
      mesh.layerMask,
      mesh.receiveShadows,
      mesh.useVertexColors,
      mesh.isPickable,
      mesh.getVerticesDataKinds().sort(),
    ]);
    const group = groups.get(key) ?? [];
    group.push(mesh);
    groups.set(key, group);
  }
  const meshes: Mesh[] = [],
    accepted: Mesh[] = [];
  const batches: {
    mesh: Mesh;
    members: { mesh: Mesh; partId: string; start: number; count: number }[];
    indices: Uint32Array;
    buffer: Uint32Array;
    last: string;
  }[] = [];
  let disposed = false,
    vertexBudget = 0;
  try {
    parent.computeWorldMatrix(true);
    const inverse = Matrix.Invert(parent.getWorldMatrix());
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const vertices = group.reduce((n, m) => n + m.getTotalVertices(), 0);
      if (
        vertices > 1_000_000 ||
        vertexBudget + vertices > 4_000_000 ||
        (!scene.getEngine().getCaps().uintIndices && vertices > 65535)
      )
        continue;
      const matrices = group.map((m) =>
        m.computeWorldMatrix(true).multiply(inverse),
      );
      if (
        matrices.some(
          (m) => !Number.isFinite(m.determinant()) || m.determinant() <= 1e-12,
        )
      )
        continue;
      const data = group.map((m, i) => {
        const d = VertexData.ExtractFromMesh(m, true, true);
        transformAuthoredVertices(d, matrices[i]);
        return d;
      });
      let start = 0;
      const members = group.map((mesh, i) => {
        const member = {
          mesh,
          partId: String(mesh.metadata.partId),
          start,
          count: data[i].indices!.length,
        };
        start += member.count;
        return member;
      });
      const combined = data[0];
      combined.merge(data.slice(1), true, true);
      const batch = new Mesh("inset-material-batch--" + group[0].name, scene);
      meshes.push(batch);
      combined.applyToMesh(batch);
      batch.parent = parent;
      const indices = Uint32Array.from(combined.indices!);
      batch.setIndices(indices, null, true);
      const source = group[0];
      batch.material = source.material;
      batch.sideOrientation = source.sideOrientation;
      batch.renderingGroupId = source.renderingGroupId;
      batch.layerMask = source.layerMask;
      batch.receiveShadows = source.receiveShadows;
      batch.useVertexColors = source.useVertexColors;
      batch.hasVertexAlpha = source.hasVertexAlpha;
      batch.isPickable = source.isPickable;
      batch.isVisible = true;
      batch.metadata = {
        role: source.metadata.role,
        nativeBatch: true,
        physicalQualification: "unqualified",
        trianglePlacements: [],
        nativeKeys: [...new Set(group.map((m) => m.metadata.nativeKey))],
      };
      for (const { mesh } of members) {
        accepted.push(mesh);
        mesh.isVisible = false;
        controls.set(mesh, (visibility) => {
          const v =
            visibility >= 0.995 ? 1 : visibility <= 0.005 ? 0 : visibility;
          mesh.visibility = v;
          mesh.setEnabled(v > 0);
          mesh.isVisible = v > 0 && v < 1;
        });
      }
      batches.push({
        mesh: batch,
        members,
        indices,
        buffer: new Uint32Array(indices.length),
        last: "uninitialized",
      });
      vertexBudget += vertices;
    }
    const update = () => {
      if (disposed) return;
      for (const batch of batches) {
        if (batch.mesh.isDisposed()) continue;
        const active = batch.members.filter(
          (m) =>
            !m.mesh.isDisposed() &&
            m.mesh.isEnabled() &&
            m.mesh.visibility === 1,
        );
        const key = active.map((m) => m.mesh.uniqueId).join(",");
        if (key === batch.last) continue;
        batch.last = key;
        let offset = 0;
        batch.mesh.metadata.trianglePlacements = active.map((m) => {
          batch.buffer.set(
            batch.indices.subarray(m.start, m.start + m.count),
            offset,
          );
          const range = {
            start: offset / 3,
            count: m.count / 3,
            placementId: m.partId,
          };
          offset += m.count;
          return range;
        });
        batch.mesh.setEnabled(offset > 0);
        if (offset)
          batch.mesh.updateIndices(batch.buffer.subarray(0, offset), 0, false);
      }
    };
    update();
    const observer = scene.onBeforeRenderObservable.add(update);
    return {
      meshes,
      update,
      metrics: {
        fallbackMeshes: accepted.length,
        batchMeshes: meshes.length,
        unbatchedMeshes: sources.length - accepted.length,
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        scene.onBeforeRenderObservable.remove(observer);
        for (const mesh of accepted) {
          controls.delete(mesh);
          if (!mesh.isDisposed()) mesh.isVisible = true;
        }
        for (const mesh of meshes) mesh.dispose(false, false);
      },
    };
  } catch (error) {
    for (const mesh of accepted) {
      controls.delete(mesh);
      if (!mesh.isDisposed()) mesh.isVisible = true;
    }
    for (const mesh of meshes) mesh.dispose(false, false);
    // Unsupported batching cannot replace working native rendering with a failure.
    return {
      meshes: [] as Mesh[],
      update() {},
      metrics: {
        fallbackMeshes: 0,
        batchMeshes: 0,
        unbatchedMeshes: sources.length,
      },
      dispose() {},
    };
  }
}
