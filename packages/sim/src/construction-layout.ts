import {CONSTRUCTION_SCHEMA,CONSTRUCTION_COMPILER,type ConstructionDocument,type ConstructionFloor} from '../../content/src/construction';
import type {LayoutDocument,Point} from '../../content/src/ship-layout';
import {PINNED_FLOOR_KIT,FLOOR_KIT_HASH} from './construction-transactions';
import {canonicalPolygon,stableStringify} from './layout-geometry';
import {transformInterfacePoint} from './tileset-fit';
/** Match explicit semantic floor polygons to approved nominal shapes. This never infers
 * walkable floor from arbitrary visual meshes, nor changes the authored document. */
export function bindConstructionLayout(layout:LayoutDocument):{document:ConstructionDocument;unmatched:string[]} {
 const floors:ConstructionFloor[]=[],unmatched:string[]=[];
 for(const tile of layout.tiles){
  const deck=layout.decks.find(d=>d.id===tile.deckId),target=canonicalPolygon(tile.vertices);
  let found:ConstructionFloor|undefined;
  for(const part of PINNED_FLOOR_KIT.parts){for(const quarterTurns of part.quarterTurns){
   if(found||!deck)continue;
   const turned=part.footprint.map(p=>transformInterfacePoint(p,{origin:[0,0,0],quarterTurns,reflected:false}));
   const dx=Math.min(...target.map(p=>p[0]))-Math.min(...turned.map(p=>p[0])),dy=Math.min(...target.map(p=>p[1]))-Math.min(...turned.map(p=>p[1]));
   if(stableStringify(canonicalPolygon(turned.map(([x,y]):Point=>[x+dx,y+dy])))===stableStringify(target))found={id:tile.id,deckId:tile.deckId,partId:part.id,origin:[dx,dy,deck.elevation],quarterTurns,reflected:false};
  }}
  if(found)floors.push(found);else unmatched.push(tile.id);
 }
 return {document:{schema:CONSTRUCTION_SCHEMA,compiler:CONSTRUCTION_COMPILER,layout:structuredClone(layout),floorKit:{id:PINNED_FLOOR_KIT.id,revision:PINNED_FLOOR_KIT.revision,sha256:FLOOR_KIT_HASH},floors},unmatched};
}
