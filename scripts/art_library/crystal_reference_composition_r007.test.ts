import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData';
import {VertexBuffer} from '@babylonjs/core/Buffers/buffer';
import {composeCrystalReference} from './crystal_reference_composition_r007';
import type {NativePlanetKit} from '../../packages/render/src/environment/native-planet-composition';
const kit=JSON.parse(readFileSync('output/playwright/planet-reference-20260914/crystal-r009/kit.json','utf8')) as NativePlanetKit;
it('keeps four distinct hero placements and medium bridges within a bounded geometry budget',()=>{
 const b=composeCrystalReference(kit,38,0),centers=new Map<string,number[]>();
 for(const batch of b)for(const range of batch.ranges.filter(r=>r.partId.startsWith('colossal'))){
  const p=batch.positions.slice(range.firstTriangle*9,(range.firstTriangle+range.triangleCount)*9);const center=[0,0,0];for(let i=0;i<p.length;i++)center[i%3]+=p[i]/(p.length/3);centers.set(range.partId,center);
 }
 expect(centers.size).toBe(4);const values=[...centers.values()];for(let i=0;i<4;i++)for(let j=i+1;j<4;j++)expect(Math.hypot(...values[i].map((v,k)=>v-values[j][k]))).toBeGreaterThan(.5);
 expect(b.reduce((n,batch)=>n+batch.indices.length/3,0)).toBeLessThan(150000);
});
it('retains every normal UV and placement at all LODs',()=>{
 const a=composeCrystalReference(kit,38,0),b=composeCrystalReference(kit,38,2);
 for(let m=0;m<a.length;m++){for(const field of ['positions','normals','uvs','indices'] as const)expect(Buffer.from(a[m][field].buffer).equals(Buffer.from(b[m][field].buffer))).toBe(true);expect(a[m].ranges).toEqual(b[m].ranges);expect(a[m].uvs.length).toBe(a[m].positions.length/3*2);}
});
it('NullEngine retains authored UVs and normals on composed textured native batches',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 try{for(const [i,b]of composeCrystalReference(kit,38,0,true).entries()){const mesh=new Mesh(`crystal-${i}`,scene);mesh.metadata={role:'planet',triangleRanges:b.ranges};const data=new VertexData();data.positions=b.positions;data.normals=b.normals;data.uvs=b.uvs;data.indices=b.indices;data.applyToMesh(mesh);expect(mesh.isVerticesDataPresent(VertexBuffer.UVKind)).toBe(true);expect(mesh.isVerticesDataPresent(VertexBuffer.NormalKind)).toBe(true);}}finally{scene.dispose();engine.dispose();}
 expect(()=>composeCrystalReference({...kit,variants:kit.variants.map(v=>({...v,normals:undefined}))},38,0)).toThrow('Missing native crystal normals or UVs');
});
