import type { Scene } from "@babylonjs/core/scene";
import { createActiveSetRevision } from "./active-set-revision";

/** Scene-wide cache is admitted only after stable, fully ready seated Flight.
 * Mesh internals stay live; a changed graph/view/transform discards the list. */
export function createFlightActiveSet(scene:Scene){
  let eligible=false,disposed=false,frozen=false,pending=false,stable=0,previous=-1,generation=0;
  const invalidate=()=>{generation++;stable=0;if(frozen||pending)scene.unfreezeActiveMeshes();frozen=false;pending=false;};
  const revision=createActiveSetRevision(invalidate);
  const release=()=>{invalidate();if(previous!==-1){revision.dispose();previous=-1;}};
  const observer=scene.onBeforeRenderObservable.add(()=>{
    if(!eligible || scene.activeCameras?.length || !scene.activeCamera || scene.getEngine().snapshotRendering){release();return;}
    const current=revision.capture(scene);
    if(current!==previous){invalidate();previous=current;return;}
    if(frozen||pending||++stable<3||!scene.isReady(true))return;
    const token=++generation;pending=true;
    scene.freezeActiveMeshes(true,()=>{
      if(disposed || token!==generation || !eligible){scene.unfreezeActiveMeshes();return;}
      pending=false;frozen=true;
    },()=>{if(token===generation){pending=false;stable=0;}},false);
  });
  return {
    prepare(settledSeatedFlight:boolean){eligible=settledSeatedFlight;if(!eligible)release();scene.onBeforeRenderObservable.makeObserverBottomPriority(observer);},
    invalidate,
    snapshot:()=>({frozen,pending}),
    dispose(){if(disposed)return;disposed=true;invalidate();scene.onBeforeRenderObservable.remove(observer);revision.dispose();},
  };
}
