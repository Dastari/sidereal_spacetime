import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import { SnapshotRenderingHelper } from "@babylonjs/core/Misc/snapshotRenderingHelper";
import { createSnapshotRevision } from "./snapshot-revision";
import { meshesByRole, type MeshRoleCounts } from "./mesh-roles";

type Driver = Pick<SnapshotRenderingHelper,"enableSnapshotRendering"|"disableSnapshotRendering"|"updateMesh"|"updateMeshesForEffectLayer"|"dispose">;
export interface SnapshotFrame {ready:boolean;reducedMotion:boolean;temporal:boolean;displayRevision:number;}
export function createFastSnapshot(scene: Scene, driverFactory?: () => Driver) {
  const engine = scene.getEngine();
  let driver: Driver | undefined, armed = false, stable = 0, previous = -1, candidate = false;
  let input: SnapshotFrame = {ready:false,reducedMotion:false,temporal:false,displayRevision:0};
  let reason = "Loading scene";
  let recorded:{activeMeshes:number;activeIndices:number;meshesByRole:MeshRoleCounts}|undefined;
  const disable = () => {if (armed) driver?.disableSnapshotRendering();armed=false;stable=0;};
  const revision = createSnapshotRevision(disable);
  const release = () => {disable();revision.dispose();previous=-1;};
  const blocked = () => !input.ready ? "Loading scene" : !input.reducedMotion ? "Animated environment" : input.temporal ? "Temporal AA" :
    scene.activeCameras?.length ? "Multiple cameras" :
    scene.meshes.some(m=>m.isEnabled() && m.isVisible &&
      (m instanceof InstancedMesh ? m.sourceMesh.ignoreCameraMaxZ : m instanceof Mesh && m.ignoreCameraMaxZ)) ? "Per-mesh far-plane override" :
    scene.meshes.some(m=>m.isEnabled() && m.isVisible && !!m.morphTargetManager) ? "Morph targets require qualification" : "";
  const observer = scene.onBeforeRenderObservable.add(() => {
    reason = blocked();
    if (!candidate || reason) {release();return;}
    const current = revision.capture(scene,input.displayRevision);
    if (current !== previous) {disable();previous=current;reason="Scene changed";return;}
    if (++stable >= 2 && !armed && scene.isReady(true)) {
      if (!driver) {
        if (driverFactory) driver = driverFactory();
        else {
          const flags = scene.meshes.map(mesh=>{
            const flagged=mesh as typeof mesh & {ignoreCameraMaxZ?:boolean};
            return [flagged,flagged.ignoreCameraMaxZ,Object.hasOwn(flagged,"ignoreCameraMaxZ")] as const;
          });
          const morphs=new Map(scene.meshes.flatMap(mesh=>mesh.morphTargetManager
            ? [[mesh.morphTargetManager,mesh.morphTargetManager.numMaxInfluencers] as const] : []));
          try {driver = new SnapshotRenderingHelper(scene);}
          finally {
            for (const [mesh,ignore,owned] of flags) {
              if(owned)mesh.ignoreCameraMaxZ=ignore;else delete mesh.ignoreCameraMaxZ;
            }
            // The helper also rewrites hidden managers. Preserve their authored
            // configuration for later normal rendering when a variant is shown.
            for(const [manager,influencers] of morphs)manager.numMaxInfluencers=influencers;
          }
        }
      }
      driver.enableSnapshotRendering();armed=true;
    }
    if (armed) {
      for (const mesh of scene.meshes) if (mesh.metadata?.role === "crew" && mesh.isEnabled() && mesh.isVisible) driver?.updateMesh(mesh);
      for (const layer of scene.effectLayers ?? []) driver?.updateMeshesForEffectLayer(layer,false);
    }
    reason = armed ? (engine.snapshotRendering ? "" : "Preparing bundles") : "Waiting for stable scene";
  });
  const after=scene.onAfterRenderObservable.add(()=>{
    // FAST replay intentionally empties Babylon's CPU active list. Retain the
    // recorded draw inventory so F3 still describes the scene being submitted.
    if(armed && engine.snapshotRenderingMode !== 1)recorded={activeMeshes:scene.getActiveMeshes().length,
      activeIndices:scene.getActiveIndices(),meshesByRole:meshesByRole(scene)};
  });
  return {
    prepare(frame: SnapshotFrame) {
      input=frame;
      reason=blocked();candidate=!reason;
      // Release draw-membership listeners before the Flight active-list owner
      // takes over. The two caches must never own geometry callbacks together.
      if(!candidate)release();
      // Visibility/AA/selection observers must run before the bundle admission check.
      scene.onBeforeRenderObservable.makeObserverBottomPriority(observer);
      return candidate;
    },
    invalidate: disable,
    snapshot: () => ({enabled:!!engine.snapshotRendering,armed,reason}),
    activeStats:()=>{
      if(!armed || !engine.snapshotRendering || engine.snapshotRenderingMode !== 1)return undefined;
      // Babylon 9.25 counts skipped _draw attempts as well as bundle replay.
      // Use the recorded bundle draws, not that duplicated engine accumulator.
      const replay=(engine as unknown as {_snapshotRendering?:{play:boolean;_allBundleLists:{numDrawCalls:number}[]}})._snapshotRendering;
      const bundles=replay?.play ? replay._allBundleLists : undefined;
      return {...recorded,...(bundles?.length ? {drawCalls:bundles.reduce((sum,bundle)=>sum+bundle.numDrawCalls,0)} : {})};
    },
    dispose() {disable();scene.onBeforeRenderObservable.remove(observer);scene.onAfterRenderObservable.remove(after);
      driver?.dispose();revision.dispose();recorded=undefined;},
  };
}
