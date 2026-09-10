import type { Scene } from "@babylonjs/core/scene";
import type { Material } from "@babylonjs/core/Materials/material";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRBaseMaterial } from "@babylonjs/core/Materials/PBR/pbrBaseMaterial";

const staticRoles = new Set(["hull","roof","floor","wall","cargo","equipment","remote"]);
const owners = new WeakMap<Scene, {invalidate():void}>();
/** Call before a control changes material plugins or authored material state. */
export function invalidateStaticMaterials(scene: Scene) {owners.get(scene)?.invalidate();}

/** Freeze only fully compiled static material uses. A material shared with any
 * animated, switchable or unclassified use remains live. Geometry is untouched. */
export function createStaticMaterialFreeze(scene: Scene) {
  const entries=new Map<Material,{epoch:number;eligible:boolean;ready:boolean;used:boolean;dirty:boolean;owned:boolean}>();
  let epoch=0, disposed=false;
  const sceneValues:unknown[]=[];
  const invalidate=()=>{for(const [material,entry] of entries) if(entry.owned){material.unfreeze();entry.owned=false;}};
  const before=scene.onBeforeRenderObservable.add(()=>{
    epoch++;
    const values=[scene.lightsEnabled,scene.shadowsEnabled,scene.texturesEnabled,scene.environmentIntensity,
      scene.environmentTexture,scene.ambientColor.r,scene.ambientColor.g,scene.ambientColor.b];
    if(values.some((value,i)=>!Object.is(value,sceneValues[i]))) invalidate();
    for(let i=0;i<values.length;i++)sceneValues[i]=values[i];
    for(const mesh of scene.meshes) {
      const eligible=(staticRoles.has(mesh.metadata?.role) ||
        (mesh.metadata?.role === "proxy" && mesh.metadata.staticMaterial === true)) && !mesh.skeleton && !mesh.morphTargetManager &&
        !mesh.bakedVertexAnimationManager && !mesh.animations.length && !mesh.metadata?.mutableMaterial;
      for(const sub of mesh.subMeshes ?? []) {
        const material=sub.getMaterial();if(!material)continue;
        let entry=entries.get(material);
        if(!entry){entry={epoch:0,eligible:true,ready:true,used:false,dirty:false,owned:false};entries.set(material,entry);}
        if(entry.epoch!==epoch){
          entry.epoch=epoch;entry.ready=false;entry.used=false;entry.dirty=false;
          entry.eligible=!!eligible && (material instanceof StandardMaterial || material instanceof PBRBaseMaterial) &&
            !material.animations?.length && !material.metadata?.mutableMaterial &&
            !material.getActiveTextures().some(texture=>texture.animations.length>0 || texture.getClassName()==="VideoTexture");
        }
        entry.eligible &&= !!eligible;
        if(mesh.isEnabled() && mesh.isVisible && mesh.visibility>0) {
          entry.used=true;
          // A new/off-screen copy has no ready draw wrapper yet. Babylon still
          // compiles that first use while the shared material is frozen.
          entry.ready ||= !!sub.effect?.isReady();
          for(const wrapper of sub._drawWrappers)
            if(wrapper?.defines && typeof wrapper.defines !== "string") entry.dirty ||= wrapper.defines.isDirty;
        }
      }
    }
    for(const [material,entry] of entries) {
      if(entry.owned && !material.isFrozen)entry.owned=false;
      if(entry.owned && (entry.epoch!==epoch || !entry.eligible || !entry.ready || entry.dirty)) {
        material.unfreeze();entry.owned=false;
      }
      if(entry.epoch!==epoch)entries.delete(material);
    }
  });
  const after=scene.onAfterRenderObservable.add(()=>{
    for(const [material,entry] of entries) if(entry.eligible && entry.used && entry.ready && !entry.owned && !material.isFrozen) {
      // Dirty uses need one normal frame to rebuild their shader state first.
      if(entry.dirty)continue;
      material.freeze();entry.owned=true;
    }
  });
  const owner={invalidate};owners.set(scene,owner);
  return {
    prepare(){scene.onBeforeRenderObservable.makeObserverBottomPriority(before);},
    invalidate,
    dispose(){if(disposed)return;disposed=true;invalidate();scene.onBeforeRenderObservable.remove(before);
      scene.onAfterRenderObservable.remove(after);entries.clear();if(owners.get(scene)===owner)owners.delete(scene);},
  };
}
