import type {NativePlanetKit}from'../native-planet-composition';
import {unit,cross,seeded,globeAnchor,tangent,type Vec}from'./native_reference_assembly';
import {deformedNormalAt}from'./native_deformation_normals';
export const TOXIC_FOG_BANK_LIMIT=12;
const names=['toxic-fog-low-bank','toxic-fog-vent-plume','toxic-fog-broken-wisp']as const;
export type ToxicFogAnchor={partId:string;position:Vec;variant?:typeof names[number];scale?:number};
/** Worker-pure Toxic-only weather. Explicit vent anchors are body-local and
 * placement-owned; absent anchors use a stable bounded hemisphere distribution.
 * No LOD parameter: retain the same authored fog geometry through transitions. */
export function composeToxicFog(kit:NativePlanetKit,seed:number,coverage:number,phase=0,anchors:readonly ToxicFogAnchor[]=[]){
 if(![seed,coverage,phase].every(Number.isFinite))throw new Error('Fog inputs must be finite');
 if(anchors.length>TOXIC_FOG_BANK_LIMIT||new Set(anchors.map(a=>a.partId)).size!==anchors.length)throw new Error('Provide at most12 uniquely authored fog anchors');
 for(const anchor of anchors)if(!anchor.partId||!anchor.position.every(Number.isFinite)||Math.hypot(...anchor.position)<.5||anchor.scale!==undefined&&(!Number.isFinite(anchor.scale)||anchor.scale<=0))throw new Error('Invalid native fog anchor');
 const random=seeded((seed>>>0)^0x6d2b79f5),directionPhase=random()*Math.PI*2,c=Math.cos(phase),s=Math.sin(phase),order=[0,7,3,10,5,1,8,4,11,6,2,9];
 const sourceAnchors=anchors.length?anchors:order.map(i=>({partId:`limb-${i}`,position:globeAnchor(i,12,directionPhase).map(v=>v*1.055)as Vec}));
 const count=coverage<=0?0:Math.min(sourceAnchors.length,Math.max(2,Math.ceil(Math.min(1,coverage)*sourceAnchors.length)));
 const batches=kit.materials.map(()=>({positions:[]as number[],normals:[]as number[],uvs:[]as number[],indices:[]as number[],ranges:[]as{firstTriangle:number;triangleCount:number;partId:string}[]}));
 for(let index=0;index<count;index++){
  const anchor:ToxicFogAnchor=sourceAnchors[index],name=anchor.variant??names[index%3],source=kit.variants.find(v=>v.name===name)as NativePlanetKit['variants'][number]&{normals:number[];uvs:number[]};
  if(!source||source.normals?.length!==source.positions.length||source.uvs?.length!==source.positions.length/3*2)throw new Error('Missing native fog geometry/normal/UV');
  const scale=anchor.scale??(.13+random()*.065),rotation=random()*Math.PI*2,radius=Math.hypot(...anchor.position),place=tangent(unit(anchor.position),scale,rotation,radius-1,true,name==='toxic-fog-vent-plume'?.16:.12);
  const transform=(v:Vec):Vec=>{const p=place(v);return[c*p[0]+s*p[2],p[1],-s*p[0]+c*p[2]];};
  const starts=batches.map(b=>b.indices.length/3);
  for(let t=0;t<source.indices.length;t+=3){
   const batch=batches[source.triangleMaterials[t/3]];if(!batch)throw new Error('Missing native fog material role');const start=batch.positions.length/3;
   for(let k=0;k<3;k++){
    const vertex=source.indices[t+k],p=source.positions.slice(vertex*3,vertex*3+3)as Vec,n=source.normals.slice(vertex*3,vertex*3+3)as Vec;
    batch.positions.push(...transform(p));batch.normals.push(...deformedNormalAt(n,p,transform));batch.uvs.push(...source.uvs.slice(vertex*2,vertex*2+2));
   }
   batch.indices.push(start,start+1,start+2);
  }
  batches.forEach((b,i)=>{const count=b.indices.length/3-starts[i];if(count)b.ranges.push({firstTriangle:starts[i],triangleCount:count,partId:`toxic-fog:${anchor.partId}`});});
 }
 return batches.map(b=>({...b,positions:Float32Array.from(b.positions),normals:Float32Array.from(b.normals),uvs:Float32Array.from(b.uvs),indices:Uint32Array.from(b.indices)}));
}
