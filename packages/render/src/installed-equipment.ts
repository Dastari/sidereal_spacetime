import { updateHullDecals } from './hull-decals';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { PartAsset, PartPlacement } from '../../content/src/assembly';
import { createEquipmentLighting } from './equipment-lighting';
import {batchStaticMaterials} from './static-material-batches';

/** Load the exact approved GLB. Geometry/materials remain shared, placed nodes do not. */
export async function loadEquipmentPrototypes(scene:Scene,assets:readonly PartAsset[]) {
 const result=new Map<string,Mesh[]>();
 const libraries=new Map<string,{sha256:string;meshes:Mesh[]}>();
 for(const asset of assets) {
  if(!asset.visual)continue;
  const url=asset.visual.url,split=url.lastIndexOf('/');
  let library=libraries.get(url);
  if(library&&library.sha256!==asset.visual.sha256)throw new Error('Conflicting visual revisions for shared GLB: '+url);
  if(!library){
   const imported=await SceneLoader.ImportMeshAsync('',url.slice(0,split+1),url.slice(split+1),scene);
   const meshes=imported.meshes.filter((m):m is Mesh=>m instanceof Mesh&&m.getTotalVertices()>0);
   for(const mesh of meshes){mesh.isVisible=false;mesh.isPickable=false;}
   library={sha256:asset.visual.sha256,meshes};libraries.set(url,library);
  }
  const prefix=asset.visual.nodePrefix;
  let meshes=prefix?library.meshes.filter(m=>m.name===prefix||m.name.startsWith(prefix+'_')||m.name.startsWith(prefix+'.')):library.meshes;
  if(!meshes.length)throw new Error('Empty visual mesh group: '+asset.id+(prefix?' / '+prefix:''));
  if(asset.category==='cargo'||asset.visual?.designId==='shipyard.hull.pilot-section')meshes=batchStaticMaterials(meshes);
  result.set(asset.id,meshes);
 }
 return result;
}
export function equipmentPlacement(scene:Scene,parent:TransformNode,asset:PartAsset,placement:PartPlacement,sources:Mesh[]) {
 const node=new TransformNode('placement-'+placement.id,scene);node.parent=parent;
 node.metadata={partId:placement.id,assetId:asset.id,designRevision:asset.visual?.revision};
 node.position.set(placement.position[0],placement.position[2],-placement.position[1]);
 node.rotation.y=placement.rotation;node.scaling.x=placement.flipped?-1:1;
 const meshes=sources.map(source=>{
  const mesh=source.clone('GEO-'+placement.id+'--native--'+source.name,node,true)!;
  mesh.isVisible=true;mesh.isPickable=true;mesh.metadata={partId:placement.id,assetId:asset.id};return mesh;
 });
 meshes.push(...updateHullDecals(scene,node,placement.decals,placement.flipped));
 const lighting=createEquipmentLighting(scene,node,asset.lights);lighting.setMeshes(meshes);
 return {node,meshes,lighting};
}
export async function loadInstalledEquipment(scene:Scene,parent:TransformNode,legacyMeshes:AbstractMesh[]) {
 const response=await fetch('/assets/assembly/equipment-manifest.json');
 if(!response.ok)throw new Error('Approved equipment manifest unavailable');
 const manifest=await response.json() as {entries:{asset:PartAsset;placements:PartPlacement[]}[]};
 const prototypes=await loadEquipmentPrototypes(scene,manifest.entries.map(e=>e.asset));
 const placements=manifest.entries.flatMap(e=>e.placements.map(p=>equipmentPlacement(scene,parent,e.asset,p,prototypes.get(e.asset.id)!)));
 const ids=manifest.entries.flatMap(e=>e.placements.map(p=>'GEO-'+p.id));
 // Retained old ship exports may still contain proxy visuals. Never show both.
 const retired=legacyMeshes.filter(m=>ids.some(id=>m.name===id||m.name.startsWith(id+'-')||m.name.startsWith(id+'_')));
 for(const mesh of retired)mesh.dispose();
 return {meshes:[...legacyMeshes.filter(m=>!retired.includes(m)),...placements.flatMap(p=>p.meshes)],placements};
}
