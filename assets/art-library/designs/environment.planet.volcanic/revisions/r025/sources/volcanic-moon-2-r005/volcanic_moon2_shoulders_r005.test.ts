import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {composeVolcanicMoonReference} from './volcanic_moon_reference_composition_r004';
const base='output/playwright/planet-reference-20260914/volcanic-moon-2-';
it('preserves every r004 surface and cold material while warming bounded faces in only B-edge',()=>{
 const old=JSON.parse(readFileSync(base+'r004/kit.json','utf8')),next=JSON.parse(readFileSync(base+'r005/kit.json','utf8'));
 expect(next.compositionRecipe).toEqual(old.compositionRecipe);
 expect(next.materials.slice(0,6)).toEqual(old.materials);expect(next.materials.length).toBe(7);
 for(const material of old.materials)for(const field of ['baseColorTexture','metallicRoughnessTexture'])if(material[field])expect(readFileSync(base+'r004/'+material[field]).equals(readFileSync(base+'r005/'+material[field]))).toBe(true);
 for(let i=0;i<old.variants.length;i++){
  const a=old.variants[i],b=next.variants[i];expect(a.name).toBe(b.name);
  for(const field of ['positions','normals','uvs','indices'])expect(JSON.stringify(a[field])===JSON.stringify(b[field]),`${a.name}/${field}`).toBe(true);
  let changed=0;for(let t=0;t<a.triangleMaterials.length;t++)if(a.triangleMaterials[t]!==b.triangleMaterials[t]){expect(a.name).toBe('battered-region-b-edge');expect([0,1,3,5]).toContain(a.triangleMaterials[t]);expect(b.triangleMaterials[t]).toBe(6);changed++;}
  if(a.name==='battered-region-b-edge'){expect(changed).toBeGreaterThan(0);expect(changed/a.triangleMaterials.length).toBeLessThan(.035);}else expect(readFileSync(base+'r004/'+a.name+'.glb').equals(readFileSync(base+'r005/'+a.name+'.glb'))).toBe(true);
 }
});
it('retains the identical shoulder surfaces, UVs, normals and two placement IDs at all LODs',()=>{
 const kit=JSON.parse(readFileSync(base+'r005/kit.json','utf8'));
 const first=composeVolcanicMoonReference(kit,38,0);
 expect(first[6].ranges.map(r=>r.partId).sort()).toEqual(['planets--volcanic-moon-2/crust-2','planets--volcanic-moon-2/crust-9']);
 for(const lod of [1,2] as const){const next=composeVolcanicMoonReference(kit,38,lod);for(let role=0;role<first.length;role++){expect(next[role].ranges).toEqual(first[role].ranges);for(const field of ['positions','normals','uvs','indices'] as const)expect(Buffer.from(first[role][field].buffer).equals(Buffer.from(next[role][field].buffer))).toBe(true);}}
});
