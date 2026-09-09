import {VoxelVolume} from '../packages/sim/src/voxels';
/** Publication metadata integration only; no TypeScript shape authoring. */
import {readFileSync,existsSync} from 'node:fs';
import type {PartAsset,PartPlacement} from '../packages/content/src/assembly';
const file='assets/runtime/assembly/hull-manifest.json';
export const installedHull=existsSync(file)?JSON.parse(readFileSync(file,'utf8')) as {entries:{asset:PartAsset;placements:PartPlacement[];volume:unknown}[];retired_placements:PartPlacement[];legacy_visual_cutoff_m:Record<string,number>;retired_visual_layers?:string[];retired_visual_regions?:{layer:string;min:number[];max:number[]}[];retain_deck_backing_below_m?:number;equipment_placement_overrides?:PartPlacement[];legacy_front_opening?:{layers:string[];minY:number;minX:number;maxX:number}}:undefined;
/** Retire the old forward visual cells and remesh a closed interface cap.
 * The original volume is still exported unchanged as its legacy proxy. */
export function hullVisualVolume(layer:string,source:VoxelVolume):VoxelVolume {
 if (installedHull?.retired_visual_layers?.includes(layer)) return new VoxelVolume();
 const regions=installedHull?.retired_visual_regions?.filter(r=>r.layer===layer)??[];
 const limit=installedHull?.legacy_visual_cutoff_m[layer];
 if(limit===undefined&&!regions.length)return source;
 const visual=new VoxelVolume();
 for(const chunk of source.chunks.values())for(let i=0;i<chunk.cells.length;i++){
  const m=chunk.cells[i],y=chunk.origin[1]+Math.floor(i/32)%32;
  const x=chunk.origin[0]+i%32,o=installedHull?.legacy_front_opening;
  const doorway=o?.layers.includes(layer)&&y*.0625>=o.minY&&x*.0625>=o.minX&&x*.0625<o.maxX;
  const z=chunk.origin[2]+Math.floor(i/1024);
  const replacedFloor=layer==='deck'&&installedHull?.retain_deck_backing_below_m!==undefined&&z*.0625>=installedHull.retain_deck_backing_below_m;
  const replacedRegion=regions.some(r=>[x,y,z].every((v,i)=>v*.0625>=r.min[i]&&v*.0625<r.max[i]));
  if(m&&y<(limit??Infinity)/.0625&&!doorway&&!replacedFloor&&!replacedRegion)visual.set(x,y,z,m);
 }
 return visual;
}
export function applyHullPublication(assets:PartAsset[],placements:PartPlacement[],volumes:Record<string,unknown>){
 if(!installedHull)return;
 // Regeneration must retain concurrent default-layout edits and new catalog assets.
 const existingCatalog='assets/runtime/assembly/catalog.json',existingDraft='assets/runtime/assembly/wayfarer.json';
 if(existsSync(existingDraft))placements.splice(0,placements.length,...JSON.parse(readFileSync(existingDraft,'utf8')).parts);
 if(existsSync(existingCatalog))for(const a of JSON.parse(readFileSync(existingCatalog,'utf8')).assets as PartAsset[]){if(!assets.some(current=>current.id===a.id))assets.push(a);}
 const existingVolumes='assets/runtime/assembly/catalog.voxels.json';
 if(existsSync(existingVolumes))for(const [id,v]of Object.entries(JSON.parse(readFileSync(existingVolumes,'utf8')).volumes)){if(!(id in volumes))volumes[id]=v;}
 const retired=new Set(installedHull.retired_placements.map(p=>p.id));
 for(let i=placements.length-1;i>=0;i--)if(retired.has(placements[i].id))placements.splice(i,1);
 for(const p of installedHull.equipment_placement_overrides??[]){const i=placements.findIndex(o=>o.id===p.id);if(i<0)throw Error("Pilot fixture identity missing: "+p.id);placements[i]=p;}
 for(const e of installedHull.entries){const a=assets.findIndex(a=>a.id===e.asset.id);if(a<0)assets.push(e.asset);else assets[a]=e.asset;volumes[e.asset.id]=e.volume;for(const p of e.placements){const i=placements.findIndex(o=>o.id===p.id);if(i<0)placements.push(p);else placements[i]=p;}}
 // Native floor/cargo publication survives regeneration without replacing the draft wholesale.
 for(const kind of ['floor','cargo']){
  const path=`assets/runtime/assembly/${kind}-manifest.json`;if(!existsSync(path))continue;
  const manifest=JSON.parse(readFileSync(path,'utf8')) as {entries:{asset:PartAsset;placements:PartPlacement[]}[]};
  for(const e of manifest.entries){const i=assets.findIndex(a=>a.id===e.asset.id);if(i<0)assets.push(e.asset);else assets[i]=e.asset;
   for(const p of e.placements){const j=placements.findIndex(o=>o.id===p.id);if(j<0)placements.push(p);else placements[j]=p;}
  }
 }
}
