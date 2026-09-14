import type {NativePlanetKit} from '../../packages/render/src/environment/native-planet-composition';
import type {Vec} from './native_reference_assembly';
/** Fixed native gas geometry: no LOD input or threshold rebuild. glTF UVs and
 * exported vertex normals are preserved with one rigid Z-up to Y-up rotation. */
export function composeGasReference(kit:NativePlanetKit){
 const batches=kit.materials.map(()=>({positions:[] as number[],normals:[] as number[],uvs:[] as number[],indices:[] as number[],ranges:[] as {firstTriangle:number;triangleCount:number;partId:string}[]}));
 const rotate=(v:Vec):Vec=>[v[0],v[2],-v[1]];
 for(const raw of kit.variants){
  const variant=raw as typeof raw & {normals:number[];uvs:number[]};
  if(variant.normals?.length!==variant.positions.length||variant.uvs?.length!==variant.positions.length/3*2)throw new Error(`Native gas attributes missing: ${variant.name}`);
  const starts=batches.map(b=>b.indices.length/3);
  for(let i=0;i<variant.indices.length;i+=3){const b=batches[variant.triangleMaterials[i/3]],start=b.positions.length/3;
   for(let k=0;k<3;k++){const index=variant.indices[i+k];b.positions.push(...rotate(variant.positions.slice(index*3,index*3+3) as Vec));b.normals.push(...rotate(variant.normals.slice(index*3,index*3+3) as Vec));b.uvs.push(...variant.uvs.slice(index*2,index*2+2));}b.indices.push(start,start+1,start+2);
  }
  batches.forEach((b,m)=>{const count=b.indices.length/3-starts[m];if(count)b.ranges.push({firstTriangle:starts[m],triangleCount:count,partId:variant.name});});
 }
 return batches.map(b=>({...b,positions:Float32Array.from(b.positions),normals:Float32Array.from(b.normals),uvs:Float32Array.from(b.uvs),indices:Uint32Array.from(b.indices)}));
}
