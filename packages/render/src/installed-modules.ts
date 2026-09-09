import type {Scene} from '@babylonjs/core/scene';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import type {PartAsset,PartPlacement} from '../../content/src/assembly';
import {equipmentPlacement,loadEquipmentPrototypes} from './installed-equipment';

/** Only placed assets are loaded into the game; the full catalog stays in Shipyard. */
export async function loadInstalledModules(scene:Scene,parent:TransformNode,kind:'cargo'|'floor') {
  const response=await fetch(`/assets/assembly/${kind}-manifest.json`);
  if(!response.ok)throw new Error(`Installed ${kind} manifest unavailable`);
  const manifest=await response.json() as {entries:{asset:PartAsset;placements:PartPlacement[]}[]};
  const entries=manifest.entries.filter(e=>e.placements.length>0);
  const prototypes=await loadEquipmentPrototypes(scene,entries.map(e=>e.asset));
  const placements=entries.flatMap(e=>e.placements.map(p=>{
    const placed=equipmentPlacement(scene,parent,e.asset,p,prototypes.get(e.asset.id)!);
    for(const mesh of placed.meshes){
      mesh.metadata={...mesh.metadata,category:e.asset.category,installedModule:kind};
      if(kind==='floor')mesh.isPickable=false;
    }
    return placed;
  }));
  return {placements,meshes:placements.flatMap(p=>p.meshes)};
}
