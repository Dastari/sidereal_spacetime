import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {composeRockyReference} from './rocky_reference_composition';
import type {NativePlanetKit} from '../../packages/render/src/environment/native-planet-composition';
const kit=JSON.parse(readFileSync('output/playwright/planet-reference-20260914/rocky-r001/kit.json','utf8')) as NativePlanetKit;
const levels=([0,1,2] as const).map(lod=>composeRockyReference(kit,24,lod));
it('retains exact major crater geometry, material roles and placement identity at each LOD',()=>{
 const heroes=(level:typeof levels[number])=>level.map(batch=>batch.ranges.filter(r=>r.partId.startsWith('crater-')).map(r=>({id:r.partId,positions:batch.positions.slice(r.firstTriangle*9,(r.firstTriangle+r.triangleCount)*9)})));
 expect(heroes(levels[0])).toEqual(heroes(levels[2]));
 expect(new Set(levels[0].flatMap(b=>b.ranges.filter(r=>r.partId.startsWith('crater-hero')).map(r=>r.partId))).size).toBe(7);
 expect(composeRockyReference(kit,24,2)).toEqual(levels[2]);expect(composeRockyReference(kit,25,2)).not.toEqual(levels[2]);
});
it('preserves finite CCW native triangles, unit normals and exact complete placement ranges within budget',()=>{
 for(const level of levels){
  expect(level.reduce((n,b)=>n+b.indices.length/3,0)).toBeLessThan(100000);
  for(const b of level){
   expect([...b.positions,...b.normals].every(Number.isFinite)).toBe(true);
   expect(b.ranges.reduce((n,r)=>n+r.triangleCount,0)).toBe(b.indices.length/3);
   let end=0;for(const r of b.ranges){expect(r.firstTriangle).toBe(end);end+=r.triangleCount;}
   for(let i=0;i<b.positions.length;i+=9){
    const p=b.positions,n=b.normals,a=[p[i+3]-p[i],p[i+4]-p[i+1],p[i+5]-p[i+2]],c=[p[i+6]-p[i],p[i+7]-p[i+1],p[i+8]-p[i+2]],cross=[a[1]*c[2]-a[2]*c[1],a[2]*c[0]-a[0]*c[2],a[0]*c[1]-a[1]*c[0]];
    expect(Math.hypot(n[i],n[i+1],n[i+2])).toBeCloseTo(1,5);
    expect(cross[0]*n[i]+cross[1]*n[i+1]+cross[2]*n[i+2]).toBeGreaterThan(0);
   }
  }
 }
});
it('keeps crater floors above the sphere and refuses a missing authored variant',()=>{
 for(const b of levels[0])for(const r of b.ranges.filter(r=>r.partId.startsWith('crater-'))){
  const p=b.positions.slice(r.firstTriangle*9,(r.firstTriangle+r.triangleCount)*9);
  // Dark bowl floor/walls are material 2, never submerged through the substrate.
  if(b===levels[0][2])for(let i=0;i<p.length;i+=3)expect(Math.hypot(p[i],p[i+1],p[i+2])).toBeGreaterThan(1);
 }
 expect(()=>composeRockyReference({...kit,variants:[]},1,0)).toThrow('Missing rocky native variant');
});
