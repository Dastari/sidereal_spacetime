import {expect,it}from'vitest';
import {readFileSync}from'node:fs';
import {NullEngine}from'@babylonjs/core/Engines/nullEngine';
import {Scene}from'@babylonjs/core/scene';
import {Mesh}from'@babylonjs/core/Meshes/mesh';
import {PBRMaterial}from'@babylonjs/core/Materials/PBR/pbrMaterial';
import {VertexData}from'@babylonjs/core/Meshes/mesh.vertexData';
import {Ray}from'@babylonjs/core/Culling/ray';
import {Vector3}from'@babylonjs/core/Maths/math.vector';
import {toxicClearanceDiagnostic}from'./toxic_reference_clearance_diagnostic';
const kit=JSON.parse(readFileSync('output/playwright/planet-reference-20260914/toxic-r002/kit.json','utf8'));
it('NullEngine reproduces Toxic2 ground covering the basin and verifies native substrate clearance',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
 try{
  const n=new Vector3(.452,.388,.794).normalize(),e=Vector3.Cross(Vector3.Up(),n).normalize(),north=Vector3.Cross(n,e),d=n.add(e.scale(-.47*.3)).add(north.scale(.02*.3)).normalize(),ray=new Ray(d.scale(2),d.negate(),3);
  for(const clear of [false,true]){
   const batches=toxicClearanceDiagnostic(kit,clear),meshes=batches.map((b,i)=>{const mesh=new Mesh('toxic-clearance',scene);mesh.metadata={role:'planet',materialRole:i,triangleRanges:b.ranges};mesh.material=new PBRMaterial('toxic-native',scene);const data=new VertexData();data.positions=b.positions;data.normals=b.normals;data.indices=b.indices;data.applyToMesh(mesh);mesh.computeWorldMatrix(true);return mesh;});
   const hits=meshes.map(mesh=>({mesh,hit:ray.intersectsMesh(mesh,false)})).filter(v=>v.hit.hit).sort((a,b)=>a.hit.distance-b.hit.distance);
   expect(hits[0].mesh.metadata.materialRole).toBe(clear?8:6);
   const part=hits[0].mesh.metadata.triangleRanges.find((r:{firstTriangle:number;triangleCount:number})=>hits[0].hit.faceId>=r.firstTriangle&&hits[0].hit.faceId<r.firstTriangle+r.triangleCount)?.partId;
   expect(part).toBe(clear?'basin-diagnostic':'ground');
   for(const mesh of meshes){mesh.material?.dispose();mesh.dispose();}
  }
 }finally{scene.dispose();engine.dispose();}
},15000);
