import{expect,it}from'vitest';
import{readFileSync}from'node:fs';
import{NullEngine}from'@babylonjs/core/Engines/nullEngine';
import{Scene}from'@babylonjs/core/scene';
import{Mesh}from'@babylonjs/core/Meshes/mesh';
import{VertexData}from'@babylonjs/core/Meshes/mesh.vertexData';
import{PBRMaterial}from'@babylonjs/core/Materials/PBR/pbrMaterial';
import{Material}from'@babylonjs/core/Materials/material';
import{Ray}from'@babylonjs/core/Culling/ray';
import{Vector3}from'@babylonjs/core/Maths/math.vector';
import{composeIceMoonReference}from'./ice_moon_reference_composition_r004';
import type{NativePlanetKit}from'../../packages/render/src/environment/native-planet-composition';
const kit=JSON.parse(readFileSync('output/playwright/planet-reference-20260914/ice-moon-2-r003/kit.json','utf8'))as NativePlanetKit;
it('preserves every retained native variant and material from the frozen source',()=>{
 const prior=JSON.parse(readFileSync('output/playwright/planet-reference-20260914/ice-moon-2-r002/kit.json','utf8'))as NativePlanetKit;
 expect(kit.materials).toEqual(prior.materials);
 for(const variant of kit.variants)expect(JSON.stringify(variant)).toBe(JSON.stringify(prior.variants.find(v=>v.name===variant.name)));
});
it('retains identical added-cut geometry and placement identities across all LODs',()=>{
 const a=composeIceMoonReference(kit,38,0);
 expect(a.reduce((n,b)=>n+b.indices.length/3,0)).toBe(185904);
 expect(a.some(b=>b.ranges.some(r=>r.partId==='planets--ice-moon-2/blue-cut-hero'))).toBe(true);
 for(const lod of [1,2]as const){const b=composeIceMoonReference(kit,38,lod);for(let i=0;i<a.length;i++){for(const field of ['positions','normals','uvs','indices']as const)expect(Buffer.from(a[i][field].buffer).equals(Buffer.from(b[i][field].buffer))).toBe(true);expect(a[i].ranges).toEqual(b[i].ranges);}}
});
it('NullEngine resolves the exposed added glacial cut to its placement instead of the old white ground',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
 try{
  for(const b of composeIceMoonReference(kit,38,0)){if(!b.indices.length)continue;const mesh=new Mesh('native',scene),v=new VertexData();v.positions=b.positions;v.normals=b.normals;v.uvs=b.uvs;v.indices=b.indices;v.applyToMesh(mesh);mesh.sideOrientation=Material.CounterClockWiseSideOrientation;mesh.material=new PBRMaterial('native',scene);mesh.metadata={role:'planet',trianglePlacementRanges:b.ranges};mesh.computeWorldMatrix(true);}
  const normal=new Vector3(-.86,.02,.51).normalize(),hit=scene.pickWithRay(new Ray(normal.scale(3),normal.negate(),4));
  expect(hit?.hit).toBe(true);expect(hit!.faceId).toBeGreaterThanOrEqual(0);
  const range=hit!.pickedMesh!.metadata.trianglePlacementRanges.find((r:{firstTriangle:number;triangleCount:number})=>hit!.faceId>=r.firstTriangle&&hit!.faceId<r.firstTriangle+r.triangleCount);
  expect(range.partId).toBe('planets--ice-moon-2/blue-cut-hero');
 }finally{scene.dispose();engine.dispose();}
});
