import {cross,unit,type Vec} from './native_reference_assembly';
/** Transform a native planar face normal through a curved placement map.
 * Recomputing one normal per output triangle creates false diagonal facets on
 * an authored continuous cap. Different source face normals remain sharp. */
export function deformedFaceNormals(source:Vec[],transform:(v:Vec)=>Vec):Vec[]{
 const u=unit(source[1].map((v,k)=>v-source[0][k]) as Vec);
 const face=unit(cross(u,source[2].map((v,k)=>v-source[0][k]) as Vec));
 const v=cross(face,u),epsilon=1e-4;
 return source.map(point=>{
  const up=transform(point.map((x,k)=>x+epsilon*u[k]) as Vec),um=transform(point.map((x,k)=>x-epsilon*u[k]) as Vec),vp=transform(point.map((x,k)=>x+epsilon*v[k]) as Vec),vm=transform(point.map((x,k)=>x-epsilon*v[k]) as Vec);
  const du=up.map((x,k)=>x-um[k]) as Vec,dv=vp.map((x,k)=>x-vm[k]) as Vec;
  return unit(cross(du,dv));
 });
}
