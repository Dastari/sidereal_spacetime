import {expect,test} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {TILESET_INTERFACE_SCHEMA,type TilesetInterface,type NominalPartInterface,type InterfacePlacement} from '../../content/src/tileset-interfaces';
import type {Point} from '../../content/src/ship-layout';
import {compatibleTilesetSubstitution,fitTileset,nominalToRenderer,transformInterfacePoint,validateTilesetInterfaces} from './tileset-fit';
const square:Point[]=[[0,0],[64,0],[64,64],[0,64]];
function part(id:string,footprint:Point[]=square):NominalPartInterface{return {id,role:'floor',footprint,bottom:0,top:6,quarterTurns:[0,1,2,3],reflection:'forbidden',edges:footprint.map((a,i)=>({id:'edge'+i,a,b:footprint[(i+1)%footprint.length],profile:'deck-seam',bottom:0,top:6,seals:[]})),mounts:[],ports:[],native:{assetId:'test-'+id,revision:'fixture-only',sha256:'a'.repeat(64),sourceToNominal:{translation:[0,0,0],quarterTurns:0,reflected:false}},damageMode:'voxel',damageAdapter:null,structuralDefinitionId:null};}
function kit(parts=[part('square'),part('half',[[0,0],[64,0],[64,32],[0,32]])]):TilesetInterface{return {schema:TILESET_INTERFACE_SCHEMA,id:'test-kit-a',revision:'1',family:'structural-2m-v1',latticePerMeter:32,moduleUnits:64,coordinateMapping:'BlenderXYZ-to-renderer-XZ-minusY',datums:{floorBottom:0,floorTop:6,roofBottom:102,roofTop:108,serviceBottom:null,serviceTop:null},profiles:[{id:'deck-seam',mates:['deck-seam']}],parts};}
const placement=(id:string,partId:string,x:number,y:number,z=0):InterfacePlacement=>({id,partId,origin:[x,y,z],quarterTurns:0,reflected:false});

test('two 1m edges cover a 2m neighbour without a hidden internal wall',()=>{
 const result=fitTileset(kit(),[placement('a','square',0,0),placement('b','half',64,0),placement('c','half',64,32)]);
 expect(result.valid).toBe(true);expect(result.joins).toHaveLength(3);
 expect(result.exposed.some(e=>e.a[0]===64&&e.b[0]===64&&e.a[1]<64&&e.b[1]>0)).toBe(false);
 expect(result.joins.every(j=>!j.pressureRated)).toBe(true); // fitting cannot invent pressure ratings
});
test('complementary triangles use the same quarter-turn placement and retain identities',()=>{
 const k=kit([part('triangle',[[0,0],[64,0],[0,64]])]),b={...placement('b','triangle',64,64),quarterTurns:2 as const};
 const fit=fitTileset(k,[placement('a','triangle',0,0),b]);expect(fit.valid).toBe(true);expect(fit.joins).toHaveLength(1);expect(fit.placements.map(p=>p.id)).toEqual(['a','b']);
});
test('faction substitution changes pinned visuals without changing topology or transforms',()=>{
 const first=kit(),second=structuredClone(first);second.id='test-kit-b';for(const p of second.parts){p.native.assetId='other-'+p.id;p.native.sha256='b'.repeat(64);}
 const placements=[placement('kept-a','square',0,0),placement('kept-b','half',64,0),placement('kept-c','half',64,32)];
 expect(compatibleTilesetSubstitution(first,second)).toBe(true);expect(fitTileset(first,placements)).toEqual(fitTileset(second,placements));
 second.datums.floorTop=7;expect(compatibleTilesetSubstitution(first,second)).toBe(false);
});
test('bad layer planes, hashes, damage role and fractional angles fail before assembly',()=>{
 const k=kit();k.parts[0].top=7;k.parts[0].native.sha256='latest';k.parts[0].quarterTurns=[.25 as 0];k.parts[0].damageMode='entity-health';
 expect(validateTilesetInterfaces(k).map(i=>i.code)).toEqual(expect.arrayContaining(['part-datum','native-pin','rotation','damage-mode']));
});
test('reflection requires approval and transforms directed edges and source axes consistently',()=>{
 const k=kit([part('square')]),p={...placement('mirror','square',64,0),reflected:true};
 expect(fitTileset(k,[p]).valid).toBe(false);k.parts[0].reflection='validated';
 const fit=fitTileset(k,[p]);expect(fit.valid).toBe(true);expect(fit.placements[0].footprint).toEqual([[64,64],[0,64],[0,0],[64,0]]);
 expect(transformInterfacePoint([32,0],{origin:[64,64,0],quarterTurns:1,reflected:true})).toEqual([64,32]);
 expect(nominalToRenderer([64,32,6])).toEqual([2,.1875,-1]);
});
test('overlap, duplicate IDs and unknown parts fail without silently dropping draft records',()=>{
 const result=fitTileset(kit(),[placement('a','square',0,0),placement('b','square',32,0),placement('a','square',128,0),placement('missing','unknown',0,128)]);
 expect(result.valid).toBe(false);expect(result.issues.map(i=>i.code)).toEqual(expect.arrayContaining(['solid-overlap','placement-identity','part-missing']));
});
test('height mismatch remains exposed; incompatible coincident profiles reject',()=>{
 const k=kit(),a=placement('a','square',0,0),b=placement('b','square',64,0,1);
 const stepped=fitTileset(k,[a,b]);expect(stepped.joins).toHaveLength(0);expect(stepped.exposed.filter(e=>e.a[0]===64&&e.b[0]===64)).toHaveLength(2);
 k.profiles.push({id:'other',mates:['other']});k.parts.push({...structuredClone(k.parts[0]),id:'different'});k.parts[2].edges.forEach(e=>e.profile='other');
 expect(fitTileset(k,[a,placement('b','different',64,0)]).issues.some(i=>i.code==='profile-mismatch')).toBe(true);
});
test('partial seals compose by intervals; unapproved or missing strips never certify a closed seam',()=>{
 const k=kit();for(const p of k.parts)for(const e of p.edges)e.seals=[{a:e.a,b:e.b,bottom:0,top:6,family:'pressure-seal',definitionId:'test-seal-rule'}];
 const e=k.parts[0].edges[1];e.seals=[{a:[64,0],b:[64,32],bottom:0,top:6,family:'pressure-seal',definitionId:'test-seal-rule'},{a:[64,32],b:[64,64],bottom:0,top:6,family:'pressure-seal',definitionId:null}];
 const fit=fitTileset(k,[placement('a','square',0,0),placement('b','half',64,0),placement('c','half',64,32)]);
 expect(fit.joins.find(j=>j.a==='a'&&j.b==='b')?.pressureRated).toBe(true);expect(fit.joins.find(j=>j.a==='a'&&j.b==='c')?.pressureRated).toBe(false);
});
test('all twelve pinned r002 native floor polygons satisfy nominal geometry without assigning ratings',()=>{
 const raw=readFileSync('assets/art-library/shipyard-floor/r002/specification.json');
 const source=JSON.parse(raw.toString()) as {components:{slug:string;id:string;polygon_xy_m:Point[];node_prefix:string}[]};
 const manifest=JSON.parse(readFileSync('assets/runtime/assembly/floor-manifest.json','utf8'));
 const k=kit(source.components.map(c=>{const p=part(c.slug,c.polygon_xy_m.map(([x,y])=>[x*32,y*32]));p.native={...p.native,assetId:c.id,revision:'r002',sha256:manifest.entries.find((e:any)=>e.asset.id===c.id).asset.visual.sha256,nodePrefix:c.node_prefix};return p;}));
 expect(k.parts).toHaveLength(12);expect(validateTilesetInterfaces(k)).toEqual([]);expect(k.parts.every(p=>p.structuralDefinitionId===null&&p.damageAdapter===null)).toBe(true);
 expect(createHash('sha256').update(raw).digest('hex')).toBe('8c051bfdebd0cef4d963cb2d21299ba5b681285b5ba15e6cc3fe97a9e6cd0e1a');
});
