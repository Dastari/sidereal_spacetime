/** Verify the authored floor kit against the project's actual local placement rules. */
import { readFileSync, writeFileSync } from 'node:fs';
import { placementError, snapPlacementToSupport, validateAssembly, type AssemblyDocument, type AssemblyVoxelLibrary, type PartCatalog, type PartPlacement } from '../../packages/content/src/assembly';

const out=process.argv[2]??'.runtime/art-library/floor/r002';
const read=(name:string)=>JSON.parse(readFileSync(`${out}/${name}`,'utf8'));
const catalog:PartCatalog=read('catalog.json'),library:AssemblyVoxelLibrary=read('catalog.voxels.json');
const components=read('components.json') as {slug:string;id:string;polygon_xy_m:number[][];bounds:{min:number[];max:number[]}}[];
const board=validateAssembly(read('wayfarer.json'),catalog);
const errors=board.parts.map(p=>({id:p.id,error:placementError(p,board,catalog,library)??null}));
const doc=(parts:PartPlacement[]):AssemblyDocument=>({schema:'sidereal.assembly-draft.v1',id:'floor-fit',name:'Floor fit checks',parts});
const part=(slug:string,id:string,position:[number,number,number]=[0,0,0],rotation=0,flipped=false):PartPlacement=>({id,assetId:components.find(c=>c.slug===slug)!.id,position,rotation,flipped,removedCells:[]});
const checks:{name:string;passed:boolean;detail:unknown}[]=[];
for(const slug of ['triangle-45','triangle-long-left','triangle-long-right','triangle-slim-left','triangle-slim-right']){
 const component=components.find(c=>c.slug===slug)!;
 // Mate on the nominal construction polygon. Beveled visual tips are smaller
 // than the interface station and must never redefine assembly spacing.
 const width=Math.max(...component.polygon_xy_m.map(v=>v[0])),depth=Math.max(...component.polygon_xy_m.map(v=>v[1]));
 const a=part(slug,'first'),b=part(slug,'complement',[width,depth,0],Math.PI);
 const error=placementError(b,doc([a]),catalog,library);
 checks.push({name:slug+' rotated complement shares a seam',passed:!error,detail:error??'No occupied overlap'});
}
const square=part('square-2m','square');
const adjacent=part('square-2m','adjacent',[2,0,0]);
checks.push({name:'Square edge contact',passed:!placementError(adjacent,doc([square]),catalog,library),detail:adjacent.position});
checks.push({name:'Duplicate placement rejected',passed:!!placementError({...square,id:'duplicate'},doc([square]),catalog,library),detail:'Occupied overlap must fail'});
const triangle=part('triangle-45','triangle'),emptyHalf=part('quarter-1m','empty-half',[1,1,0]);
checks.push({name:'Empty triangular half stays empty',passed:!placementError(emptyHalf,doc([triangle]),catalog,library),detail:'Quarter tile fits inside triangle bounding box without occupying triangle matter'});
for(let turn=0;turn<4;turn++)for(const flipped of [false,true]){
 const p=part('triangle-long-left','pose',[20,20,0],turn*Math.PI/2,flipped);
 checks.push({name:`Quarter-turn ${turn}, mirror ${flipped}`,passed:!placementError(p,doc([]),catalog,library),detail:p.rotation});
}
const support=snapPlacementToSupport(part('quarter-1m','supported',[.5,.5,0]),doc([square]),catalog,library);
checks.push({name:'Support snaps to flat deck plane',passed:Math.abs(support.position[2]-.1875)<1e-9,detail:support.position});
checks.push({name:'Arbitrary object rotation remains rejected',passed:!!placementError({...square,rotation:Math.PI/4},doc([]),catalog,library),detail:'Angles are authored polygon geometry; assembly still uses quarter turns'});
const report={passed:errors.every(e=>!e.error)&&checks.every(c=>c.passed),board:errors,checks,
 proxy:'Conservative polygon-centre sample; <= one-cell uncertainty along angled seams. Native visual polygons remain continuous. No authoritative collision or live placement changes.',publication:false};
writeFileSync(`${out}/placement-validation.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(!report.passed)process.exitCode=1;
