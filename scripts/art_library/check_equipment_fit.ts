/** Read-only fixture fit audit. Never installs review geometry or writes live state. */
import {readFileSync,writeFileSync} from 'node:fs';
import {placementError,validateAssembly,type PartCatalog,type AssemblyVoxelLibrary} from '../../packages/content/src/assembly';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const catalog:PartCatalog=read('assets/runtime/assembly/catalog.json');
const library:AssemblyVoxelLibrary=read('assets/runtime/assembly/catalog.voxels.json');
const assembly=validateAssembly(read('assets/runtime/assembly/wayfarer.json'),catalog);
const jobs=read('.runtime/art-library/equipment/jobs.json');
const revised:PartCatalog=structuredClone(catalog),volumes:AssemblyVoxelLibrary={...library,volumes:{...library.volumes}};
const ids=new Set<string>();
for(const job of jobs)for(const variant of job.variants){
 ids.add(variant.asset_id);
 const data=read(`${job.output}/${variant.name}/mesh.json`);
 revised.assets.find(a=>a.id===variant.asset_id)!.bounds=data.bounds;
 volumes.volumes[variant.asset_id]=read(`${job.output}/${variant.name}/voxels.json`);
}
const results=assembly.parts.filter(p=>ids.has(p.assetId)).map(p=>({placement_id:p.id,asset_id:p.assetId,transform:p.position,baseline:placementError(p,assembly,catalog,library)??null,review:placementError(p,assembly,revised,volumes)??null}));
const report={scope:'Read-only occupancy check using actual placementError against unchanged complete Wayfarer placement document',authority_changed:false,results};
writeFileSync('assets/art-library/shipyard-equipment/placement-fit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(results,null,2));
