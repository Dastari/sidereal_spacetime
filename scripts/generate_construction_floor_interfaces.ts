/** Derive nominal interfaces from the exact authored floor specification, never GLB bounds. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import type {Point} from '../packages/content/src/ship-layout';
import {TILESET_INTERFACE_SCHEMA,type TilesetInterface} from '../packages/content/src/tileset-interfaces';
import {validateTilesetInterfaces} from '../packages/sim/src/tileset-fit';
const sourcePath='assets/art-library/shipyard-floor/r002/specification.json';
const source=readFileSync(sourcePath),sourceHash=createHash('sha256').update(source).digest('hex');
if(sourceHash!=='8c051bfdebd0cef4d963cb2d21299ba5b681285b5ba15e6cc3fe97a9e6cd0e1a')throw Error('r002 specification changed; explicitly review and repin');
const spec=JSON.parse(source.toString()) as {components:{slug:string;id:string;polygon_xy_m:Point[];node_prefix:string}[]};
const manifest=JSON.parse(readFileSync('assets/runtime/assembly/floor-manifest.json','utf8'));
const glbHash='138b483f6052f01e23883b8d8b48bb72cdbace44727c8e717b1e6351c3593585';
const kit:TilesetInterface={schema:TILESET_INTERFACE_SCHEMA,id:'shipyard.floor.mapped-deck-kit',revision:'r002-interface-1',family:'structural-2m-deck-v1',latticePerMeter:32,moduleUnits:64,coordinateMapping:'BlenderXYZ-to-renderer-XZ-minusY',datums:{floorBottom:0,floorTop:6,roofBottom:null,roofTop:null,serviceBottom:null,serviceTop:null},profiles:[{id:'deck-flat-6',mates:['deck-flat-6']}],parts:spec.components.map(c=>{
 const visual=manifest.entries.find((e:any)=>e.asset.id===c.id)?.asset.visual;
 if(visual?.sha256!==glbHash||visual?.nodePrefix!==c.node_prefix)throw Error(`Installed native revision drift: ${c.id}`);
 const footprint=c.polygon_xy_m.map(([x,y]):Point=>[x*32,y*32]);
 return {id:c.slug,role:'floor',footprint,bottom:0,top:6,quarterTurns:[0,1,2,3],reflection:'forbidden',edges:footprint.map((a,i)=>({id:`edge-${i}`,a,b:footprint[(i+1)%footprint.length],profile:'deck-flat-6',bottom:0,top:6,seals:[]})),mounts:[],ports:[],native:{assetId:c.id,revision:'r002',sha256:glbHash,nodePrefix:c.node_prefix,sourceToNominal:{translation:[0,0,0],quarterTurns:0,reflected:false}},damageMode:'voxel',damageAdapter:null,structuralDefinitionId:null};
})};
const issues=validateTilesetInterfaces(kit);if(issues.length)throw Error(JSON.stringify(issues));
const path='packages/content/src/construction-floor-interfaces.json',bytes=JSON.stringify(kit,null,2)+'\n';
if(process.argv.includes('--check')){if(readFileSync(path,'utf8')!==bytes)throw Error('Generated floor interfaces stale');}else writeFileSync(path,bytes);
console.log(JSON.stringify({path,parts:kit.parts.length,sourceHash,sha256:createHash('sha256').update(bytes).digest('hex'),readiness:'Nominal fitting only; no approved structural, sealing, roof, service or native damage adapter'}));
