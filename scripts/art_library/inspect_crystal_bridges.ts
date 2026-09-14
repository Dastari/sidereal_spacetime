import {readFileSync} from 'node:fs';
import {composeCrystalReference} from './crystal_reference_composition_r012';
const kit=JSON.parse(readFileSync('output/playwright/planet-reference-20260914/crystal-r012/kit.json','utf8'));
const batches=composeCrystalReference(kit,38,0), centers=new Map<string,number[]>();
for(const b of batches)for(const r of b.ranges.filter(r=>r.partId.startsWith('bridge'))){const p=b.positions.slice(r.firstTriangle*9,(r.firstTriangle+r.triangleCount)*9);let c=[0,0,0];for(let i=0;i<p.length;i++)c[i%3]+=p[i]/(p.length/3);centers.set(r.partId,c);}
console.log(JSON.stringify([...centers].map(([id,p])=>({id,p,dot:p.reduce((n,v,i)=>n+v*[.452,.388,.794][i],0)/Math.hypot(...p)})),null,2));
