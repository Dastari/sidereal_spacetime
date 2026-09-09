import { migrateDefaultHull } from './hull-publication';
import { expect, test } from 'vitest';
import { validateAssembly, type AssemblyDocument, type PartCatalog } from './assembly';
import { validateHullDecals, type HullDecal } from './hull-decals';
import { assemblyDocument, editVisualPart, importShipAssembly } from './layout-assembly';
const marking: HullDecal = {id:'identity',kind:'text',text:'WAYFARER',face:'top',position:[0,0,2],size:[2,.5],rotation:0,color:'#d8d3c5'};
const catalog: PartCatalog = {schema:'sidereal.part-catalog.v1',assets:[{id:'roof',label:'Roof',category:'roof',nodes:[],bounds:{min:[-2,-2,0],max:[2,2,2]}}]};
const document = (): AssemblyDocument => ({schema:'sidereal.assembly-draft.v1',id:'ship',name:'Ship',parts:[{id:'a',assetId:'roof',position:[0,0,0],rotation:0,flipped:false,removedCells:[],decals:[structuredClone(marking)]}]});
test('markings survive layout import, part transforms, independent duplicate, JSON export and validation', () => {
 const original=document(), layout=importShipAssembly(original,catalog,'layout','deck');
 const first=layout.assembly!.parts[0];
 editVisualPart(layout,{...first,position:[5,7,0],rotation:Math.PI/2,flipped:true},catalog);
 layout.assembly!.parts.push({...structuredClone(first),id:'copy'});
 layout.assembly!.parts[1].decals![0].text='WF-01';
 const result=validateAssembly(JSON.parse(JSON.stringify(assemblyDocument(layout,catalog))),catalog);
 expect(result.parts[0].decals).toEqual([marking]);
 expect(result.parts[0].flipped).toBe(true); // Local position remains fixed; renderer compensates text UVs on reflection.
 expect(result.parts[1].decals![0].text).toBe('WF-01');
 expect(original.parts[0].position).toEqual([0,0,0]);
});
test('reject unsupported or unbounded markings without rewriting source', () => {
 for(const patch of [{kind:'url'},{text:'<script>'},{text:'x'.repeat(33)},{position:[NaN,0,0]},{size:[0,1]},{size:[17,1]},{color:'red'},{face:'bottom'},{rotation:Infinity}]) {
  const data={...marking,...patch};expect(()=>validateHullDecals([data])).toThrow();
 }
 expect(()=>validateHullDecals(Array(5).fill(marking))).toThrow();
 expect(()=>validateHullDecals([marking,marking])).toThrow();
 expect(()=>validateHullDecals(undefined)).not.toThrow();
 for(const face of ['top','front','right'])expect(()=>validateHullDecals([{...marking,face}])).not.toThrow();
});
test('document budget is independent of per-part budget', () => {
 const doc=document();doc.parts=Array.from({length:129},(_,i)=>({...structuredClone(doc.parts[0]),id:String(i)}));
 expect(()=>validateAssembly(doc,catalog)).toThrow('128');
 doc.parts.pop();expect(validateAssembly(doc,catalog).parts).toHaveLength(128);
});

test('default refresh preserves custom markings even when all part transforms match', () => {
 const previous=document();delete previous.parts[0].decals;
 const saved=document(), current={...document(),name:'new published roof'};
 expect(migrateDefaultHull(saved,previous,current)).toBe(saved);
 expect(migrateDefaultHull(previous,previous,current)).toEqual(current);
});
