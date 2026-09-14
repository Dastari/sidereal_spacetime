/** Actual unchanged full-ship placement validation, including separate roof proxies. */
import{readFileSync,writeFileSync}from'node:fs';
import{placementError,validateAssembly,type PartCatalog,type AssemblyVoxelLibrary}from'../../packages/content/src/assembly';
const out=process.argv[2]??'.runtime/art-library/roof/r002',read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const c:PartCatalog=read(out+'/ship-catalog.json'),v:AssemblyVoxelLibrary=read(out+'/ship-catalog.voxels.json'),d=validateAssembly(read(out+'/ship-wayfarer.json'),c);
const baselineC:PartCatalog=read('assets/runtime/assembly/catalog.json'),baselineV:AssemblyVoxelLibrary=read('assets/runtime/assembly/catalog.voxels.json'),baseline=validateAssembly(read('assets/runtime/assembly/wayfarer.json'),baselineC);
const roofs=d.parts.filter(p=>c.assets.find(a=>a.id===p.assetId)?.category==='roof');
const checks=roofs.map(p=>({id:p.id,error:placementError(p,d,c,v)??null,baselineError:placementError(baseline.parts.find(a=>a.id===p.id)!,baseline,baselineC,baselineV)??null}));
const report={passed:checks.every(c=>!c.error),checks,newFailures:checks.filter(c=>c.error&&!c.baselineError),existingFailures:checks.filter(c=>c.error&&c.baselineError),authorityChanged:false,published:false};
writeFileSync(out+'/placement-validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
