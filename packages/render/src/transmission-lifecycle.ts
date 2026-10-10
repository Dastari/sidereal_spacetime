import type { Scene } from "@babylonjs/core/scene";
import type { ITransmissionHelperHolder } from "@babylonjs/loaders/glTF/2.0/Extensions/transmissionHelper";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import {
  createTransmissionCaptureFilter,
  createTransmissionVisibilityTest,
} from "./transmission-capture";

// Babylon 9.25 boundary. Mixed meshes are in the opaque cache, but their glass
// submeshes still consume this target. Missing SDK fields disable the optimization.
function transmissionCandidates(scene: Scene): Iterable<AbstractMesh> | null {
  const helper = (scene as Scene & Partial<ITransmissionHelperHolder>)
    ._transmissionHelper as unknown as
    | {
        _transparentMeshesCache?: AbstractMesh[];
        _translucentMaterialIndices?: Map<AbstractMesh, Set<number>>;
      }
    | undefined;
  if (
    !Array.isArray(helper?._transparentMeshesCache) ||
    !(helper?._translucentMaterialIndices instanceof Map)
  )
    return null;
  const transparent = helper._transparentMeshesCache;
  const mixed = helper._translucentMaterialIndices;
  return (function* () {
    yield* transparent;
    yield* mixed.keys();
  })();
}

/** Babylon 9.25's glTF helper owns one scene-wide refraction target. A disposed
 * target can outlive its GPU resource in transmission materials between asset
 * lifetimes. Recreate it through the same helper before material binding; never
 * replace authored transmission with opaque fallback or dispose another scene.
 * This pinned SDK boundary also repairs all helper-managed material references. */
export function maintainSceneTransmission(scene: Scene) {
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
    const previousShouldRender = next._shouldRender;
    const visible = createTransmissionVisibilityTest(scene, next, () =>
      transmissionCandidates(scene),
    );
    let skipped = false;
    const shouldRender: typeof next._shouldRender = function (
      this: RenderTargetTexture,
    ) {
      // Snapshot playback needs a stable pass topology (Babylon's own rule).
      if (!scene.getEngine().snapshotRendering && !visible()) {
        skipped = true;
        return false;
      }
      if (skipped) {
        next.resetRefreshCounter();
        skipped = false;
      }
      return previousShouldRender.call(this);
    };
    next._shouldRender = shouldRender;
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
      if (next.getCustomRenderList === filter)
        next.getCustomRenderList = previous;
      if (next._shouldRender === shouldRender)
        next._shouldRender = previousShouldRender;
      next.onBeforeBindObservable.remove(remember);
      next.onBeforeBindObservable.remove(retain);
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
    get repairs() {
      return repairs;
    },
    dispose,
  };
}
