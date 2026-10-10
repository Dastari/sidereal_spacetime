import type { Material } from "@babylonjs/core/Materials/material";
import type { MaterialPluginManager } from "@babylonjs/core/Materials/materialPluginManager";
import type { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";
import type { Plane } from "@babylonjs/core/Maths/math.plane";
import { Frustum } from "@babylonjs/core/Maths/math.frustum";
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

function hasRigidMaterial(material: Material | null): boolean {
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

function finitePlanes(planes: Plane[]): boolean {
  return (
    planes.length === 6 &&
    planes.every((p) =>
      [p.normal.x, p.normal.y, p.normal.z, p.d].every(Number.isFinite),
    )
  );
}

function touchesFrustum(mesh: AbstractMesh, planes: Plane[]): boolean {
  if (!hasConservativeRigidBounds(mesh)) return true;
  if (
    mesh
      .computeWorldMatrix()
      .asArray()
      .some((v) => !Number.isFinite(v))
  )
    return true;
  const vertices = mesh.getBoundingInfo().boundingBox.vectorsWorld;
  if (vertices.some((v) => ![v.x, v.y, v.z].every(Number.isFinite)))
    return true;
  return planes.every((p) => vertices.some((v) => p.dotCoordinate(v) >= -1e-4));
}

/** The pinned helper's translucent and mixed caches are live, including instances.
 * Unknown adapters/bounds fail open. Read the current camera rather than the scene
 * frustum: an earlier shadow target can have installed different planes. */
export function createTransmissionVisibilityTest(
  scene: Scene,
  target: RenderTargetTexture,
  candidates: () => Iterable<AbstractMesh> | null,
): () => boolean {
  const planes = Frustum.GetPlanes(scene.getTransformMatrix());
  return () => {
    const camera = target.activeCamera ?? scene.activeCamera;
    const meshes = candidates();
    if (!camera || !meshes || scene.skipFrustumClipping) return true;
    camera.getViewMatrix();
    camera.getProjectionMatrix();
    Frustum.GetPlanesToRef(camera.getTransformationMatrix(), planes);
    if (!finitePlanes(planes)) return true;
    for (const mesh of meshes) {
      if (
        mesh.isDisposed() ||
        !mesh.isEnabled() ||
        !mesh.isVisible ||
        mesh.visibility <= 0 ||
        !(mesh.layerMask & camera.layerMask)
      )
        continue;
      // Cache membership comes from the helper's own adapter classification.
      // Do not reclassify or mutate mixed submeshes here.
      if (touchesFrustum(mesh, planes)) return true;
    }
    return false;
  };
}

/** Only the helper-owned opaque target uses this callback. ObjectRenderer installs
 * that target's camera/frustum before calling it. No admission survives a frame. */
export function createTransmissionCaptureFilter(
  scene: Scene,
  previous: RenderListCallback | null,
): RenderListCallback {
  const filtered: AbstractMesh[] = [];
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
    )
      return selected;
    const length = selected
      ? selected.length
      : Math.min(list.length, Math.max(0, renderListLength));
    filtered.length = 0;
    for (let i = 0; i < length; i++) {
      const mesh = list[i];
      if (!mesh || !mesh.isEnabled() || !mesh.isVisible) continue;
      // Preserve upstream visibility/material/mask handling for exceptional meshes.
      if (!hasConservativeRigidBounds(mesh)) {
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
