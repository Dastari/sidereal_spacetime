import type {NativePlanetKit} from '../native-planet-composition';
import {composeToxicFog,TOXIC_FOG_BANK_LIMIT,type ToxicFogAnchor} from './toxic_fog_composition_r005';
type Vec=[number,number,number];
export type ToxicBodyBatch={positions:ArrayLike<number>;indices:ArrayLike<number>;ranges:readonly{firstTriangle:number;triangleCount:number;partId:string}[]};
/** Explicit native material-role indices, selected by the owning composition.
 * Range identity supplies the region; no mesh names or camera-facing fallback.
 * Area weighting makes source triangle subdivision irrelevant to anchoring. */
export function toxicFogAnchors(batches:readonly ToxicBodyBatch[],emitterMaterialRoles:readonly number[],radialOffset=.10):ToxicFogAnchor[]{
 if(!Number.isFinite(radialOffset)||radialOffset<0)throw new Error('Invalid fog radial offset');
 const anchors=new Map<string,{sum:Vec;radius:number;area:number}>();
 for(const role of new Set(emitterMaterialRoles)){
  const batch=batches[role];if(!batch)throw new Error('Missing toxic emitter material role');
  for(const range of batch.ranges){
   if(!range.partId||range.firstTriangle<0||range.triangleCount<0||!Number.isInteger(range.firstTriangle)||!Number.isInteger(range.triangleCount)||(range.firstTriangle+range.triangleCount)*3>batch.indices.length)throw new Error('Invalid toxic placement range');
   for(let t=range.firstTriangle*3;t<(range.firstTriangle+range.triangleCount)*3;t+=3){
    const points=[0,1,2].map(k=>{const index=batch.indices[t+k]*3;const p=[batch.positions[index],batch.positions[index+1],batch.positions[index+2]]as Vec;if(!p.every(Number.isFinite))throw new Error('Invalid toxic emitter geometry');return p;});
    const [a,b,c]=points,ab=b.map((v,i)=>v-a[i]),ac=c.map((v,i)=>v-a[i]),area=Math.hypot(ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0])/2;if(area<=1e-12)continue;
    const value=anchors.get(range.partId)??{sum:[0,0,0]as Vec,radius:0,area:0};
    for(let i=0;i<3;i++)value.sum[i]+=(a[i]+b[i]+c[i])/3*area;
    value.radius+=points.reduce((sum,p)=>sum+Math.hypot(...p),0)/3*area;value.area+=area;anchors.set(range.partId,value);
   }
  }
 }
 if(anchors.size>TOXIC_FOG_BANK_LIMIT)throw new Error('Toxic fog anchor budget exceeded; author an explicit bounded selection');
 return [...anchors].sort(([a],[b])=>a.localeCompare(b)).map(([partId,value])=>{const length=Math.hypot(...value.sum);if(length<=1e-12)throw new Error('Degenerate toxic emitter anchor');const radius=value.radius/value.area+radialOffset;return {partId,position:value.sum.map(v=>v/length*radius)as Vec};});
}
export function composeToxicReferenceWeather(kit:NativePlanetKit,seed:number,coverage:number,batches:readonly ToxicBodyBatch[],emitterMaterialRoles:readonly number[]){
 if(String(kit.layout)!=='toxic-fog-banks'||kit.materials.length!==1)throw new Error('Expected single-material native Toxic fog kit');
 if(coverage<=0)return undefined;
 const anchors=toxicFogAnchors(batches,emitterMaterialRoles);if(!anchors.length)return undefined;
 const fog=composeToxicFog(kit,seed,coverage,0,anchors)[0];
 return {positions:Array.from(fog.positions),normals:Array.from(fog.normals),uvs:Array.from(fog.uvs),indices:Array.from(fog.indices),faces:fog.indices.length/3,ranges:fog.ranges};
}
