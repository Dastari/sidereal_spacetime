import {describe,it,expect} from 'vitest';
import {migrateDefaultHull} from './hull-publication';
import type {AssemblyDocument} from './assembly';
const old:AssemblyDocument={schema:'sidereal.assembly-draft.v1',id:'ship',name:'Ship',parts:[{id:'original',assetId:'part-a',position:[0,6,0],rotation:0,flipped:false,removedCells:[]}]};
const next:AssemblyDocument={...old,parts:[{...old.parts[0],id:'replacement',assetId:'part-b'}]};
describe('published default hull upgrade',()=>{
 it('updates an untouched default without changing either input',()=>{expect(migrateDefaultHull(structuredClone(old),old,next)).toEqual(next);expect(old.parts[0].id).toBe('original');});
 it('preserves independently moved or damaged drafts',()=>{for(const edit of [{position:[1,6,0] as [number,number,number]},{removedCells:[[0,0,0] as [number,number,number]]}]){const custom={...old,parts:[{...old.parts[0],...edit}]};expect(migrateDefaultHull(custom,old,next)).toBe(custom);}});
});
