import {deformedNormalAt} from './native_deformation_normals';
import type {ReviewedComposerInput as NativePlanetKit} from './reviewed-composer-input';
type Vec=[number,number,number];
type Range={firstTriangle:number;triangleCount:number;partId:string};
const unit=(v:Vec):Vec=>{const n=Math.hypot(...v);if(n<1e-12)throw new Error('Degenerate native triangle');return [v[0]/n,v[1]/n,v[2]/n];};
const cross=(a:Vec,b:Vec):Vec=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
/** Native connected regional relief, pre-tessellated in Blender for curved
 * mapping. Embedded bowls, ledges and fractures share a closed native mesh.
 * Regions retain exact topology and transforms at every LOD. */
export function composeToxicMoonReference(kit:NativePlanetKit,seed:number,lod:0|1|2,diagnostic=false){
 const recipe=(kit as NativePlanetKit&{compositionRecipe?:{referenceId:string;layoutSeed:number;scales:number[];variantOffset:number}}).compositionRecipe;
 if(!recipe||!['planets--toxic-moon-1','planets--toxic-moon-2'].includes(recipe.referenceId)||!Number.isInteger(recipe.layoutSeed)||recipe.scales.length!==12||recipe.scales.some(v=>!Number.isFinite(v)||v<.3||v>.46))throw new Error('Explicit toxic moon composition recipe required');
 const batches=kit.materials.map(()=>({positions:[] as number[],normals:[] as number[],uvs:[] as number[],indices:[] as number[],ranges:[] as Range[]}));
 const variant=(name:string)=>{const value=kit.variants.find(v=>v.name===name);if(!value)throw new Error(`Missing rocky native variant ${name}`);return value;};
 let state=(seed^recipe.layoutSeed)>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 const phase=random()*Math.PI*2;
 function emit(name:string,id:string,transform:(v:Vec)=>Vec,smooth=false){
  const mesh=variant(name) as NativePlanetKit['variants'][number]&{normals:number[];uvs:number[]},starts=batches.map(b=>b.indices.length/3);
  if(mesh.normals?.length!==mesh.positions.length||mesh.uvs?.length!==mesh.positions.length/3*2)throw new Error('Missing native rocky normals or UVs');
  for(let i=0;i<mesh.indices.length;i+=3){
   const batch=batches[mesh.triangleMaterials[i/3]];if(!batch)throw new Error('Invalid native material role');
   const source=[0,1,2].map(k=>mesh.positions.slice(mesh.indices[i+k]*3,mesh.indices[i+k]*3+3) as Vec),p=source.map(transform);
   const normals=source.map((point,k)=>deformedNormalAt(mesh.normals.slice(mesh.indices[i+k]*3,mesh.indices[i+k]*3+3) as Vec,point,transform)),start=batch.positions.length/3;
   for(let k=0;k<3;k++){batch.positions.push(...p[k]);batch.normals.push(...normals[k]);batch.uvs.push(...mesh.uvs.slice(mesh.indices[i+k]*2,mesh.indices[i+k]*2+2));}
   // Blender source is CCW. No handedness reversal here; uploader uses CCW.
   batch.indices.push(start,start+1,start+2);
  }
  batches.forEach((b,i)=>{const count=b.indices.length/3-starts[i];if(count)b.ranges.push({firstTriangle:starts[i],triangleCount:count,partId:id});});
 }

 const regions:{n:Vec;scale:number;angle:number;name:string;id:string}[]=[];
 if(diagnostic)regions.push({n:unit([.452,.388,.794]),scale:.32,angle:0,name:'battered-region-a',id:'region-diagnostic'});
 else for(let i=0;i<12;i++){
  const y=1-2*(i+.5)/12,angle=phase+i*2.39996323,r=Math.sqrt(1-y*y);
  regions.push({n:[Math.cos(angle)*r,y,Math.sin(angle)*r],scale:recipe.scales[i],angle:random()*Math.PI*2,name:(i+recipe.variantOffset)%2?'battered-region-b':'battered-region-a',id:`${recipe.referenceId}/crust-${i}`});
 }
 const substrate=(v:Vec):Vec=>{
  const n=unit(v);let depression=0;
  for(const region of regions){
   const distance=Math.hypot(n[0]-region.n[0],n[1]-region.n[1],n[2]-region.n[2])/region.scale;
   const t=Math.max(0,Math.min(1,(distance-.47)/.40));
   depression=Math.max(depression,region.scale*.37*(1-t*t*(3-2*t)));
   const east=unit(cross(Math.abs(region.n[1])>.94?[1,0,0]:[0,1,0],region.n)),north=cross(region.n,east),c=Math.cos(region.angle),s=Math.sin(region.angle),x=(1.22*c-.07*s)*region.scale,y=(1.22*s+.07*c)*region.scale,pit=unit(region.n.map((v,k)=>v+east[k]*x+north[k]*y) as Vec),pd=Math.hypot(...n.map((v,k)=>v-pit[k]))/region.scale,pt=Math.max(0,Math.min(1,(pd-.22)/.20));
   depression=Math.max(depression,region.scale*.22*(1-pt*pt*(3-2*pt)));
  }
  return [n[0]*(1-depression),n[1]*(1-depression),n[2]*(1-depression)];
 };
 // Retained highest authored ground avoids triangles bridging native cavities.
 emit('ground-sphere',`${recipe.referenceId}/ground`,substrate,false);
 for(const region of regions){
  const n=region.n,east=unit(cross(Math.abs(n[1])>.94?[1,0,0]:[0,1,0],n)),north=cross(n,east),c=Math.cos(region.angle),s=Math.sin(region.angle);
  emit(region.name,region.id,v=>{
   const x=(v[0]*c-v[1]*s)*region.scale,y=(v[0]*s+v[1]*c)*region.scale,d=unit([n[0]+east[0]*x+north[0]*y,n[1]+east[1]*x+north[1]*y,n[2]+east[2]*x+north[2]*y]),h=1+v[2]*region.scale;
   return [d[0]*h,d[1]*h,d[2]*h];
  });
 }
 return batches.map(b=>({...b,positions:Float32Array.from(b.positions),normals:Float32Array.from(b.normals),uvs:Float32Array.from(b.uvs),indices:Uint32Array.from(b.indices)}));
}
