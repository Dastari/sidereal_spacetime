import fs from 'node:fs';
import {validateAssembly,placementError,type PartCatalog,type AssemblyVoxelLibrary}from '../../packages/content/src/assembly';
const out=process.argv[2],catalog=JSON.parse(fs.readFileSync(out+'/ship-catalog.json','utf8'))as PartCatalog,library=JSON.parse(fs.readFileSync(out+'/ship-catalog.voxels.json','utf8'))as AssemblyVoxelLibrary;
const doc=validateAssembly(JSON.parse(fs.readFileSync(out+'/ship-wayfarer.json','utf8')),catalog),ids=new Set(catalog.assets.filter(a=>a.visual?.designId==='shipyard.hull.side-armor').map(a=>a.id));
const checks=doc.parts.filter(p=>ids.has(p.assetId)).map(p=>({id:p.id,error:placementError(p,doc,catalog,library)??null}));fs.writeFileSync(out+'/placement-check.json',JSON.stringify({checks,pass:checks.every(c=>!c.error)},null,2));console.log(checks);if(checks.some(c=>c.error))process.exitCode=1;
