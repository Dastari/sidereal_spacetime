import {readFileSync,writeFileSync} from 'node:fs';
import {placementError,validateAssembly,type PartCatalog,type AssemblyVoxelLibrary} from '../packages/content/src/assembly';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),base='assets/runtime/assembly/';
const catalog:PartCatalog=read(base+'catalog.json'),volumes:AssemblyVoxelLibrary=read(base+'catalog.voxels.json'),doc=validateAssembly(read(base+'wayfarer.json'),catalog);
const m=read(base+'hull-manifest.json'),ids=new Set(m.entries.flatMap((e:{placements:{id:string}[]})=>e.placements.map(p=>p.id)));
const results=doc.parts.filter(p=>ids.has(p.id)).map(p=>({id:p.id,error:placementError(p,doc,catalog,volumes)??null}));
writeFileSync('assets/art-library/shipyard-hull/installation-fit.json',JSON.stringify(results,null,2));
console.log(results.filter(r=>r.error));if(results.some(r=>r.error))process.exitCode=1;
