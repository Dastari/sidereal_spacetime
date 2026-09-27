import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData';
import {PBRMaterial} from '@babylonjs/core/Materials/PBR/pbrMaterial';
import {Color3} from '@babylonjs/core/Maths/math.color';
import type {NativePlanetKit} from '../../packages/render/src/environment/native-planet-composition';
import {composeNativeClouds,NATIVE_CLOUD_BANK_LIMIT} from './native_cloud_composition_r002';
const source=readFileSync('output/playwright/planet-reference-20260914/cloud-r002/kit.json','utf8');
const kit=JSON.parse(source) as NativePlanetKit;
const immutableSource=JSON.stringify(kit);
describe('native cloud worker composition',()=>{
 it('retains exact seeded banks and original material channels without tinting or a LOD rebuild',()=>{
  const a=composeNativeClouds(kit,38,.5),b=composeNativeClouds(kit,38,1);
  expect(composeNativeClouds(kit,38,.5)).toEqual(a);
  expect(composeNativeClouds(kit,39,.5)).not.toEqual(a);
  expect(b[0].positions.slice(0,a[0].positions.length)).toEqual(a[0].positions);
  expect(b[0].ranges.slice(0,a[0].ranges.length)).toEqual(a[0].ranges);
  expect(JSON.stringify(kit)===immutableSource).toBe(true);
  expect(kit.materials[0]).toEqual({name:'cloud-white',linearColor:[.86,.91,1],roughness:.94});
 });
 it('bounds triangle count, full placement ranges and altitude for every bank',()=>{
  const batches=composeNativeClouds(kit,38,1);
  expect(batches).toHaveLength(1);expect(batches[0].ranges).toHaveLength(NATIVE_CLOUD_BANK_LIMIT);
  expect(batches.reduce((sum,b)=>sum+b.indices.length/3,0)).toBeLessThanOrEqual(30000);
  for(const b of batches){let end=0;for(const r of b.ranges){expect(r.firstTriangle).toBe(end);end+=r.triangleCount;}expect(end).toBe(b.indices.length/3);
   for(let i=0;i<b.positions.length;i+=3){const radius=Math.hypot(...b.positions.slice(i,i+3));expect(radius).toBeGreaterThanOrEqual(1.08);expect(radius).toBeLessThanOrEqual(1.16);}
   expect([...b.positions,...b.normals].every(Number.isFinite)).toBe(true);
  }
  expect(composeNativeClouds(kit,38,0)[0].indices).toHaveLength(0);
  expect(composeNativeClouds(kit,38,-1)).toEqual(composeNativeClouds(kit,38,0));
  expect(composeNativeClouds(kit,38,2)).toEqual(batches);
 });
 it('distributes even tiny positive coverage across both hemispheres and salts weather independently',()=>{
  for(const coverage of [.001,.1,.2,.3]){
   const b=composeNativeClouds(kit,38,coverage)[0];
   const centres=b.ranges.map(r=>{const p=b.positions.slice(r.firstTriangle*9,(r.firstTriangle+r.triangleCount)*9);let sum=0;for(let i=1;i<p.length;i+=3)sum+=p[i];return sum/(p.length/3);});
   expect(centres.some(y=>y>0)).toBe(true);expect(centres.some(y=>y<0)).toBe(true);
  }
  const a=composeNativeClouds(kit,38,.2);expect(a).not.toEqual(composeNativeClouds(kit,38^0x6d2b79f5,.2));
 });
 it('phase rotates the complete bank field without changing identity or shape',()=>{
  const a=composeNativeClouds(kit,38,.2)[0],angle=.72,b=composeNativeClouds(kit,38,.2,angle)[0];
  expect(a.ranges).toEqual(b.ranges);expect(a.indices).toEqual(b.indices);
  for(let i=0;i<a.positions.length;i+=3){expect(b.positions[i]).toBeCloseTo(Math.cos(angle)*a.positions[i]+Math.sin(angle)*a.positions[i+2],6);expect(b.positions[i+1]).toBe(a.positions[i+1]);}
 });
 it('uploads native batches in NullEngine with resolvable placement ranges and the source PBR color',()=>{
  const engine=new NullEngine(),scene=new Scene(engine),b=composeNativeClouds(kit,5,.3)[0];
  const mesh=new Mesh('native-cloud-review',scene),data=new VertexData();data.positions=b.positions;data.normals=b.normals;data.indices=b.indices;data.applyToMesh(mesh);
  mesh.metadata={role:'planet',placementRanges:b.ranges};const material=new PBRMaterial('native-cloud-white',scene);
  material.albedoColor=Color3.FromArray(kit.materials[0].linearColor);material.roughness=kit.materials[0].roughness;mesh.material=material;
  expect(mesh.getTotalIndices()).toBe(b.indices.length);expect(mesh.metadata.placementRanges[0].partId).toBe('cloud-bank-000');
  expect(material.albedoColor.asArray()).toEqual([.86,.91,1]);expect(material.roughness).toBe(.94);
  scene.dispose();engine.dispose();
 });
 it('rejects malformed inputs and missing native cloud variants',()=>{
  expect(()=>composeNativeClouds(kit,38,NaN)).toThrow('finite');expect(()=>composeNativeClouds({...kit,variants:[]},38,1)).toThrow('Missing native cloud variant');
 });
});
