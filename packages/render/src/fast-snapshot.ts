import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { SnapshotRenderingHelper } from "@babylonjs/core/Misc/snapshotRenderingHelper";
import { createSnapshotRevision } from "./snapshot-revision";

type Driver = Pick<SnapshotRenderingHelper,"enableSnapshotRendering"|"disableSnapshotRendering"|"updateMesh"|"updateMeshesForEffectLayer"|"dispose">;
export interface SnapshotFrame {ready:boolean;reducedMotion:boolean;temporal:boolean;displayRevision:number;}
export function createFastSnapshot(scene: Scene, driverFactory?: () => Driver) {
  const engine = scene.getEngine(), revision = createSnapshotRevision();
  let driver: Driver | undefined, armed = false, stable = 0, previous = -1;
  let input: SnapshotFrame = {ready:false,reducedMotion:false,temporal:false,displayRevision:0};
  let reason = "Loading scene";
  const disable = () => {if (armed) driver?.disableSnapshotRendering();armed=false;stable=0;};
  const observer = scene.onBeforeRenderObservable.add(() => {
    reason = !input.ready ? "Loading scene" : !input.reducedMotion ? "Animated environment" : input.temporal ? "Temporal AA" :
      scene.meshes.some(m=>!!m.morphTargetManager) ? "Morph targets require qualification" : "";
    if (reason) {disable();return;}
    const current = revision.capture(scene,input.displayRevision);
    if (current !== previous) {disable();previous=current;reason="Scene changed";return;}
    if (++stable >= 2 && !armed) {
      if (!driver) {
        if (driverFactory) driver = driverFactory();
        else {
          const flags = scene.meshes.filter((mesh): mesh is Mesh => mesh instanceof Mesh).map(mesh=>[mesh,mesh.ignoreCameraMaxZ] as const);
          driver = new SnapshotRenderingHelper(scene);
          for (const [mesh,ignore] of flags) mesh.ignoreCameraMaxZ=ignore;
        }
      }
      driver.enableSnapshotRendering();armed=true;
    }
    if (armed) {
      for (const mesh of scene.meshes) if (mesh.metadata?.role === "crew" && mesh.isEnabled() && mesh.isVisible) driver?.updateMesh(mesh);
      for (const layer of scene.effectLayers ?? []) driver?.updateMeshesForEffectLayer(layer,false);
    }
    reason = armed ? "" : "Waiting for stable scene";
  });
  return {
    prepare(frame: SnapshotFrame) {
      input=frame;
      // Visibility/AA/selection observers must run before the bundle admission check.
      scene.onBeforeRenderObservable.makeObserverBottomPriority(observer);
    },
    snapshot: () => ({enabled:!!engine.snapshotRendering,armed,reason}),
    dispose() {disable();scene.onBeforeRenderObservable.remove(observer);driver?.dispose();revision.dispose();},
  };
}
