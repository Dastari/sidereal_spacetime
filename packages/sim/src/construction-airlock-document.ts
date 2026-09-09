import { CONSTRUCTION_SCHEMA, CONSTRUCTION_COMPILER, CONSTRUCTION_LIMITS, type ConstructionDocument } from "@sidereal/content/construction";
import { emptyLayout, stampTile } from "@sidereal/content/ship-layout";
import { PINNED_FLOOR_KIT, FLOOR_KIT_HASH, readConstructionDraft } from "./construction-transactions";
import { compileLayout } from "./layout-compiler";
import { stableStringify } from "./layout-geometry";
import { NATIVE_EXTERNAL_AIRLOCK_AUDIT_SHA256 } from "./construction-airlock-plan";

/** Proposed additive discriminator. The shared construction parser deliberately
 * does NOT accept it until authority/renderer registration lands together. */
export interface NativeAirlockBinding {
  pin: { id: string; revision: string; sha256: string };
  deckId: string;
  innerDoorId: string;
  outerDoorId: string;
  parts: { id: string; sourcePartIndex: number }[];
  roofTileIds: string[];
  exteriorTileIds: string[];
}
export type NativeAirlockDocument = ConstructionDocument & { airlockRoom: NativeAirlockBinding };
export function createNativeAirlockDocument(): NativeAirlockDocument {
  const layout = emptyLayout("native-external-airlock-r000-a007", "airlock-deck");
  const deckId = layout.decks[0].id;
  layout.name = "Native external airlock review";
  layout.decks[0].roof = true;
  for (let x = 0; x < 8; x++) for (let y = 0; y < 2; y++) {
    const t = stampTile(`floor-${x}-${y}`, deckId, "rectangle", [x*32,y*32]);
    t.vertices = [[x*32,y*32],[(x+1)*32,y*32],[(x+1)*32,(y+1)*32],[x*32,(y+1)*32]];
    layout.tiles.push(t);
  }
  for (const [side,x] of [["inner",2],["outer",6]] as const) {
    layout.partitions.push({id:`${side}-partition`,deckId,a:[x*32,0],b:[x*32,64],seal:"design-sealed"});
    layout.openings.push({id:`${side}-door`,deckId,partitionId:`${side}-partition`,a:[x*32,12],b:[x*32,52],kind:"door",clearance:16,sill:0});
  }
  return { schema:CONSTRUCTION_SCHEMA,compiler:CONSTRUCTION_COMPILER,layout,
    floorKit:{id:PINNED_FLOOR_KIT.id,revision:PINNED_FLOOR_KIT.revision,sha256:FLOOR_KIT_HASH},
    floors:layout.tiles.map(t=>({id:t.id,deckId,partId:"quarter-1m",origin:[Math.min(...t.vertices.map(v=>v[0])),Math.min(...t.vertices.map(v=>v[1])),0],quarterTurns:0,reflected:false})),
    airlockRoom:{pin:{id:"shipyard.structure.external-airlock",revision:"r000-a007",sha256:NATIVE_EXTERNAL_AIRLOCK_AUDIT_SHA256},deckId,innerDoorId:"inner-door",outerDoorId:"outer-door",
      parts:Array.from({length:70},(_,i)=>({id:`native-airlock-part-${i}`,sourcePartIndex:i})),
      roofTileIds:layout.tiles.filter(t=>t.vertices[0][0]<192).map(t=>t.id),exteriorTileIds:layout.tiles.filter(t=>t.vertices[0][0]>=192).map(t=>t.id)},
  };
}
/** Exhaustive explicit identity list for normal template-spawn UUID allocation. */
export function nativeAirlockDocumentIdentities(d:NativeAirlockDocument):string[] {
  return [...new Set([d.layout.id,...d.layout.decks.map(v=>v.id),...d.layout.tiles.map(v=>v.id),...d.layout.partitions.map(v=>v.id),...d.layout.openings.map(v=>v.id),...d.airlockRoom.parts.map(v=>v.id)])];
}
export function remapNativeAirlockDocument(d:NativeAirlockDocument,map:Readonly<Record<string,string>>):NativeAirlockDocument {
  const ids=nativeAirlockDocumentIdentities(d), values=ids.map(id=>map[id]);
  if(values.some(id=>typeof id!=="string"||!id||id.length>128)||new Set(values).size!==ids.length)throw Error("Airlock document: complete independent identity mapping required");
  const next=JSON.parse(JSON.stringify(d)) as NativeAirlockDocument, id=(s:string)=>map[s];
  next.layout.id=id(d.layout.id);next.layout.playableDeckId=id(d.layout.playableDeckId);
  for(const v of next.layout.decks)v.id=id(v.id);
  for(const v of next.layout.tiles){v.id=id(v.id);v.deckId=id(v.deckId);}
  for(const v of next.layout.partitions){v.id=id(v.id);v.deckId=id(v.deckId);}
  for(const v of next.layout.openings){v.id=id(v.id);v.deckId=id(v.deckId);v.partitionId=id(v.partitionId);}
  for(const v of next.floors){v.id=id(v.id);v.deckId=id(v.deckId);}
  const a=next.airlockRoom;a.deckId=id(a.deckId);a.innerDoorId=id(a.innerDoorId);a.outerDoorId=id(a.outerDoorId);
  for(const p of a.parts)p.id=id(p.id);a.roofTileIds=a.roofTileIds.map(id);a.exteriorTileIds=a.exteriorTileIds.map(id);
  return next;
}
function canonical(d:NativeAirlockDocument) {
  const {airlockRoom,...base}=d;
  return stableStringify({base:JSON.parse(readConstructionDraft(JSON.stringify(base)).canonical),binding:{...airlockRoom,parts:[...airlockRoom.parts].sort((a,b)=>a.sourcePartIndex-b.sourcePartIndex),roofTileIds:[...airlockRoom.roofTileIds].sort(),exteriorTileIds:[...airlockRoom.exteriorTileIds].sort()}});
}
/** Fixed-fixture parser validates all geometry/roles while allowing explicit UUID
 * remapping. It cannot turn a room label or old native-room pin into a seal. */
export function readNativeAirlockDocument(raw:string):NativeAirlockDocument {
  if(typeof raw!=="string"||new TextEncoder().encode(raw).length>CONSTRUCTION_LIMITS.bytes)throw Error("Airlock document byte budget");
  const d=JSON.parse(raw) as NativeAirlockDocument, source=createNativeAirlockDocument();
  if(!d?.airlockRoom || !Array.isArray(d.airlockRoom.parts)||d.airlockRoom.parts.length!==70||!Array.isArray(d.layout?.tiles)||d.layout.tiles.length!==16||d.layout.decks?.length!==1||d.layout.partitions?.length!==2||d.layout.openings?.length!==2)throw Error("Airlock document: exact native counts required");
  const map:Record<string,string>={[source.layout.id]:d.layout.id,[source.airlockRoom.deckId]:d.layout.decks[0].id};
  for(const t of d.layout.tiles){const x=Math.min(...t.vertices.map(v=>v[0]))/32,y=Math.min(...t.vertices.map(v=>v[1]))/32;map[`floor-${x}-${y}`]=t.id;}
  for(const side of ["inner","outer"] as const){const opening=d.layout.openings.find(o=>o.id===d.airlockRoom[side==="inner"?"innerDoorId":"outerDoorId"]);if(!opening)throw Error("Airlock document: missing door");map[`${side}-door`]=opening.id;map[`${side}-partition`]=opening.partitionId;}
  for(const p of d.airlockRoom.parts)map[`native-airlock-part-${p.sourcePartIndex}`]=p.id;
  const expected=remapNativeAirlockDocument(source,map);expected.layout.name=d.layout.name;expected.layout.decks[0].name=d.layout.decks[0].name;expected.layout.source=d.layout.source;
  if(canonical(d)!==canonical(expected))throw Error("Airlock document: changed native geometry, binding or roof/landing role");
  if(!compileLayout(d.layout).valid)throw Error("Airlock document: invalid semantic layout");
  return JSON.parse(JSON.stringify(d)) as NativeAirlockDocument;
}

/** Native structural cores plus accepted physical leaf bounds. The same bounded
 * 0.3m-radius/1.8m-high body used by the native sweep audit is required. */
export function nativeAirlockCollision(document:NativeAirlockDocument, plan:import('./construction-airlock-plan').NativeExternalAirlockPlan,
  states:readonly {openingId:string;fraction:number;sealRetraction:number}[]) {
  const d=readNativeAirlockDocument(JSON.stringify(document));
  if(plan.auditSha256!==d.airlockRoom.pin.sha256)throw Error('Airlock collision proof mismatch');
  const obstacles:DeckObstacle[]=plan.installation.filter(p=>p.source==='wall').flatMap(p=>{
    const def=CONSTRUCTION_BOUNDARY_FAMILY_INTERFACES.parts.find(v=>v.native.nodePrefix===p.nodePrefix);
    if(!def)throw Error('Missing native airlock wall collision');
    return def.collision.convexPolygonsM.map((polygon,i)=>({id:`${p.id}:core:${i}`,definitionId:'native-boundary-r004-core',vertices:polygon.map(v=>{const q=transformPoint([v[0],v[1]],p.quarterTurns);return[q[0]+p.originM[0],q[1]+p.originM[1]] as Point;})}));
  });
  const base=compileDeckCollision(d.layout,d.airlockRoom.deckId,{shipId:plan.instanceId,perimeterHalfWidthM:0,partitionHalfWidthM:.0625,obstacles});
  const frames=[{id:d.airlockRoom.innerDoorId,origin:[2,0] as Point,quarterTurns:1},{id:d.airlockRoom.outerDoorId,origin:[6,2] as Point,quarterTurns:3}];
  if(states.some(s=>!frames.some(f=>f.id===s.openingId))||new Set(states.map(s=>s.openingId)).size!==states.length)throw Error('Unknown/duplicate airlock door state');
  const physical=frames.map(frame=>{
    const state=states.find(s=>s.openingId===frame.id),fraction=state?.fraction??0;
    if(!Number.isFinite(fraction)||fraction<0||fraction>1)throw Error('Invalid accepted airlock leaf');
    return{openingId:frame.id,passable:fraction===1&&state?.sealRetraction===1,obstacle:doorLeafObstacle(frame,fraction)};
  });
  const resolved=resolveDeckCollision(base,physical);
  return{...resolved,obstacles:[...resolved.obstacles,...physical.map(p=>p.obstacle)],segments:[...resolved.segments,...physical.flatMap(({obstacle:o})=>o.vertices.map((a,i)=>({id:`${o.id}:${i}`,a,b:o.vertices[(i+1)%o.vertices.length],halfWidthM:0})))]};
}
import { CONSTRUCTION_BOUNDARY_FAMILY_INTERFACES } from '@sidereal/content/construction-boundary-family';
import { transformPoint,type Point } from '@sidereal/content/ship-layout';
import { compileDeckCollision,resolveDeckCollision,type DeckObstacle } from './construction-collision';
import {doorLeafObstacle}from'./construction-door-motion';

/** Bind the immutable native source to the exact independent instance placement IDs. */
export function bindNativeAirlockPlan(document:NativeAirlockDocument,compile:(instanceId:string)=>import('./construction-airlock-plan').NativeExternalAirlockPlan,instanceId:string) {
 const d=readNativeAirlockDocument(JSON.stringify(document)),plan=compile(instanceId),parts=new Map(d.airlockRoom.parts.map(p=>[p.sourcePartIndex,p.id]));
 plan.installation=plan.installation.map((p,i)=>({...p,id:parts.get(i)!}));
 plan.installationFingerprint=constructionHash(new TextEncoder().encode(JSON.stringify(plan.installation)));
 plan.doors[0].id=d.airlockRoom.innerDoorId;plan.doors[1].id=d.airlockRoom.outerDoorId;
 return plan;
}
import{constructionHash}from'./construction-transactions';
