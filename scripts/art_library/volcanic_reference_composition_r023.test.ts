import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {PBRMaterial} from '@babylonjs/core/Materials/PBR/pbrMaterial';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData';
import {Ray} from '@babylonjs/core/Culling/ray';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {composeVolcanicReference} from './volcanic_reference_composition_r023';
import {tangent} from './native_reference_assembly';
import type {NativePlanetKit} from '../../packages/render/src/environment/native-planet-composition';
const kit=JSON.parse(readFileSync('output/playwright/planet-reference-20260914/volcanic-r023/kit.json','utf8')) as NativePlanetKit;
it('retains every regional surface and placement at all LODs within a bounded triangle budget',()=>{
 const levels=([0,1,2]as const).map(lod=>composeVolcanicReference(kit,38,lod));
 const geometry=(batch:typeof levels[number][number])=>batch.ranges.filter(r=>r.partId!=='volcanic-ground').map(r=>({id:r.partId,positions:Buffer.from(batch.positions.slice(r.firstTriangle*9,(r.firstTriangle+r.triangleCount)*9).buffer).toString('base64'),normals:Buffer.from(batch.normals.slice(r.firstTriangle*9,(r.firstTriangle+r.triangleCount)*9).buffer).toString('base64'),uvs:Buffer.from(batch.uvs.slice(r.firstTriangle*6,(r.firstTriangle+r.triangleCount)*6).buffer).toString('base64')}));
 for(let m=0;m<kit.materials.length;m++){expect(geometry(levels[1][m])).toEqual(geometry(levels[0][m]));expect(geometry(levels[2][m])).toEqual(geometry(levels[0][m]));}
 expect(levels[0].reduce((n,b)=>n+b.indices.length/3,0)).toBeLessThan(231000);
 expect(levels[2].reduce((n,b)=>n+b.indices.length/3,0)).toBeLessThan(154000);
 for(const b of levels[0]){expect(b.positions.every(Number.isFinite)).toBe(true);let valid=true;for(let i=0;i<b.normals.length;i+=3)if(Math.abs(Math.hypot(b.normals[i],b.normals[i+1],b.normals[i+2])-1)>1e-5)valid=false;expect(valid).toBe(true);}
});
it('NullEngine rays see recessed native lava before the substrate at every LOD',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
 try{for(const lod of [0,1,2]as const){
  const meshes=composeVolcanicReference(kit,38,lod,true).map((b,i)=>{const mesh=new Mesh(`volcanic-${i}`,scene);mesh.metadata={role:'planet',materialRole:i,triangleRanges:b.ranges};mesh.material=new PBRMaterial(`volcanic-role-${i}`,scene);const data=new VertexData();data.positions=b.positions;data.normals=b.normals;data.uvs=b.uvs;data.indices=b.indices;data.applyToMesh(mesh);mesh.computeWorldMatrix(true);return mesh;}).filter(mesh=>mesh.getTotalVertices()>0);
  const transform=tangent([.452,.388,.794],.26,0,0,true,.26);
  for(const point of [[.19,.39,0],[.12,.59,0],[.22,.81,0]] as [number,number,number][]){
   const d=Vector3.FromArray(transform(point)).normalize(),ray=new Ray(d.scale(2),d.scale(-1),3),hits=meshes.map(mesh=>({mesh,hit:ray.intersectsMesh(mesh,false)})).filter(v=>v.hit.hit&&v.hit.pickedPoint).sort((a,b)=>a.hit.distance-b.hit.distance);
   expect([3,5]).toContain(hits[0].mesh.metadata.materialRole);
   expect(hits[0].hit.pickedPoint!.length()).toBeLessThan(1.02);
   const substrate=hits.find(v=>v.mesh.metadata.materialRole===0)!;expect(substrate.hit.distance-hits[0].hit.distance).toBeGreaterThan(.005);
  }
  meshes.forEach(m=>m.dispose());
 }}finally{scene.dispose();engine.dispose();}
});
it('rejects missing native forms and invalid numeric input',()=>{
 expect(()=>composeVolcanicReference({...kit,variants:[]},38,0)).toThrow('Missing volcanic native variant');
 expect(()=>composeVolcanicReference(kit,NaN,0)).toThrow('Invalid volcanic composition');
});
