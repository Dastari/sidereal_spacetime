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
const kit=JSON.parse(readFileSync('output/playwright/planet-reference-20260914/ice-r025/kit.json','utf8')) as NativePlanetKit;
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
it('preserves corrected Ice21 material exports while replacing regional morphology',()=>{
 const old=JSON.parse(readFileSync('output/playwright/planet-reference-20260914/ice-r021/kit.json','utf8'))as NativePlanetKit;
 expect(kit.materials).toEqual(old.materials);
 
 for(let role=0;role<5;role++)for(const channel of ['albedo','orm'])expect(readFileSync(`output/playwright/planet-reference-20260914/ice-r025/ice-${role}-${channel}.png`)).toEqual(readFileSync(`output/playwright/planet-reference-20260914/ice-r021/ice-${role}-${channel}.png`));
 const area=(source:NativePlanetKit)=>{const v=source.variants.find(v=>v.name==='snow-cut-region')!;let total=0;for(let i=0;i<v.indices.length;i+=3){if(![2,3].includes(v.triangleMaterials[i/3]))continue;const p=[0,1,2].map(k=>Vector3.FromArray(v.positions,v.indices[i+k]*3));if(p.reduce((n,v)=>n+v.z,0)<=0)continue;total+=Vector3.Cross(p[1].subtract(p[0]),p[2].subtract(p[0])).length()/2;}return total;};
 expect(area(kit)).toBeGreaterThan(area(old)*1.25);
});
it('replaces gorge cap coverage while preserving the reviewed shaft22 native variant exactly',()=>{
 const old=JSON.parse(readFileSync('output/playwright/planet-reference-20260914/ice-r022/kit.json','utf8'))as NativePlanetKit;expect(kit.variants.find(v=>v.name==='snow-cut-region')).toEqual(old.variants.find(v=>v.name==='snow-cut-region'));
 const snowArea=(source:NativePlanetKit)=>{const v=source.variants.find(v=>v.name==='snow-open-gorge')!;let area=0;for(let i=0;i<v.indices.length;i+=3){if(v.triangleMaterials[i/3]!==0)continue;const [a,b,c]=[0,1,2].map(k=>Vector3.FromArray(v.positions,v.indices[i+k]*3));area+=Math.max(0,Vector3.Cross(b.subtract(a),c.subtract(a)).z)/2;}return area;};
 const ratio=snowArea(kit)/snowArea(old);expect(ratio).toBeGreaterThan(.55);expect(ratio).toBeLessThan(.70);
});
it('keeps native ground radius outside authored regions while clearing relief beneath open floors',()=>{
 const old=JSON.parse(readFileSync('output/playwright/planet-reference-20260914/ice-r023/kit.json','utf8'))as NativePlanetKit;
 for(const name of ['snow-cut-region','snow-open-gorge'])expect(kit.variants.find(v=>v.name===name)).toEqual(old.variants.find(v=>v.name===name));
 const source=kit.variants.find(v=>v.name==='ground-sphere')!,batches=composeIceReference(kit,38,0,true),cursor=batches.map(b=>b.ranges.find(r=>r.partId==='ground')?.firstTriangle! *9),n=new Vector3(.452,.388,.794).normalize();let untouched=0;
 for(let i=0;i<source.indices.length;i+=3){const role=source.triangleMaterials[i/3];for(let k=0;k<3;k++){
  const p=Vector3.FromArray(source.positions,source.indices[i+k]*3),output=Vector3.FromArray(batches[role].positions,cursor[role]);cursor[role]+=3;
  if(p.length()>1.02&&Vector3.Dot(p.normalizeToNew(),n)<-.3){expect(output.length()).toBeCloseTo(p.length(),6);untouched++;}
 }}
 expect(untouched).toBeGreaterThan(100);expect(Math.max(...source.positions.filter((_,i)=>i%3===0).map((_,i)=>Math.hypot(...source.positions.slice(i*3,i*3+3))))).toBeGreaterThan(1.07);
});
it('authors thick white caps and exposed blue basal geometry instead of recoloring the previous white globe',()=>{
 const native=kit.variants.find(v=>v.name==='ground-sphere')!;let lowBlue=0,highSnow=0;for(let i=0;i<native.indices.length;i+=3){const role=native.triangleMaterials[i/3];for(let k=0;k<3;k++){const index=native.indices[i+k]*3,radius=Math.hypot(...native.positions.slice(index,index+3));if(role===2&&radius<.99)lowBlue++;if(role===0&&radius>1.025)highSnow++;}}
 expect(lowBlue).toBeGreaterThan(5000);expect(highSnow).toBeGreaterThan(5000);
 const old=JSON.parse(readFileSync('output/playwright/planet-reference-20260914/ice-r024/kit.json','utf8'))as NativePlanetKit;expect(kit.materials).toEqual(old.materials);
});
