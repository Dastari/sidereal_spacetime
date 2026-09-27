import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {PBRMaterial} from '@babylonjs/core/Materials/PBR/pbrMaterial';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData';
import {Ray} from '@babylonjs/core/Culling/ray';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {composeIceReference} from './ice_reference_composition_r025';
import type {NativePlanetKit} from '../../packages/render/src/environment/native-planet-composition';
const kit=JSON.parse(readFileSync('output/playwright/planet-reference-20260914/ice-r026/kit.json','utf8')) as NativePlanetKit;
it('retains shaft and gorge native surfaces and optical channels identically across LODs',()=>{
 const a=composeIceReference(kit,38,0),b=composeIceReference(kit,38,2);
 for(let m=0;m<a.length;m++){for(const field of ['positions','normals','uvs','indices']as const)expect(Buffer.from(a[m][field].buffer).equals(Buffer.from(b[m][field].buffer))).toBe(true);expect(a[m].ranges).toEqual(b[m].ranges);expect(a[m].uvs.length).toBe(a[m].positions.length/3*2);}
 const ids=new Set(a.flatMap(b=>b.ranges.map(r=>r.partId)));expect(ids.size).toBe(13);expect(a.reduce((n,b)=>n+b.indices.length/3,0)).toBeLessThan(190000);
});
it('NullEngine clears each distinct native floor through variant-specific substrate indexing',()=>{
 for(const mode of [true,'gorge']as const){const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
 try{const meshes=composeIceReference(kit,38,0,mode).flatMap((b,i)=>b.ranges.map(range=>{const mesh=new Mesh(`ice-${i}`,scene);mesh.metadata={role:'planet',materialRole:i,partId:range.partId};mesh.material=new PBRMaterial(`ice-role-${i}`,scene);const data=new VertexData();data.positions=b.positions.slice(range.firstTriangle*9,(range.firstTriangle+range.triangleCount)*9);data.normals=b.normals.slice(range.firstTriangle*9,(range.firstTriangle+range.triangleCount)*9);data.uvs=b.uvs.slice(range.firstTriangle*6,(range.firstTriangle+range.triangleCount)*6);data.indices=Uint32Array.from({length:range.triangleCount*3},(_,i)=>i);data.applyToMesh(mesh);mesh.computeWorldMatrix(true);return mesh;}));
 const n=new Vector3(.452,.388,.794).normalize(),ray=new Ray(n.scale(2),n.negate(),3),hits=meshes.map(mesh=>({mesh,hit:ray.intersectsMesh(mesh,false)})).filter(v=>v.hit.hit&&v.hit.pickedPoint).sort((a,b)=>a.hit.distance-b.hit.distance);
 expect(hits[0].mesh.metadata.materialRole).toBe(4);expect(hits[0].hit.pickedPoint!.length()).toBeLessThan(.90);const ground=hits.find(v=>v.mesh.metadata.partId==='ground')!;expect(ground.hit.distance-hits[0].hit.distance).toBeGreaterThan(.005);
 }finally{scene.dispose();engine.dispose();}}
});
it('retains the original deep shaft floor with bounded compact blue columns',()=>{
 const shaft=kit.variants.find(v=>v.name==='snow-cut-region')!;let high=-Infinity;for(let i=2;i<shaft.positions.length;i+=3)high=Math.max(high,shaft.positions[i]);expect(high).toBeLessThan(.72);expect(high).toBeGreaterThan(.50);
 expect(()=>composeIceReference({...kit,variants:kit.variants.map(v=>({...v,normals:undefined}))},38,0)).toThrow('Missing authored ice normals or UVs');
});

it('changes only selected tall shard side material roles, keeping every authored surface and snow cap intact',()=>{
 const old=JSON.parse(readFileSync('output/playwright/planet-reference-20260914/ice-r025/kit.json','utf8'));expect(kit.materials.slice(0,5)).toEqual(old.materials);let glass=0,snow=0;
 for(let i=0;i<old.variants.length;i++){const before=old.variants[i],after=kit.variants[i];for(const field of ['positions','normals','uvs','indices'])expect((after as any)[field]).toEqual(before[field]);for(let t=0;t<before.triangleMaterials.length;t++){const role=after.triangleMaterials[t];if(before.triangleMaterials[t]===0){expect(role).toBe(0);snow++;}if(role>=5){expect([2,3,4]).toContain(before.triangleMaterials[t]);glass++;}if(before.name.startsWith('ground'))expect(role).toBe(before.triangleMaterials[t]);}}
 expect(glass).toBeGreaterThan(100);expect(glass).toBeLessThan(2500);expect(snow).toBeGreaterThan(5000);
});
it('exports actual native glTF transmission IOR and volume with opaque caps, not mesh-wide alpha',()=>{
 const parse=(p:string)=>{const b=readFileSync(p);return JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());};
 for(const name of ['snow-cut-region','snow-open-gorge'])for(const prefix of ['', 'blender-raw/']){const g=parse(`output/playwright/planet-reference-20260914/ice-r026/${prefix}${name}.glb`);for(const role of [5,6]){const def=kit.materials[role]as any,m=g.materials.find((m:any)=>m.name===def.name),e=m.extensions;expect(e.KHR_materials_transmission.transmissionFactor).toBeCloseTo(def.transmissionFactor,6);expect(e.KHR_materials_ior.ior).toBeCloseTo(1.31,6);for(const field of ['thicknessFactor','attenuationDistance'])expect(e.KHR_materials_volume[field]).toBeCloseTo(def[field],6);for(let c=0;c<3;c++)expect(e.KHR_materials_volume.attenuationColor[c]).toBeCloseTo(def.attenuationColor[c],6);expect(m.alphaMode??'OPAQUE').toBe('OPAQUE');}const snow=g.materials.find((m:any)=>m.name==='powder-snow');expect(snow.extensions?.KHR_materials_transmission).toBeUndefined();}
});
