import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {composeOceanReference} from './ocean_reference_composition_r002';
import type {NativePlanetKit} from '../../packages/render/src/environment/native-planet-composition';
const kit=JSON.parse(readFileSync('output/playwright/planet-reference-20260914/ocean-r002/kit.json','utf8')) as NativePlanetKit;
const levels=([0,1,2] as const).map(lod=>composeOceanReference(kit,38,lod));
it('retains islands, beaches and groves with exact material identity across native LODs',()=>{
 const features=(level:typeof levels[number])=>level.map(b=>b.ranges.filter(r=>r.partId!=='ground').map(r=>({id:r.partId,positions:b.positions.slice(r.firstTriangle*9,(r.firstTriangle+r.triangleCount)*9)})));
 expect(features(levels[0])).toEqual(features(levels[2]));
 expect(composeOceanReference(kit,38,2)).toEqual(levels[2]);expect(composeOceanReference(kit,39,2)).not.toEqual(levels[2]);
});
it('keeps complete placement ranges, finite native CCW geometry and a bounded scene',()=>{
 for(const level of levels){expect(level.reduce((n,b)=>n+b.indices.length/3,0)).toBeLessThan(30000);
  for(const b of level){expect([...b.positions,...b.normals].every(Number.isFinite)).toBe(true);let end=0;for(const r of b.ranges){expect(r.firstTriangle).toBe(end);end+=r.triangleCount;}expect(end).toBe(b.indices.length/3);
   for(let i=0;i<b.positions.length;i+=9){const p=b.positions,n=b.normals,a=[p[i+3]-p[i],p[i+4]-p[i+1],p[i+5]-p[i+2]],c=[p[i+6]-p[i],p[i+7]-p[i+1],p[i+8]-p[i+2]],cross=[a[1]*c[2]-a[2]*c[1],a[2]*c[0]-a[0]*c[2],a[0]*c[1]-a[1]*c[0]];expect(Math.hypot(n[i],n[i+1],n[i+2])).toBeCloseTo(1,5);expect(cross[0]*n[i]+cross[1]*n[i+1]+cross[2]*n[i+2]).toBeGreaterThan(0);}
  }
 }
});
it('places grove roots above water and keeps a conservative island-footprint bound',()=>{
 const trunks=levels[0][9];expect(trunks.ranges).toHaveLength(18);
 for(const r of trunks.ranges){const p=trunks.positions.slice(r.firstTriangle*9,(r.firstTriangle+r.triangleCount)*9);for(let i=0;i<p.length;i+=3)expect(Math.hypot(p[i],p[i+1],p[i+2])).toBeGreaterThan(1.045);}
 // Conservative projected disk bound, including colored water shelves. Real
 // visible-ocean percentage is a camera-dependent visual measurement, not this.
 const footprints=[.25*1.12,.21*1.2,.23*1.16,.17*1.2,.18*1.12,.13*1.08,.23*1.12,.22*1.16,.19*1.2,.21*1.12,...Array(12).fill(.12*.5)];
 expect(footprints.reduce((a,r)=>a+Math.PI*r*r,0)/(4*Math.PI)).toBeLessThan(.17);
 expect(()=>composeOceanReference({...kit,variants:[]},1,0)).toThrow('Missing ocean native variant');
});
