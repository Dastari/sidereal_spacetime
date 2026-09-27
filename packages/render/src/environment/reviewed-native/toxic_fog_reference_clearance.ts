import type {ReviewedComposerInput as NativePlanetKit} from './reviewed-composer-input';
import {composeToxicFog,type ToxicFogAnchor} from './toxic_fog_composition_r005';
import {toxicFogAnchors,type ToxicBodyBatch} from './toxic_fog_reference_integration';
import {unit,cross,type Vec} from './native_reference_assembly';
const dot=(a:Vec,b:Vec)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
/** Successor to floor+.10 placement. Conservatively clears every native triangle
 * whose projected bounds overlap the bank footprint, including adjacent regions.
 * Radial native mapping keeps angular footprint and per-vertex height offsets
 * unchanged when anchor radius changes. No density/material compensation. */
export function clearedToxicFogAnchors(kit:NativePlanetKit,seed:number,coverage:number,batches:readonly ToxicBodyBatch[],roles:readonly number[],clearance=.012){
 if(!Number.isFinite(clearance)||clearance<=0)throw new Error('Fog clearance must be positive');
 const initial=toxicFogAnchors(batches,roles,0);if(!initial.length||coverage<=0)return {anchors:[]as ToxicFogAnchor[],records:[]as FogClearanceRecord[]};
 const probe=composeToxicFog(kit,seed,coverage,0,initial)[0],anchors=initial.map(a=>({...a,position:[...a.position]as Vec})),records:FogClearanceRecord[]=[];
 for(const range of probe.ranges){
  const anchor=anchors.find(a=>'toxic-fog:'+a.partId===range.partId)!;const radius=Math.hypot(...anchor.position),n=unit(anchor.position),east=unit(cross(Math.abs(n[1])>.95?[1,0,0]:[0,1,0],n)),north=cross(n,east);
  const project=(p:Vec)=>{const d=dot(p,n);return d<=0?undefined:[dot(p,east)/d,dot(p,north)/d]as[number,number];};
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minOffset=Infinity;
  for(let i=range.firstTriangle*3;i<(range.firstTriangle+range.triangleCount)*3;i++){
   const index=probe.indices[i]*3,p=Array.from(probe.positions.slice(index,index+3))as Vec,q=project(p)!;
   minX=Math.min(minX,q[0]);maxX=Math.max(maxX,q[0]);minY=Math.min(minY,q[1]);maxY=Math.max(maxY,q[1]);minOffset=Math.min(minOffset,Math.hypot(...p)-radius);
  }
  let terrainRadius=0;const obstructingPartIds=new Set<string>();
  for(const batch of batches)for(const placement of batch.ranges){
   if(!placement.partId)throw new Error('Terrain clearance requires placement identity');
   for(let i=placement.firstTriangle*3;i<(placement.firstTriangle+placement.triangleCount)*3;i+=3){
    const points=[0,1,2].map(k=>{const index=batch.indices[i+k]*3;return[batch.positions[index],batch.positions[index+1],batch.positions[index+2]]as Vec;}),q=points.map(project);
    if(q.some(v=>!v))continue;
    const xs=q.map(v=>v![0]),ys=q.map(v=>v![1]);
    if(Math.max(...xs)<minX||Math.min(...xs)>maxX||Math.max(...ys)<minY||Math.min(...ys)>maxY)continue;
    const height=Math.max(...points.map(p=>Math.hypot(...p)));if(!Number.isFinite(height))throw new Error('Nonfinite terrain height');
    terrainRadius=Math.max(terrainRadius,height);obstructingPartIds.add(placement.partId);
   }
  }
  if(!terrainRadius)throw new Error('No authored terrain beneath fog footprint');
  const correctedRadius=terrainRadius+clearance-minOffset;anchor.position=n.map(v=>v*correctedRadius)as Vec;
  records.push({partId:anchor.partId,initialRadius:radius,correctedRadius,terrainRadius,minimumFogRadius:correctedRadius+minOffset,clearance,terrainPartIds:[...obstructingPartIds].sort()});
 }
 return {anchors,records};
}
export type FogClearanceRecord={partId:string;initialRadius:number;correctedRadius:number;terrainRadius:number;minimumFogRadius:number;clearance:number;terrainPartIds:string[]};
export function composeClearedToxicReferenceWeather(kit:NativePlanetKit,seed:number,coverage:number,batches:readonly ToxicBodyBatch[],roles:readonly number[]){
 if(String(kit.layout)!=='toxic-fog-banks'||kit.materials.length!==1)throw new Error('Expected single-material native Toxic fog kit');
 const {anchors,records}=clearedToxicFogAnchors(kit,seed,coverage,batches,roles);if(!anchors.length)return undefined;
 const fog=composeToxicFog(kit,seed,coverage,0,anchors)[0];
 return {positions:Array.from(fog.positions),normals:Array.from(fog.normals),uvs:Array.from(fog.uvs),indices:Array.from(fog.indices),faces:fog.indices.length/3,ranges:fog.ranges,anchorClearance:records};
}
