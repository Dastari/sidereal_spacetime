import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import { RenderingGroup } from "@babylonjs/core/Rendering/renderingGroup";
import type { RenderingManager } from "@babylonjs/core/Rendering/renderingManager";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { refreshShadowCasterTransforms } from "../shadow-transform-refresh";
export type ExhaustBatch = {
  source: Mesh;
  jets(): readonly AbstractMesh[];
  handles(): readonly AbstractMesh[];
  allow(allowed: boolean): void;
};
const coordinators = new WeakMap<Scene, ReturnType<typeof coordinator>>();
const stockSort = RenderingGroup.defaultTransparentSortCompare;
const stockLOD = Mesh.prototype.getLOD;
const key = (mesh: AbstractMesh) =>
  `${mesh.renderingGroupId}:${mesh.alphaIndex}`;
function coordinator(scene: Scene) {
  const batches = new Set<ExhaustBatch>();
  const observer = scene.onBeforeActiveMeshesEvaluationObservable.add(() => {
    const layers = (scene.effectLayers ?? []).filter(
      (layer) => layer.isEnabled,
    );
    const live = [...batches].filter((batch) => {
      const jets = batch.jets();
      if (!jets.some((mesh) => mesh.isEnabled())) {
        batch.source.setEnabled(false);
        return false;
      }
      // Effect layers bind per-mesh selectors, intensity, material overrides
      // and observers through the render owner. Preserve placed-mesh identity
      // even for a stock glow layer; own ship plumes keep their original draws.
      if (
        layers.some(
          (layer) =>
            layer.hasMesh(batch.source) ||
            batch.handles().some((mesh) => layer.hasMesh(mesh)),
        )
      ) {
        batch.allow(false);
        return false;
      }
      return true;
    });
    if (!live.length) return;
    const camera = scene.activeCamera;
    if (
      !camera ||
      scene.activeCameras?.length ||
      (scene as unknown as { customLODSelector?: unknown }).customLODSelector ||
      scene.useOrderIndependentTransparency ||
      // glTF helper membership is deferred on mesh creation. Switching a
      // representation immediately before its RTT would omit that frame.
      !!(scene as unknown as { _transmissionHelper?: unknown })
        ._transmissionHelper ||
      scene.customRenderTargets.length ||
      camera.customRenderTargets.length ||
      scene.particleSystems.length ||
      scene.spriteManagers?.length
    ) {
      live.forEach((batch) => batch.allow(false));
      return;
    }
    const jets = live.flatMap((batch) => [...batch.jets()]);
    // These stock, unlit plume transforms would otherwise be prepared by main
    // evaluation. One adapter deduplicates their shared ancestry for this phase.
    refreshShadowCasterTransforms([
      ...jets,
      ...live.map((batch) => batch.source),
    ]);
    const excluded = new Set<AbstractMesh>([
      ...jets,
      ...live.map((batch) => batch.source),
    ]);
    const mixed = new Map<string, number[]>();
    const eye = camera.globalPosition;
    for (const mesh of scene.meshes) {
      if (
        excluded.has(mesh) ||
        !mesh.isEnabled() ||
        !mesh.isVisible ||
        mesh.visibility <= 0 ||
        !(mesh.layerMask & camera.layerMask)
      )
        continue;
      const renderingOwner =
        mesh instanceof InstancedMesh ? mesh.sourceMesh : mesh;
      // An opaque controlling mesh may select a transparent LOD with another
      // owner/material/bucket. Do not infer its effective sort from that mesh.
      if (
        renderingOwner instanceof Mesh &&
        (renderingOwner.hasLODLevels || renderingOwner.getLOD !== stockLOD)
      ) {
        live.forEach((batch) => batch.allow(false));
        return;
      }
      for (const sub of mesh.subMeshes ?? []) {
        const material = sub.getMaterial();
        if (!material?.needAlphaBlendingForMesh(mesh)) continue;
        const owner = mesh instanceof InstancedMesh ? mesh.sourceMesh : mesh;
        // Other instances/thin banks/LODs may sort using a hidden rendering
        // owner's bounds rather than this placed handle. Preserve their order.
        if (
          mesh instanceof InstancedMesh ||
          (mesh instanceof Mesh && mesh.hasThinInstances)
        ) {
          mixed.set(key(owner), [NaN]);
          continue;
        }
        mesh.computeWorldMatrix();
        const distance = Vector3.Distance(
          sub.getBoundingInfo().boundingSphere.centerWorld,
          eye,
        );
        const bucket = key(mesh),
          list = mixed.get(bucket) ?? [];
        list.push(distance);
        mixed.set(bucket, list);
      }
    }
    const renderer = (
      scene as unknown as { _renderingManager: RenderingManager }
    )._renderingManager;
    for (const batch of live) {
      const group = renderer.getRenderingGroup(
        batch.source.renderingGroupId,
      ) as unknown as { _transparentSortCompareFn: unknown };
      let allowed = group._transparentSortCompareFn === stockSort;
      let min = Vector3.Distance(
          batch.source.getBoundingInfo().boundingSphere.centerWorld,
          eye,
        ),
        max = min;
      for (const mesh of batch.jets())
        if (mesh.isEnabled()) {
          const distance = Vector3.Distance(
            mesh.getBoundingInfo().boundingSphere.centerWorld,
            eye,
          );
          min = Math.min(min, distance);
          max = Math.max(max, distance);
          allowed &&=
            Math.sign(mesh.getWorldMatrix().determinant()) ===
            Math.sign(batch.source.getWorldMatrix().determinant());
        }
      allowed &&=
        Number.isFinite(min) &&
        Number.isFinite(max) &&
        !(mixed.get(key(batch.source)) ?? []).some(
          (distance) =>
            !Number.isFinite(distance) || (distance >= min && distance <= max),
        );
      // Prewarm the instanced source variant while the established clones
      // remain visible. Three stable evaluations do not imply shader readiness.
      allowed &&= batch.source.isReady(true, true);
      batch.allow(allowed);
    }
  });
  return {
    add(batch: ExhaustBatch) {
      batches.add(batch);
    },
    remove(batch: ExhaustBatch) {
      batches.delete(batch);
      if (!batches.size) {
        scene.onBeforeActiveMeshesEvaluationObservable.remove(observer);
        coordinators.delete(scene);
      }
    },
  };
}
export function registerExhaustBatch(scene: Scene, batch: ExhaustBatch) {
  let owner = coordinators.get(scene);
  if (!owner) {
    owner = coordinator(scene);
    coordinators.set(scene, owner);
  }
  owner.add(batch);
  return () => owner.remove(batch);
}
