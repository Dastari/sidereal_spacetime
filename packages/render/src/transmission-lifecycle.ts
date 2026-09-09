import type { Scene } from '@babylonjs/core/scene';
import type { ITransmissionHelperHolder } from '@babylonjs/loaders/glTF/2.0/Extensions/transmissionHelper';

/** Babylon 9.25's glTF helper owns one scene-wide refraction target. A disposed
 * target can outlive its GPU resource in transmission materials between asset
 * lifetimes. Recreate it through the same helper before material binding; never
 * replace authored transmission with opaque fallback or dispose another scene.
 * This pinned SDK boundary also repairs all helper-managed material references. */
export function maintainSceneTransmission(scene: Scene) {
  let disposed=false, repairs=0;
  const repair=()=>{
    if(disposed || scene.isDisposed)return;
    const helper=(scene as Scene & Partial<ITransmissionHelperHolder>)._transmissionHelper;
    const target=helper?.getOpaqueTarget();
    if(helper && target && !helper._isRenderTargetValid()) {
      helper._setupRenderTargets();
      repairs++;
    }
  };
  const observer=scene.onBeforeRenderObservable.add(repair);
  return {repair,get repairs(){return repairs;},dispose(){disposed=true;scene.onBeforeRenderObservable.remove(observer);}};
}
