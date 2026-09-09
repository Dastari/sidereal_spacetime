import type {AssemblyDocument} from './assembly';
/** Refresh only an untouched previous default. Custom layouts and damage stay intact. */
export function migrateDefaultHull(saved:AssemblyDocument,previous:AssemblyDocument,current:AssemblyDocument):AssemblyDocument {
 const key=(d:AssemblyDocument)=>JSON.stringify(d.parts.map(p=>[p.id,p.assetId,p.position,p.rotation,p.flipped,p.removedCells,p.decals??[]]));
 return key(saved)===key(previous)?structuredClone(current):saved;
}
