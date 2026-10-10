import type { Material } from "@babylonjs/core/Materials/material";
import type { MaterialPluginManager } from "@babylonjs/core/Materials/materialPluginManager";
import type { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";
import { TemporalInstanceAttributes } from "./temporal-instance-attributes";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { PBRMetallicRoughnessMaterial } from "@babylonjs/core/Materials/PBR/pbrMetallicRoughnessMaterial";
import { PBRSpecularGlossinessMaterial } from "@babylonjs/core/Materials/PBR/pbrSpecularGlossinessMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { PBRClearCoatConfiguration } from "@babylonjs/core/Materials/PBR/pbrClearCoatConfiguration";
import { PBRAnisotropicConfiguration } from "@babylonjs/core/Materials/PBR/pbrAnisotropicConfiguration";
import { PBRBRDFConfiguration } from "@babylonjs/core/Materials/PBR/pbrBRDFConfiguration";
import { PBRIridescenceConfiguration } from "@babylonjs/core/Materials/PBR/pbrIridescenceConfiguration";
import { PBRSheenConfiguration } from "@babylonjs/core/Materials/PBR/pbrSheenConfiguration";
import { PBRSubSurfaceConfiguration } from "@babylonjs/core/Materials/PBR/pbrSubSurfaceConfiguration";
import { DetailMapConfiguration } from "@babylonjs/core/Materials/material.detailMapConfiguration";

type RenderListCallback = NonNullable<
  RenderTargetTexture["getCustomRenderList"]
>;
const rigidMaterials = new Set<Function>([
  PBRMaterial,
  PBRMetallicRoughnessMaterial,
  PBRSpecularGlossinessMaterial,
  StandardMaterial,
]);
const rigidPlugins = new Set<Function>([
  PBRClearCoatConfiguration,
  PBRAnisotropicConfiguration,
  PBRBRDFConfiguration,
  PBRIridescenceConfiguration,
  PBRSheenConfiguration,
  PBRSubSurfaceConfiguration,
  DetailMapConfiguration,
  TemporalInstanceAttributes,
]);

export function hasRigidMaterial(material: Material | null): boolean {
  if (!material) return false;
  if (typeof material.customShaderNameResolve === "function") return false;
  if (material.constructor === MultiMaterial) {
    return (
      material as Material & { subMaterials: (Material | null)[] }
    ).subMaterials.every(hasRigidMaterial);
  }
  if (!rigidMaterials.has(material.constructor)) return false;
  // Pinned Babylon 9.25 inspection boundary: unknown plugins may displace vertices.
  // Never mutate this registry or infer geometry bounds from shader names alone.
  const manager = (
    material as Material & { pluginManager?: MaterialPluginManager }
  ).pluginManager;
  return (
    !manager ||
    manager._plugins.every((plugin) => rigidPlugins.has(plugin.constructor))
  );
}

function hasConservativeRigidBounds(mesh: AbstractMesh): boolean {
  const source =
    (mesh as AbstractMesh & { sourceMesh?: AbstractMesh }).sourceMesh ?? mesh;
  return (
    !mesh.alwaysSelectAsActiveMesh &&
    !(source as AbstractMesh & { ignoreCameraMaxZ?: boolean })
      .ignoreCameraMaxZ &&
    !mesh.doNotSyncBoundingInfo &&
    !source.doNotSyncBoundingInfo &&
    !mesh.getBoundingInfo().isLocked &&
    !source.getBoundingInfo().isLocked &&
    !mesh.hasThinInstances &&
    !source.hasThinInstances &&
    !source.skeleton &&
    !source.morphTargetManager &&
    !source.bakedVertexAnimationManager &&
    hasRigidMaterial(mesh.material)
  );
}

/** Only the helper-owned opaque target uses this callback. ObjectRenderer installs
 * that target's camera/frustum before calling it. Reuse admission while the
 * actual frustum, input list, visibility and rigid bounds remain unchanged. */
export function createTransmissionCaptureFilter(
  scene: Scene,
  previous: RenderListCallback | null,
): RenderListCallback {
  const filtered: AbstractMesh[] = [];
  const inputs: unknown[] = [];
  const rigid: boolean[] = [];
  let valid = false,
    changed = true,
    cursor = 0;
  const read = (value: unknown) => {
    if (!Object.is(inputs[cursor], value)) {
      inputs[cursor] = value;
      changed = true;
    }
    cursor++;
  };
  return function (this: unknown, face, renderList, renderListLength) {
    const selected =
      previous?.call(this, face, renderList, renderListLength) ?? null;
    const list = selected ?? renderList;
    const planes = scene.frustumPlanes;
    if (
      !list ||
      scene.skipFrustumClipping ||
      planes?.length !== 6 ||
      planes.some(
        (p) =>
          !Number.isFinite(p.normal.x) ||
          !Number.isFinite(p.normal.y) ||
          !Number.isFinite(p.normal.z) ||
          !Number.isFinite(p.d),
      )
    ) {
      valid = false;
      return selected;
    }
    const length = selected
      ? selected.length
      : Math.min(list.length, Math.max(0, renderListLength));
    cursor = 0;
    changed = !valid;
    read(face);
    read(length);
    for (const plane of planes) {
      read(plane.normal.x);
      read(plane.normal.y);
      read(plane.normal.z);
      read(plane.d);
    }
    // Comparing public values catches in-place list/geometry edits. It avoids
    // the per-frame vertex/plane filter and preserves upstream callback order.
    for (let i = 0; i < length; i++) {
      const mesh = list[i];
      read(mesh);
      const enabled = !!mesh && mesh.isEnabled() && mesh.isVisible;
      read(enabled);
      rigid[i] = enabled && hasConservativeRigidBounds(mesh);
      read(rigid[i]);
      if (!rigid[i]) continue;
      for (const value of mesh.computeWorldMatrix().asArray()) read(value);
      const box = mesh.getBoundingInfo().boundingBox;
      for (const point of [box.minimum, box.maximum]) {
        read(point.x);
        read(point.y);
        read(point.z);
      }
    }
    if (inputs.length !== cursor) {
      inputs.length = cursor;
      changed = true;
    }
    if (!changed) return filtered;
    valid = true;
    filtered.length = 0;
    for (let i = 0; i < length; i++) {
      const mesh = list[i];
      if (!mesh || !mesh.isEnabled() || !mesh.isVisible) continue;
      // Preserve upstream visibility/material/mask handling for exceptional meshes.
      if (!rigid[i]) {
        filtered.push(mesh);
        continue;
      }
      const matrix = mesh.computeWorldMatrix();
      if (matrix.asArray().some((value) => !Number.isFinite(value))) {
        filtered.push(mesh);
        continue;
      }
      const box = mesh.getBoundingInfo().boundingBox;
      const finite = box.vectorsWorld.every(
        (v) =>
          Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z),
      );
      // Sphere-first mesh.isInFrustum underbounds some mirrored/nonuniform scales.
      const touchesPlane =
        finite &&
        planes.every((plane) =>
          box.vectorsWorld.some((v) => plane.dotCoordinate(v) >= -1e-4),
        );
      if (!finite || touchesPlane) filtered.push(mesh);
    }
    return filtered;
  };
}
