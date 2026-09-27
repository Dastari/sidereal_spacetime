import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {PBRMaterial} from '@babylonjs/core/Materials/PBR/pbrMaterial';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData';
import {Ray} from '@babylonjs/core/Culling/ray';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {composeIceMoonReference} from './ice_moon_reference_composition_r001';
import type {NativePlanetKit} from '../../packages/render/src/environment/native-planet-composition';
for(const id of ['ice-moon-1','ice-moon-2']){
const kit=JSON.parse(readFileSync(`output/playwright/planet-reference-20260914/${id}-r001/kit.json`,'utf8')) as NativePlanetKit;
it('retains shaft and gorge native surfaces and optical channels identically across LODs',()=>{
 const a=composeIceMoonReference(kit,38,0),b=composeIceMoonReference(kit,38,2);
 for(let m=0;m<a.length;m++){for(const field of ['positions','normals','uvs','indices']as const)expect(Buffer.from(a[m][field].buffer).equals(Buffer.from(b[m][field].buffer))).toBe(true);expect(a[m].ranges).toEqual(b[m].ranges);expect(a[m].uvs.length).toBe(a[m].positions.length/3*2);}
 const ids=new Set(a.flatMap(b=>b.ranges.map(r=>r.partId)));expect(ids.size).toBe(id.endsWith('-1')?9:7);expect(a.reduce((n,b)=>n+b.indices.length/3,0)).toBeLessThan(190000);
});
it('NullEngine clears each distinct native floor through variant-specific substrate indexing',()=>{
 for(const mode of [true,'gorge']as const){const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
 try{const meshes=composeIceMoonReference(kit,38,0,mode).flatMap((b,i)=>b.ranges.map(range=>{const mesh=new Mesh(`ice-${i}`,scene);mesh.metadata={role:'planet',materialRole:i,partId:range.partId};mesh.material=new PBRMaterial(`ice-role-${i}`,scene);const data=new VertexData();data.positions=b.positions.slice(range.firstTriangle*9,(range.firstTriangle+range.triangleCount)*9);data.normals=b.normals.slice(range.firstTriangle*9,(range.firstTriangle+range.triangleCount)*9);data.uvs=b.uvs.slice(range.firstTriangle*6,(range.firstTriangle+range.triangleCount)*6);data.indices=Uint32Array.from({length:range.triangleCount*3},(_,i)=>i);data.applyToMesh(mesh);mesh.computeWorldMatrix(true);return mesh;}));
 const n=new Vector3(.452,.388,.794).normalize(),ray=new Ray(n.scale(2),n.negate(),3),hits=meshes.map(mesh=>({mesh,hit:ray.intersectsMesh(mesh,false)})).filter(v=>v.hit.hit&&v.hit.pickedPoint).sort((a,b)=>a.hit.distance-b.hit.distance);
 expect(hits[0].mesh.metadata.materialRole).toBe(4);expect(hits[0].hit.pickedPoint!.length()).toBeLessThan(.90);const ground=hits.find(v=>v.mesh.metadata.partId===`planets--${id}/ground`)!;expect(ground.hit.distance-hits[0].hit.distance).toBeGreaterThan(.005);
 }finally{scene.dispose();engine.dispose();}}
});
it('retains the original deep shaft floor with bounded compact blue columns',()=>{
 const shaft=kit.variants.find(v=>v.name==='snow-cut-region')!;let high=-Infinity;for(let i=2;i<shaft.positions.length;i+=3)high=Math.max(high,shaft.positions[i]);expect(high).toBeLessThan(.72);expect(high).toBeGreaterThan(.35);
 expect(()=>composeIceMoonReference({...kit,variants:kit.variants.map(v=>({...v,normals:undefined}))},38,0)).toThrow('Missing authored ice normals or UVs');
});

}

it('keeps the large crater floor exposed in all14 seeded glacial moon placements',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
 try{for(const id of ['ice-moon-1','ice-moon-2']){const kit=JSON.parse(readFileSync(`output/playwright/planet-reference-20260914/${id}-r001/kit.json`,'utf8'));const meshes=composeIceMoonReference(kit,38,0).map((b,i)=>{const mesh=new Mesh(`${id}-${i}`,scene);mesh.metadata={role:'planet',materialRole:i,triangleRanges:b.ranges};mesh.material=new PBRMaterial('moon-role',scene);const data=new VertexData();Object.assign(data,b);data.applyToMesh(mesh);mesh.computeWorldMatrix(true);return mesh;});
 let state=(38^kit.compositionRecipe.layoutSeed)>>>0;state=(Math.imul(state,1664525)+1013904223)>>>0;const phase=state/4294967296*Math.PI*2;
 for(let i=0;i<kit.compositionRecipe.scales.length;i++){const y=1-2*(i+.5)/kit.compositionRecipe.scales.length,angle=phase+i*2.39996323,r=Math.sqrt(1-y*y),n=new Vector3(Math.cos(angle)*r,y,Math.sin(angle)*r),ray=new Ray(n.scale(2),n.negate(),3),hits=meshes.map(mesh=>({mesh,hit:ray.intersectsMesh(mesh,false)})).filter(v=>v.hit.hit&&v.hit.pickedPoint).sort((a,b)=>a.hit.distance-b.hit.distance);expect(hits[0].mesh.metadata.materialRole,`${id}/crust-${i}`).toBe(4);}
 for(const mesh of meshes){mesh.material?.dispose();mesh.dispose();}
 }}finally{scene.dispose();engine.dispose();}
});
