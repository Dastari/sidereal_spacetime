import type { Scene } from "@babylonjs/core/scene";
import type { ITransmissionHelperHolder } from "@babylonjs/loaders/glTF/2.0/Extensions/transmissionHelper";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { createTransmissionCaptureFilter } from "./transmission-capture";

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
    restoreCapture = () => {
      if (next.getCustomRenderList === filter)
        next.getCustomRenderList = previous;
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
