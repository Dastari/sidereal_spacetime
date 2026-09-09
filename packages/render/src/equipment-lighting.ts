import { SpotLight } from '@babylonjs/core/Lights/spotLight';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Scene } from '@babylonjs/core/scene';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { PartLight } from '../../content/src/assembly';
import type { ManagedLocalLight } from './local-light-budget';

/** Bounded local illumination supplements exported emissive PBR surfaces.
 * Each fixture affects only its own placed meshes and follows their frame. */
export function createEquipmentLighting(scene:Scene,parent:TransformNode,descriptors:readonly PartLight[]=[]) {
  const lights:SpotLight[]=[];
  let powered=true,cabinVisible=true,budgetManaged=false,lightingAllowed=true;
  for(const [i,d] of descriptors.slice(0,2).entries()) {
    if(!d || ![d.position,d.direction,d.color].every(v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite)) ||
       ![d.intensity,d.range,d.angle].every(Number.isFinite) || Math.hypot(...d.direction)<1e-6) continue;
    const vector=(p:number[])=>new Vector3(p[0],p[2],-p[1]);
    const light=new SpotLight(`${parent.name}-fixture-${i}`,vector(d.position),vector(d.direction).normalize(),Math.max(.1,Math.min(Math.PI*.9,d.angle)),1,scene);
    light.parent=parent;
    light.diffuse=Color3.FromArray(d.color.map(n=>Math.max(0,Math.min(1,n))));
    light.intensity=Math.max(0,Math.min(2,d.intensity));
    light.range=Math.max(.1,Math.min(3,d.range));
    lights.push(light);
  }
  const eligible=(light:SpotLight)=>powered&&cabinVisible&&lightingAllowed&&!light.isDisposed()&&parent.isEnabled()
    &&light.intensity>0&&light.includedOnlyMeshes.some(mesh=>!mesh.isDisposed()&&mesh.isEnabled()&&mesh.isVisible&&mesh.visibility>0);
  function syncDesired(){
    if(budgetManaged)return;
    for(const light of lights)if(!light.isDisposed()&&light.isEnabled(false)!==eligible(light))light.setEnabled(eligible(light));
  }
  // The stable placement/socket key survives manifest order changes. A separate
  // ship instance supplies a different placed UUID, even when geometry is shared.
  const sources=lights.map((light,i)=>({light,id:`${parent.metadata?.partId??parent.name}:fixture:${i}`,
    apply:({enabled}:Parameters<ManagedLocalLight['apply']>[0])=>{
      if(light.isDisposed())return;
      const next=enabled&&eligible(light);
      if(light.isEnabled(false)!==next)light.setEnabled(next);
      if(light.shadowEnabled)light.shadowEnabled=false;
    },
  }));
  return {
    lights,
    setMeshes(meshes:AbstractMesh[]){for(const light of lights)light.includedOnlyMeshes=meshes;syncDesired();},
    setPowered(value:boolean){powered=value;syncDesired();},
    setCabinVisible(value:boolean){cabinVisible=value;syncDesired();},
    /** Current renderer world frame, after parent motion/origin changes. */
    getLocalLightSources(allowed=true):ManagedLocalLight[]{
      budgetManaged=true;lightingAllowed=allowed;
      const world=parent.computeWorldMatrix(true);
      return sources.filter(({light})=>!light.isDisposed()).map(({light,id,apply})=>({
        id,position:Vector3.TransformCoordinates(light.position,world),range:light.range,
        eligible:eligible(light),requiresShadow:false,shadowEligible:false,apply,
      }));
    },
    dispose(){for(const light of lights)light.dispose();},
  };
}
