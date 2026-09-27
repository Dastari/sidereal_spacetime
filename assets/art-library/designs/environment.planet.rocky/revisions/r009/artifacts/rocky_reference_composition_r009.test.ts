import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {PBRMaterial} from '@babylonjs/core/Materials/PBR/pbrMaterial';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData';
import {Ray} from '@babylonjs/core/Culling/ray';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {composeRockyReference} from './rocky_reference_composition_r009';
import type {NativePlanetKit} from '../../packages/render/src/environment/native-planet-composition';
const kit=JSON.parse(readFileSync('output/playwright/planet-reference-20260914/rocky-r009/kit.json','utf8')) as NativePlanetKit;
it('retains complete native regional surfaces UVs normals and identities at every LOD',()=>{
 const a=composeRockyReference(kit,38,0),b=composeRockyReference(kit,38,2);
 for(let m=0;m<a.length;m++){for(const field of ['positions','normals','uvs','indices']as const)expect(Buffer.from(a[m][field].buffer).equals(Buffer.from(b[m][field].buffer))).toBe(true);expect(a[m].ranges).toEqual(b[m].ranges);expect(a[m].uvs.length).toBe(a[m].positions.length/3*2);}
 expect(a.reduce((n,b)=>n+b.indices.length/3,0)).toBeLessThan(167000);
});
it('NullEngine sees embedded deep crater floor before the cleared native substrate',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
 try{const meshes=composeRockyReference(kit,38,0,true).map((b,i)=>{const mesh=new Mesh(`rocky-${i}`,scene);mesh.metadata={role:'planet',materialRole:i,triangleRanges:b.ranges};mesh.material=new PBRMaterial(`rocky-role-${i}`,scene);const data=new VertexData();data.positions=b.positions;data.normals=b.normals;data.uvs=b.uvs;data.indices=b.indices;data.applyToMesh(mesh);mesh.computeWorldMatrix(true);return mesh;});
 const n=new Vector3(.452,.388,.794).normalize(),ray=new Ray(n.scale(2),n.negate(),3),hits=meshes.map(mesh=>({mesh,hit:ray.intersectsMesh(mesh,false)})).filter(v=>v.hit.hit&&v.hit.pickedPoint).sort((a,b)=>a.hit.distance-b.hit.distance);
 expect(hits[0].mesh.metadata.materialRole).toBe(2);expect(hits[0].hit.pickedPoint!.length()).toBeLessThan(.97);const ground=hits.find(v=>v.mesh.metadata.materialRole===0)!;expect(ground.hit.distance-hits[0].hit.distance).toBeGreaterThan(.003);
 const east=Vector3.Cross(Vector3.Up(),n).normalize(),north=Vector3.Cross(n,east),pd=n.add(east.scale(1.22*.32)).add(north.scale(.07*.32)).normalize(),pr=new Ray(pd.scale(2),pd.negate(),3),ph=meshes.map(mesh=>({mesh,hit:pr.intersectsMesh(mesh,false)})).filter(v=>v.hit.hit&&v.hit.pickedPoint).sort((a,b)=>a.hit.distance-b.hit.distance);
 expect(ph[0].mesh.metadata.materialRole).toBe(2);expect(ph[0].hit.pickedPoint!.length()).toBeLessThan(1);const pg=ph.find(v=>v.mesh.metadata.materialRole===0)!;expect(pg.hit.distance-ph[0].hit.distance).toBeGreaterThan(.003);
 const sd=n.add(east.scale(-1.74*.32)).add(north.scale(-.42*.32)).normalize(),sr=new Ray(sd.scale(2),sd.negate(),3),sh=meshes.map(mesh=>({mesh,hit:sr.intersectsMesh(mesh,false)})).filter(v=>v.hit.hit&&v.hit.pickedPoint).sort((a,b)=>a.hit.distance-b.hit.distance);
 expect(sh[0].mesh.metadata.materialRole).toBe(2);expect(sh[0].hit.pickedPoint!.length()).toBeGreaterThan(1);expect(sh[0].hit.pickedPoint!.length()).toBeLessThan(1+.17*.32);
 }finally{scene.dispose();engine.dispose();}
});
it('rejects missing authored optical attributes',()=>{expect(()=>composeRockyReference({...kit,variants:kit.variants.map(v=>({...v,normals:undefined}))},38,0)).toThrow('Missing native rocky normals or UVs');});
