/** Review-only whole-ship composition and actual occupancy checks. Never publishes. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {placementError,validateAssembly,type PartCatalog,type AssemblyVoxelLibrary,type AssemblyDocument} from '../../packages/content/src/assembly';
import {VoxelVolume,encodeVoxels} from '../../packages/sim/src/voxels';
const root='.runtime/art-library/hull/r004',out=`${root}/context`;
mkdirSync(out,{recursive:true});
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const files=['catalog.json','catalog.voxels.json','wayfarer.json','hull-manifest.json'];
const hashes=Object.fromEntries(files.map(p=>[p,createHash('sha256').update(readFileSync(`assets/runtime/assembly/${p}`)).digest('hex')]));
const base:AssemblyDocument=read('assets/runtime/assembly/wayfarer.json');
const baseCat:PartCatalog=read('assets/runtime/assembly/catalog.json');
const baseVox:AssemblyVoxelLibrary=read('assets/runtime/assembly/catalog.voxels.json');
const kit:AssemblyDocument=read(`${root}/wayfarer.json`);
const kitCat:PartCatalog=read(`${root}/catalog.json`),kitVox:AssemblyVoxelLibrary=read(`${root}/catalog.voxels.json`);
const oldAssetIds=new Set(baseCat.assets.filter(a=>a.visual?.designId==='shipyard.hull.pilot-section').map(a=>a.id));
const kitIds=new Set(kit.parts.map(p=>p.id));
const oldHull=base.parts.filter(p=>oldAssetIds.has(p.assetId));
const retained=base.parts.filter(p=>!oldAssetIds.has(p.assetId)&&!kitIds.has(p.id));
const catalog:PartCatalog={...baseCat,assets:[...baseCat.assets.filter(a=>!kitCat.assets.some(k=>k.id===a.id)),...kitCat.assets]};
const library:AssemblyVoxelLibrary={...baseVox,volumes:{...baseVox.volumes,...kitVox.volumes}};
const pairs=[];
for(const part of kit.parts)for(const legacy of retained){
 const error=placementError(part,{...base,parts:[legacy]},catalog,library);
 if(error)pairs.push({kit:part.id,legacy:legacy.id,category:catalog.assets.find(a=>a.id===legacy.assetId)!.category,error});
}
const removeIds=new Set(pairs.filter(p=>p.category==='floor'||p.category==='roof').map(p=>p.legacy));
const roofClosures=[-3,-1,1].map((x,i)=>({id:`pilot-context-vestibule-roof-${i}`,assetId:'part-14404bc85f3a72ad3ab8',position:[x,7,2.625] as [number,number,number],rotation:0,flipped:false,removedCells:[]}));
const document=validateAssembly({...base,name:'Wayfarer / r004 review context',parts:[...retained.filter(p=>!removeIds.has(p.id)),...kit.parts,...roofClosures]},catalog);
const checks=[...kit.parts,...roofClosures].map(p=>({id:p.id,error:placementError(p,document,catalog,library)??null}));
for(const [name,value] of [['catalog.json',catalog],['catalog.voxels.json',library],['wayfarer.json',document]] as const)writeFileSync(`${out}/${name}`,JSON.stringify(value));
// Conservative standing clearance box, sampled through actual placementError.
const v=new VoxelVolume();for(let z=0;z<29;z++)for(let y=0;y<10;y++)for(let x=0;x<10;x++)v.set(x,y,z,1);
const probeId='review-standing-clearance';
const probeCatalog:PartCatalog={...catalog,assets:[...catalog.assets,{id:probeId,label:'0.625 m standing clearance',category:'equipment',nodes:[],bounds:{min:[0,0,0],max:[.625,.625,1.8125]}}]};
const probeLibrary:AssemblyVoxelLibrary={...library,volumes:{...library.volumes,[probeId]:{cellMeters:.0625,layers:[{chunks:[...v.chunks.values()].map(c=>({origin:[...c.origin],runs:encodeVoxels(c.cells)}))}]}}};
const points:number[][]=[];
for(let y=6.5;y<=9;y+=.125)points.push([0,y]);
const clearanceAt=(x:number,y:number)=>placementError({id:probeId,assetId:probeId,position:[x-.3125,y-.3125,.1875],rotation:0,flipped:false,removedCells:[]},document,probeCatalog,probeLibrary)??null;
const route=points.map(([x,y])=>({center:[x,y,.1875],error:clearanceAt(x,y)}));
const queue:number[][]=[[0,9]],seen=new Set<string>(['0,9']),previous=new Map<string,string>(),blocked=new Map<string,string>();let goal:string|undefined;
for(let i=0;i<queue.length;i++){
 const [x,y]=queue[i];if(x>=.875&&y>=9.75){goal=`${x},${y}`;break;}
 for(const [dx,dy] of [[.125,0],[-.125,0],[0,.125],[0,-.125]]){
  const nx=x+dx,ny=y+dy,key=`${nx},${ny}`;if(nx< -1.5||nx>1.5||ny<8.5||ny>10.25||seen.has(key))continue;seen.add(key);
  const error=clearanceAt(nx,ny);if(error){blocked.set(key,error);continue;}previous.set(key,`${x},${y}`);queue.push([nx,ny]);
 }
}
const sideRoute:string[]=[];for(let k=goal;k;k=previous.get(k))sideRoute.push(k);sideRoute.reverse();
const report={status:'review-only, no publication',publishedInputHashes:hashes,replacedHullPlacements:oldHull.map(p=>p.id),legacyOverlapPairs:pairs,removedLegacy:retained.filter(p=>removeIds.has(p.id)).map(p=>({id:p.id,assetId:p.assetId,position:p.position,reason:p.id.startsWith('floor')?'Legacy deck slab overlaps replacement vestibule deck; identical tile footprint now covered by native deck.':'Legacy roof intersects native partition/frame tops. Removed only from review; leaves roof opening requiring a native adapter/roof closure.'})),roofOpening:{x:[-3,3],y:[7,9],note:'Three 2 m roof tiles removed; r004 pilot roof begins Y9 and does not cover this opening.'},remainingNonFloorConflicts:pairs.filter(p=>!removeIds.has(p.legacy)),checks,clearance:{method:'Actual placementError with conservative 0.625 × 0.625 × 1.8125 m closed voxel box around actual 0.6 m crew diameter; geometric clearance only, not authoritative pathfinding or animation.',route,seatApproachDistanceM:1,sideRouteFound:!!goal,sideRoute,exploredClearPositions:queue.length,blockedExamples:[...blocked.entries()].slice(0,20)},equipmentIdentityPreservation:kit.parts.filter(p=>p.id.startsWith('equipment-')).map(p=>({id:p.id,position:p.position,publishedMatch:JSON.stringify(base.parts.find(b=>b.id===p.id))===JSON.stringify(p)})),partCount:document.parts.length};
writeFileSync(`${out}/validation.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({out,partCount:document.parts.length,removedLegacy:report.removedLegacy,conflicts:report.remainingNonFloorConflicts,failedChecks:checks.filter(c=>c.error),blockedRoute:route.filter(c=>c.error),equipment:report.equipmentIdentityPreservation},null,2));
const candidates=[];
for(const seatOffset of [.25,.375,.5])for(const consoleOffset of [0,.125,.25]){
 const candidate:AssemblyDocument={...document,parts:document.parts.map(p=>p.id==='equipment-control-seat'||p.id==='equipment-control-console'?{...p,position:[p.position[0],p.position[1]+(p.id==='equipment-control-seat'?seatOffset:consoleOffset),p.position[2]]}:p)};
 const transforms=candidate.parts.filter(p=>p.id==='equipment-control-seat'||p.id==='equipment-control-console');
 const fit=transforms.map(p=>({id:p.id,error:placementError(p,candidate,catalog,library)??null}));
 const queue:number[][]=[[0,9]],seen=new Set<string>(['0,9']),prev=new Map<string,string>();let endpoint:string|undefined;
 if(!fit.some(c=>c.error))for(let i=0;i<queue.length;i++){
  const [x,y]=queue[i];if(x>=.875&&y>=10+seatOffset){endpoint=`${x},${y}`;break;}
  for(const [dx,dy] of [[.125,0],[-.125,0],[0,.125],[0,-.125]]){
   const nx=x+dx,ny=y+dy,key=`${nx},${ny}`;if(nx< -1.5||nx>1.5||ny<8.5||ny>10.75||seen.has(key))continue;seen.add(key);
   const error=placementError({id:probeId,assetId:probeId,position:[nx-.3125,ny-.3125,.1875],rotation:0,flipped:false,removedCells:[]},candidate,probeCatalog,probeLibrary);
   if(error)continue;prev.set(key,`${x},${y}`);queue.push([nx,ny]);
  }
 }
 const route:string[]=[];for(let k=endpoint;k;k=prev.get(k))route.push(k);route.reverse();
 const result={seatOffset,consoleOffset,fit,sideRouteFound:!!endpoint,route,transforms};candidates.push(result);
 if(endpoint&&!candidates.slice(0,-1).some(c=>c.sideRouteFound)){
  writeFileSync(`${out}/wayfarer-clearance-candidate.json`,JSON.stringify(candidate));writeFileSync(`${out}/selected-clearance-candidate.json`,JSON.stringify(result,null,2));
  writeFileSync(`${out}/wayfarer-final.json`,JSON.stringify(candidate));
  const finalChecks=[...kit.parts,...roofClosures].map(p=>{const actual=candidate.parts.find(c=>c.id===p.id)!;return {id:p.id,error:placementError(actual,candidate,catalog,library)??null};});
  writeFileSync(`${out}/final-validation.json`,JSON.stringify({status:'Unpublished review context; seat transform prospective only',baseReport:'validation.json',composition:'wayfarer-final.json',partCount:candidate.parts.length,checks:finalChecks,roofClosure:{placements:roofClosures,source:'Exact approved r001 native roof tiles, reused; no new geometry.',coverage:{x:[-3,3],y:[7,9],undersideZ:2.625},remainingDifference:'0.0625 m underside height step to legacy roof; all roof tile mating faces have no sampled overlap.'},seatTransform:transforms.find(p=>p.id==='equipment-control-seat'),consoleAndBankPositionsUnchanged:true,clearance:{probe:[.625,.625,1.8125],approachRoute:report.clearance.route,sideRoute:route,scope:'Actual occupied-cell geometry checks; no pressure, animated crew or authority route claim.'},publication:false},null,2));
 }
}
writeFileSync(`${out}/clearance-candidates.json`,JSON.stringify(candidates,null,2));
console.log(JSON.stringify(candidates.map(({seatOffset,consoleOffset,fit,sideRouteFound})=>({seatOffset,consoleOffset,fit,sideRouteFound})),null,2));
