import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {PBRMaterial} from '@babylonjs/core/Materials/PBR/pbrMaterial';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData';
import {Ray} from '@babylonjs/core/Culling/ray';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {composeTemperateReference} from './temperate_reference_composition_r001';
import type {NativePlanetKit} from '../../packages/render/src/environment/native-planet-composition';
const kit=JSON.parse(readFileSync('output/playwright/planet-reference-20260914/temperate-r001/kit.json','utf8')) as NativePlanetKit;
it('retains continental terrain forest and material attributes at every LOD',()=>{
 const a=composeTemperateReference(kit,38,0),b=composeTemperateReference(kit,38,2),extract=(level:typeof a)=>level.map(batch=>batch.ranges.filter(r=>r.partId!=='ground').map(r=>({id:r.partId,positions:Buffer.from(batch.positions.slice(r.firstTriangle*9,(r.firstTriangle+r.triangleCount)*9).buffer).toString('base64'),uvs:Buffer.from(batch.uvs.slice(r.firstTriangle*6,(r.firstTriangle+r.triangleCount)*6).buffer).toString('base64')})));
 expect(extract(a)).toEqual(extract(b));const ids=new Set(a.flatMap(b=>b.ranges.map(r=>r.partId)));expect([...ids].filter(id=>id.startsWith('continent-'))).toHaveLength(6);expect([...ids].filter(id=>id.startsWith('forest-'))).toHaveLength(72);expect(a.reduce((n,b)=>n+b.indices.length/3,0)).toBeLessThan(120000);
 const ocean=JSON.parse(readFileSync('output/playwright/planet-reference-20260914/ocean-r007/kit.json','utf8'));expect(kit.materials).toEqual(ocean.materials);
});
it('NullEngine water remains below continental caps with open ocean outside native coasts',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
 try{const meshes=composeTemperateReference(kit,38,0,true).map((b,i)=>{const mesh=new Mesh(`temperate-${i}`,scene);mesh.metadata={role:'planet',materialRole:i,triangleRanges:b.ranges};mesh.material=new PBRMaterial(`temperate-role-${i}`,scene);const data=new VertexData();data.positions=b.positions;data.normals=b.normals;data.uvs=b.uvs;data.indices=b.indices;data.applyToMesh(mesh);mesh.computeWorldMatrix(true);return mesh;});
 const n=new Vector3(.452,.388,.794).normalize();for(const direction of [n,n.negate()]){const ray=new Ray(direction.scale(2),direction.negate(),3),hits=meshes.map(mesh=>({mesh,hit:ray.intersectsMesh(mesh,false)})).filter(v=>v.hit.hit&&v.hit.pickedPoint).sort((a,b)=>a.hit.distance-b.hit.distance);
 if(direction===n){expect(hits[0].mesh.metadata.materialRole).not.toBe(0);expect(hits[0].hit.pickedPoint!.length()).toBeGreaterThan(1.18);const water=hits.find(v=>v.mesh.metadata.materialRole===0)!;expect(water.hit.distance-hits[0].hit.distance).toBeGreaterThan(.18);}else{expect(hits[0].mesh.metadata.materialRole).toBe(0);expect(hits[0].hit.pickedPoint!.length()).toBeCloseTo(1,2);}}
 }finally{scene.dispose();engine.dispose();}
});
