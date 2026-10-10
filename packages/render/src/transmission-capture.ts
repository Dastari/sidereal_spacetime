import type { Material } from "@babylonjs/core/Materials/material";
import type { MaterialPluginManager } from "@babylonjs/core/Materials/materialPluginManager";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";
import type { Plane } from "@babylonjs/core/Maths/math.plane";
import { Frustum } from "@babylonjs/core/Maths/math.frustum";
import { Matrix } from "@babylonjs/core/Maths/math.vector";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
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

type ScreenBox = { minX: number; maxX: number; minY: number; maxY: number };

function projectedBox(
  mesh: AbstractMesh,
  transform: Matrix,
  expansion = 0,
): ScreenBox | null {
  if (!hasConservativeRigidBounds(mesh)) return null;
  mesh.computeWorldMatrix();
  const box = mesh.getBoundingInfo().boundingBox;
  const min = box.minimumWorld,
    max = box.maximumWorld;
  const m = transform.asArray();
  const result = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
  };
  for (let i = 0; i < 8; i++) {
    const x = i & 1 ? max.x + expansion : min.x - expansion;
    const y = i & 2 ? max.y + expansion : min.y - expansion;
    const z = i & 4 ? max.z + expansion : min.z - expansion;
    const w = x * m[3] + y * m[7] + z * m[11] + m[15];
    const clipZ = x * m[2] + y * m[6] + z * m[10] + m[14];
    // A box crossing the eye/near plane has no finite conservative projected box.
    if (!(w > 1e-4) || clipZ < -w) return null;
    const sx = (x * m[0] + y * m[4] + z * m[8] + m[12]) / w;
    const sy = (x * m[1] + y * m[5] + z * m[9] + m[13]) / w;
    if (![sx, sy, clipZ].every(Number.isFinite)) return null;
    result.minX = Math.min(result.minX, sx);
    result.maxX = Math.max(result.maxX, sx);
    result.minY = Math.min(result.minY, sy);
    result.maxY = Math.max(result.maxY, sy);
  }
  return result;
}

function thinGlassDepth(
  material: Material | null,
  target: RenderTargetTexture,
): number | null {
  // glTF thin surfaces use volume IOR 1: the pinned shader mixes refraction
  // roughness to zero, so every sample uses mip 0 even with specular AA. Unknown
  // volume/blur modes fail open rather than clipping their sampling footprint.
  if (material?.constructor !== PBRMaterial) return null;
  const pbr = material as PBRMaterial,
    sub = pbr.subSurface;
  if (
    !sub.isRefractionEnabled ||
    sub.refractionTexture !== target ||
    sub.useThicknessAsDepth ||
    !(sub.volumeIndexOfRefraction > 0 && sub.volumeIndexOfRefraction <= 1) ||
    target.isCube ||
    target.constructor !== RenderTargetTexture ||
    target.coordinatesMode !== Texture.PROJECTION_MODE ||
    target.lodLevelInAlpha ||
    !(target.lodGenerationScale > 0) ||
    !Number.isFinite(target.lodGenerationScale) ||
    !(target.lodGenerationOffset <= 0) ||
    !Number.isFinite(target.lodGenerationOffset)
  )
    return null;
  // pbrSubSurfaceConfiguration.bindForSubMesh uses depth || 1. Refract's
  // normalized direction has length <=1, including total internal reflection.
  const depth = (target as RenderTargetTexture & { depth?: number }).depth || 1;
  return Number.isFinite(depth) ? Math.abs(depth) : null;
}

function glassSampleBoxes(
  scene: Scene,
  target: RenderTargetTexture,
  candidates: Iterable<AbstractMesh> | null,
): ScreenBox[] | null {
  const camera = target.activeCamera ?? scene.activeCamera;
  // Scene transform here is ObjectRenderer's installed target transform.
  // A custom capture camera or viewport could use different glass coordinates.
  if (
    !camera ||
    scene.getEngine().snapshotRendering ||
    camera !== scene.activeCamera ||
    !candidates ||
    !target.ignoreCameraViewport ||
    camera.viewport.x !== 0 ||
    camera.viewport.y !== 0 ||
    camera.viewport.width !== 1 ||
    camera.viewport.height !== 1
  )
    return null;
  const transform = scene.getTransformMatrix();
  const boxes: ScreenBox[] = [],
    size = target.getSize();
  if (!(size.width > 0 && size.height > 0)) return null;
  const paddingX = 4 / size.width,
    paddingY = 4 / size.height;
  for (const mesh of candidates) {
    if (
      !mesh.isEnabled() ||
      !mesh.isVisible ||
      mesh.visibility <= 0 ||
      !(mesh.layerMask & camera.layerMask) ||
      !touchesFrustum(mesh, scene.frustumPlanes)
    )
      continue;
    const depth = thinGlassDepth(mesh.material, target);
    if (depth === null) return null;
    const box = projectedBox(mesh, transform, depth);
    if (!box) return null;
    // Two base-level texels include bilinear/MSAA coverage and rounding. Mips
    // are still generated unchanged. Repeat/mirror wrap across an edge can sample
    // the opposite edge, so retain the full list in that case.
    box.minX -= paddingX;
    box.maxX += paddingX;
    box.minY -= paddingY;
    box.maxY += paddingY;
    if (
      (target.wrapU !== Texture.CLAMP_ADDRESSMODE &&
        (box.minX < -1 || box.maxX > 1)) ||
      (target.wrapV !== Texture.CLAMP_ADDRESSMODE &&
        (box.minY < -1 || box.maxY > 1))
    )
      return null;
    boxes.push(box);
  }
  return boxes;
}

/** Only the helper-owned opaque target uses this callback. ObjectRenderer installs
 * that target's camera/frustum before calling it. No admission survives a frame. */
export function createTransmissionCaptureFilter(
  scene: Scene,
  previous: RenderListCallback | null,
  capture?: {
    target: RenderTargetTexture;
    candidates: () => Iterable<AbstractMesh> | null;
  },
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
    const glass = capture
      ? glassSampleBoxes(scene, capture.target, capture.candidates())
      : null;
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
      if (!finite || touchesPlane) {
        const screen = glass
          ? projectedBox(mesh, scene.getTransformMatrix())
          : null;
        if (
          !screen ||
          !glass ||
          glass.some(
            (g) =>
              screen.minX <= g.maxX &&
              screen.maxX >= g.minX &&
              screen.minY <= g.maxY &&
              screen.maxY >= g.minY,
          )
        )
          filtered.push(mesh);
      }
    }
    return filtered;
  };
}
