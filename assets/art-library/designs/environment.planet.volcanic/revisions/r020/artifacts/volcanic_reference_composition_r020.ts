import type {NativePlanetKit} from '../../packages/render/src/environment/native-planet-composition';
import {deformedFaceNormals,deformedNormalAt} from './native_deformation_normals';
import {globeAnchor,seeded,tangent,unit,type Vec} from './native_reference_assembly';
/** Fixed native regional topology at every LOD. Only the quiet substrate changes
 * authored resolution; its radius stays below even the deepest molten floors. */
export function composeVolcanicReference(kit:NativePlanetKit,seed:number,lod:0|1|2,diagnostic=false){
 if(!Number.isFinite(seed)||![0,1,2].includes(lod))throw new Error('Invalid volcanic composition parameters');
 const batches=kit.materials.map(()=>({positions:[] as number[],normals:[] as number[],uvs:[] as number[],indices:[] as number[],ranges:[] as {firstTriangle:number;triangleCount:number;partId:string}[]}));
 function emit(name:string,partId:string,transform:(p:Vec)=>Vec,smooth=false){
  const mesh=kit.variants.find(v=>v.name===name) as (NativePlanetKit['variants'][number]&{normals?:number[];uvs?:number[]})|undefined;
  if(!mesh)throw new Error(`Missing volcanic native variant ${name}`);
  if(mesh.normals?.length!==mesh.positions.length||mesh.uvs?.length!==mesh.positions.length/3*2)throw new Error('Missing native volcanic normals or UVs');
  if(mesh.indices.length%3||mesh.triangleMaterials.length!==mesh.indices.length/3)throw new Error('Invalid volcanic topology');
  const starts=batches.map(b=>b.indices.length/3);
  for(let i=0;i<mesh.indices.length;i+=3){
   const batch=batches[mesh.triangleMaterials[i/3]];if(!batch)throw new Error('Invalid volcanic material role');
   const source=[0,1,2].map(k=>mesh.positions.slice(mesh.indices[i+k]*3,mesh.indices[i+k]*3+3) as Vec);
   if(source.some(v=>v.length!==3||v.some(x=>!Number.isFinite(x))))throw new Error('Invalid volcanic vertex');
   const positions=source.map(transform),normals=mesh.normals?.length===mesh.positions.length?source.map((p,k)=>deformedNormalAt(mesh.normals!.slice(mesh.indices[i+k]*3,mesh.indices[i+k]*3+3) as Vec,p,transform)):smooth?positions.map(unit):deformedFaceNormals(source,transform);
   const start=batch.positions.length/3;
   positions.forEach((p,k)=>{batch.positions.push(...p);batch.normals.push(...normals[k]);batch.uvs.push(...mesh.uvs!.slice(mesh.indices[i+k]*2,mesh.indices[i+k]*2+2));});batch.indices.push(start,start+1,start+2);
  }
  batches.forEach((b,i)=>{const triangleCount=b.indices.length/3-starts[i];if(triangleCount)b.ranges.push({firstTriangle:starts[i],triangleCount,partId});});
 }
 emit(lod===0?'ground-sphere':lod===1?'ground-sphere-medium':'ground-sphere-low','volcanic-ground',v=>unit(v).map(x=>x*.997) as Vec,true);
 const random=seeded(seed),phase=random()*Math.PI*2,count=diagnostic?1:12;
 for(let i=0;i<count;i++){
  const anchor:Vec=diagnostic?[.452,.388,.794]:globeAnchor(i,count,phase),scale=diagnostic?.26:[.39,.35,.42,.38,.36,.41,.35,.39,.37,.42,.38,.36][i],angle=diagnostic?0:random()*Math.PI*2;
  emit(`volcanic-region-${['a','b','c'][i%3]}`,`volcanic-region-${i}`,tangent(anchor,scale,angle,0,true,scale));
 }
 return batches.map(b=>({...b,positions:Float32Array.from(b.positions),normals:Float32Array.from(b.normals),uvs:Float32Array.from(b.uvs),indices:Uint32Array.from(b.indices)}));
}
