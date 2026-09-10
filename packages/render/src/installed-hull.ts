import type {Scene} from '@babylonjs/core/scene';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import type {PartAsset,PartPlacement} from '../../content/src/assembly';
import {loadEquipmentPrototypes,equipmentPlacement} from './installed-equipment';
/** Published Blender hull shares the same ship frame and independent placement identities. */
export async function loadInstalledHull(scene:Scene,parent:TransformNode){
 const response=await fetch('/assets/assembly/hull-manifest.json');
 if(!response.ok)throw Error('Published hull manifest unavailable');
 const manifest=await response.json() as {entries:{asset:PartAsset;placements:PartPlacement[]}[]};
 const entries=manifest.entries.filter(e=>e.placements.length),prototypes=await loadEquipmentPrototypes(scene,entries.map(e=>e.asset));
 const placements=entries.flatMap(e=>e.placements.map(p=>{
  const result=equipmentPlacement(scene,parent,e.asset,p,prototypes.get(e.asset.id)!);
  for(const mesh of result.meshes){
   mesh.metadata={...mesh.metadata,publishedHull:true,category:e.asset.category,cutawayFade:e.asset.category==='roof',shadowStructural:e.asset.category==='roof'};
   if(e.asset.category==='roof')mesh.name='GEO-roof-hull-'+p.id+'--'+mesh.name;
  }
  return result;
 }));
 return {placements,meshes:placements.flatMap(p=>p.meshes)};
}
