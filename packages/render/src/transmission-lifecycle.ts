import type { Scene } from "@babylonjs/core/scene";
import type { ITransmissionHelperHolder } from "@babylonjs/loaders/glTF/2.0/Extensions/transmissionHelper";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import {
  createTransmissionCaptureFilter,
  hasRigidMaterial,
} from "./transmission-capture";
import type { Light } from "@babylonjs/core/Lights/light";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import type { Material } from "@babylonjs/core/Materials/material";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { prepareTemporalInstanceAttributes } from "./temporal-instance-attributes";

export type CaptureExperiments = {
  captureOnMotion: boolean;
  captureGlobalsOnly: boolean;
};

/** Explicit experiment: idle skin/texture animation can lag in the glass.
 * Camera, crew/door transforms, visibility, content and lighting still wake it.
 * Compare actual values: large-world rendering updates matrix revisions even
 * when their elements have not changed. */
function captureMotionState(scene: Scene, target: RenderTargetTexture) {
  const values: unknown[] = [
    scene.activeCamera,
    scene.environmentIntensity,
    scene.lightsEnabled,
    scene.shadowsEnabled,
    target.getRenderWidth(),
    target.getRenderHeight(),
  ];
  const camera = target.activeCamera ?? scene.activeCamera;
  if (camera)
    values.push(
      ...camera.getViewMatrix().asArray(),
      ...camera.getProjectionMatrix().asArray(),
    );
  const list = target.renderList ?? scene.meshes;
  values.push(list.length);
  for (const mesh of list) {
    values.push(
      mesh,
      mesh.isEnabled(),
      mesh.isVisible,
      mesh.visibility,
      mesh.material,
    );
    if (mesh.isEnabled() && mesh.isVisible)
      values.push(...mesh.computeWorldMatrix().asArray());
  }
  for (const light of scene.lights) {
    values.push(light, light.isEnabled(), light.intensity, light.range);
    const position = light.getAbsolutePosition();
    values.push(position.x, position.y, position.z);
  }
  return values;
}

/** Babylon 9.25's glTF helper owns one scene-wide refraction target. A disposed
 * target can outlive its GPU resource in transmission materials between asset
 * lifetimes. Recreate it through the same helper before material binding; never
 * replace authored transmission with opaque fallback or dispose another scene.
 * This pinned SDK boundary also repairs all helper-managed material references. */
export function maintainSceneTransmission(
  scene: Scene,
  experiments?: () => CaptureExperiments,
  globals?: () => readonly Light[],
) {
  let disposed = false,
    repairs = 0;
  let target: RenderTargetTexture | null = null;
  let restoreCapture: (() => void) | null = null;
  const attachCapture = (next: RenderTargetTexture | null) => {
    if (next === target) return;
    restoreCapture?.();
    target = next;
    restoreCapture = null;
    if (!next) return;
    const previous = next.getCustomRenderList;
    const filter = createTransmissionCaptureFilter(scene, previous);
    next.getCustomRenderList = filter;
    const capturePassId = next.renderPassId;
    // Separate capture material buffers prevent the reduced lighting from
    // leaking into frozen main-pass uniforms. Textures/art stay shared.
    const clones = new Map<Material, Material>();
    const mappings = new Map<
      AbstractMesh,
      { previous: Material | undefined; clone: Material }
    >();
    let restorePass: (() => void) | undefined;
    const cloneMaterial = (original: Material): Material | null => {
      const existing = clones.get(original);
      if (existing) {
        let changed = existing.alpha !== original.alpha;
        existing.alpha = original.alpha;
        if (
          original instanceof PBRMaterial &&
          existing instanceof PBRMaterial
        ) {
          changed ||=
            !existing.albedoColor.equals(original.albedoColor) ||
            !existing.emissiveColor.equals(original.emissiveColor) ||
            existing.emissiveIntensity !== original.emissiveIntensity;
          existing.albedoColor.copyFrom(original.albedoColor);
          existing.emissiveColor.copyFrom(original.emissiveColor);
          existing.emissiveIntensity = original.emissiveIntensity;
        } else if (
          original instanceof StandardMaterial &&
          existing instanceof StandardMaterial
        ) {
          changed ||=
            !existing.diffuseColor.equals(original.diffuseColor) ||
            !existing.emissiveColor.equals(original.emissiveColor);
          existing.diffuseColor.copyFrom(original.diffuseColor);
          existing.emissiveColor.copyFrom(original.emissiveColor);
        }
        if (changed) existing.unfreeze();
        return existing;
      }
      if (!hasRigidMaterial(original)) return null;
      const kind: Function = original.constructor;
      let clone: Material | null = null;
      if (kind === MultiMaterial) {
        const originalSub = (original as MultiMaterial).subMaterials;
        const sub = originalSub.map((material) =>
          material ? cloneMaterial(material) : null,
        );
        if (sub.some((material, i) => !material && originalSub[i])) return null;
        const multi = new MultiMaterial(
          `${original.name}:capture-globals`,
          scene,
        );
        multi.subMaterials = sub;
        clone = multi;
      } else if (kind === PBRMaterial || kind === StandardMaterial) {
        clone = original.clone(`${original.name}:capture-globals`);
        if (clone && "maxSimultaneousLights" in clone) {
          (clone as PBRMaterial | StandardMaterial).maxSimultaneousLights = 3;
          prepareTemporalInstanceAttributes(scene, [clone]);
        }
      }
      if (clone) clones.set(original, clone);
      return clone;
    };
    const clearMaterials = () => {
      restorePass?.();
      for (const [mesh, mapping] of mappings) {
        if (mesh.getMaterialForRenderPass(capturePassId) === mapping.clone)
          mesh.setMaterialForRenderPass(capturePassId, mapping.previous);
      }
      mappings.clear();
      for (const clone of clones.values()) clone.dispose(false, false);
      clones.clear();
    };
    const preparePass = () => {
      restorePass?.();
      if (!experiments?.().captureGlobalsOnly) {
        if (clones.size) clearMaterials();
        return;
      }
      const protectedLights = new Set(globals?.() ?? []);
      const restored: {
        mesh: AbstractMesh;
        lights: Light[];
        saved: Light[];
        shadows: boolean;
      }[] = [];
      const owners = new Set<AbstractMesh>();
      for (const placed of next.renderList ?? []) {
        const mesh =
          (placed as AbstractMesh & { sourceMesh?: AbstractMesh }).sourceMesh ??
          placed;
        if (owners.has(mesh) || !placed.isEnabled() || !placed.isVisible)
          continue;
        owners.add(mesh);
        const material = mesh.material;
        if (!material) continue;
        const clone = cloneMaterial(material);
        if (!clone) continue; // Unknown/custom shaders retain their contract.
        const prior = mappings.get(mesh);
        if (prior?.clone !== clone) {
          if (
            prior &&
            mesh.getMaterialForRenderPass(capturePassId) === prior.clone
          )
            mesh.setMaterialForRenderPass(capturePassId, prior.previous);
          mappings.set(mesh, {
            previous: mesh.getMaterialForRenderPass(capturePassId),
            clone,
          });
          next.setMaterialForRendering(mesh, clone);
        }
        const lights = mesh.lightSources;
        const saved = lights.slice();
        restored.push({ mesh, lights, saved, shadows: mesh.receiveShadows });
        lights.splice(
          0,
          lights.length,
          ...saved.filter((light) => protectedLights.has(light)).slice(0, 3),
        );
        // Pinned Babylon 9.25 backing field: only the capture's separate effect
        // sees this flag; its setter would dirty all main-pass draw wrappers.
        mesh._internalAbstractMeshDataInfo._receiveShadows = false;
      }
      restorePass = () => {
        for (const { mesh, lights, saved, shadows } of restored) {
          lights.splice(0, lights.length, ...saved);
          mesh._internalAbstractMeshDataInfo._receiveShadows = shadows;
        }
        restorePass = undefined;
      };
    };
    const pass = next.onBeforeBindObservable.add(preparePass);
    const restore = next.onAfterUnbindObservable.add(() => restorePass?.());
    const previousRender = next.render;
    const render: typeof next.render = function (
      this: RenderTargetTexture,
      ...args
    ) {
      try {
        return previousRender.apply(this, args);
      } finally {
        restorePass?.();
      }
    };
    next.render = render;
    const previousReady = next.isReadyForRendering;
    const ready: typeof next.isReadyForRendering = function (
      this: RenderTargetTexture,
    ) {
      preparePass();
      try {
        return previousReady.call(this);
      } finally {
        restorePass?.();
      }
    };
    next.isReadyForRendering = ready;
    const previousShouldRender = next._shouldRender;
    let lastMotion: unknown[] | undefined;
    let capturedReady = false;
    let motionEnabled = false;
    const shouldRender = function (this: RenderTargetTexture) {
      const enabled = experiments?.().captureOnMotion === true;
      if (enabled !== motionEnabled) {
        motionEnabled = enabled;
        lastMotion = undefined;
        capturedReady = false;
        next.resetRefreshCounter();
      }
      if (!enabled) return previousShouldRender.call(this);
      const motion = captureMotionState(scene, next);
      motion.push(experiments?.().captureGlobalsOnly);
      const changed =
        !lastMotion ||
        motion.length !== lastMotion.length ||
        motion.some((value, i) => !Object.is(value, lastMotion![i]));
      if (!changed && capturedReady) return false;
      if (changed) {
        lastMotion = motion;
        capturedReady = false;
        next.resetRefreshCounter();
      }
      return previousShouldRender.call(this);
    };
    next._shouldRender = shouldRender;
    const rendered = next.onAfterUnbindObservable.add(() => {
      if (motionEnabled && !capturedReady)
        capturedReady = next.isReadyForRendering();
    });
    // The helper renders its capture at environment intensity 1 and restores
    // the scene afterwards. Both passes share each material's uniform buffer,
    // and a frozen material is rewritten only by the first pass that sees a
    // moved camera: the capture. Its override then lit the main view, so
    // panels brightened on zoom. Keep the scene's own intensity for both.
    let intensity = scene.environmentIntensity;
    const remember = next.onBeforeBindObservable.add(
      () => (intensity = scene.environmentIntensity),
      undefined,
      true,
    );
    const retain = next.onBeforeBindObservable.add(
      () => (scene.environmentIntensity = intensity),
    );
    restoreCapture = () => {
      clearMaterials();
      next.onBeforeBindObservable.remove(pass);
      next.onAfterUnbindObservable.remove(restore);
      if (next.render === render) next.render = previousRender;
      if (next.isReadyForRendering === ready)
        next.isReadyForRendering = previousReady;
      if (next.getCustomRenderList === filter)
        next.getCustomRenderList = previous;
      next.onBeforeBindObservable.remove(remember);
      next.onBeforeBindObservable.remove(retain);
      next.onAfterUnbindObservable.remove(rendered);
      if (next._shouldRender === shouldRender)
        next._shouldRender = previousShouldRender;
    };
  };
  const repair = () => {
    if (disposed || scene.isDisposed) return;
    const helper = (scene as Scene & Partial<ITransmissionHelperHolder>)
      ._transmissionHelper;
    const opaqueTarget = helper?.getOpaqueTarget();
    if (helper && opaqueTarget && !helper._isRenderTargetValid()) {
      helper._setupRenderTargets();
      repairs++;
    }
    const next = helper?.getOpaqueTarget();
    attachCapture(next instanceof RenderTargetTexture ? next : null);
  };
  const observer = scene.onBeforeRenderObservable.add(repair);
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    restoreCapture?.();
    restoreCapture = null;
    target = null;
    scene.onBeforeRenderObservable.remove(observer);
    scene.onDisposeObservable.remove(disposeObserver);
  };
  const disposeObserver = scene.onDisposeObservable.add(dispose);
  return {
    repair,
    invalidate() {
      attachCapture(null);
    },
    get repairs() {
      return repairs;
    },
    dispose,
  };
}
