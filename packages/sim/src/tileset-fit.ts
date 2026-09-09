import {STRUCTURAL_LATTICE_PER_METER,STRUCTURAL_MODULE_UNITS,TILESET_INTERFACE_LIMITS,TILESET_INTERFACE_SCHEMA,constructionDamageMode,type TilesetInterface,type InterfacePlacement,type NominalPartInterface,type NominalEdge,type LatticePoint3} from '../../content/src/tileset-interfaces';
import type {Point} from '../../content/src/ship-layout';
import {area2,cross,lineKey,onSegment,positiveOverlap,properCross,samePoint,stableStringify} from './layout-geometry';

export type FitIssue={code:string;placements:string[];detail:string};
export type FittedEdge={placementId:string;edgeId:string;a:Point;b:Point;bottom:number;top:number;profile:string;sealDefinitions:string[]};
export type TilesetFit={valid:boolean;issues:FitIssue[];joins:{a:string;b:string;from:Point;to:Point;pressureRated:boolean}[];exposed:FittedEdge[];placements:{id:string;footprint:Point[];bottom:number;top:number}[]};
const bounded=(n:number)=>Number.isSafeInteger(n)&&Math.abs(n)<=TILESET_INTERFACE_LIMITS.coordinate;
const pointValid=(p:readonly number[],length=2)=>p.length===length&&p.every(bounded);
const sha=(s:string)=>/^[a-f0-9]{64}$/.test(s);
export function transformInterfacePoint(p:Point,placement:Pick<InterfacePlacement,'origin'|'quarterTurns'|'reflected'>):Point {
 let [x,y]=p;if(placement.reflected)x=-x;
 for(let i=0;i<placement.quarterTurns;i++)[x,y]=[-y,x];
 return [x+placement.origin[0],y+placement.origin[1]];
}
export const nominalToRenderer=([x,y,z]:LatticePoint3):[number,number,number]=>[x/32,z/32,-y/32];
export function validateTilesetInterfaces(kit:TilesetInterface):FitIssue[] {
 const issues:FitIssue[]=[];const fail=(code:string,detail:string)=>issues.push({code,placements:[],detail});
 if(kit.schema!==TILESET_INTERFACE_SCHEMA||kit.latticePerMeter!==STRUCTURAL_LATTICE_PER_METER||kit.moduleUnits!==STRUCTURAL_MODULE_UNITS||kit.coordinateMapping!=='BlenderXYZ-to-renderer-XZ-minusY')fail('interface-version','Unsupported coordinate/interface contract');
 if(!kit.id||!kit.revision||!kit.family||kit.parts.length>TILESET_INTERFACE_LIMITS.parts)fail('kit-identity','Missing identity or excessive part count');
 const d=kit.datums;if(![d.floorBottom,d.floorTop].every(bounded)||d.floorBottom>=d.floorTop||(d.roofBottom===null)!==(d.roofTop===null)||(d.roofBottom!==null&&d.roofTop!==null&&(!bounded(d.roofBottom)||!bounded(d.roofTop)||d.floorTop>=d.roofBottom||d.roofBottom>=d.roofTop)))fail('layer-datums','Invalid floor/clearance/roof layer planes; unsupported roof planes must be explicitly absent');
 if((d.serviceBottom===null)!==(d.serviceTop===null)||(d.serviceBottom!==null&&d.serviceTop!==null&&(!bounded(d.serviceBottom)||!bounded(d.serviceTop)||d.serviceBottom>=d.serviceTop)))fail('service-datums','Service void requires an explicit positive bounded interval');
 const profiles=new Map(kit.profiles.map(p=>[p.id,p]));if(profiles.size!==kit.profiles.length)fail('profile-identity','Duplicate edge profile');
 for(const p of kit.profiles)for(const mate of p.mates)if(!profiles.has(mate)||!profiles.get(mate)!.mates.includes(p.id))fail('profile-mate','Profiles must declare reciprocal compatible mates');
 const ids=new Set<string>();
 for(const p of kit.parts){
  const mark=(code:string,detail:string)=>fail(code,`${p.id}: ${detail}`);
  if(!p.id||ids.has(p.id))mark('part-identity','Missing or duplicate part identity');ids.add(p.id);
  const poly=p.footprint;
  if(poly.length<3||poly.length>TILESET_INTERFACE_LIMITS.vertices||!poly.every(v=>pointValid(v))||area2(poly)<=0){mark('footprint','Requires bounded counter-clockwise polygon');continue;}
  if(Math.min(...poly.map(v=>v[0]))!==0||Math.min(...poly.map(v=>v[1]))!==0)mark('nominal-origin','Origin must be the declared nominal minimum, independent of decorative bounds');
  for(let i=0;i<poly.length;i++){
   if(cross(poly[i],poly[(i+1)%poly.length],poly[(i+2)%poly.length])<0||samePoint(poly[i],poly[(i+1)%poly.length]))mark('footprint','Only nondegenerate convex polygons are admitted');
   for(let j=i+1;j<poly.length;j++)if(properCross(poly[i],poly[(i+1)%poly.length],poly[j],poly[(j+1)%poly.length]))mark('footprint','Polygon crosses itself');
  }
  if(!bounded(p.bottom)||!bounded(p.top)||p.bottom>=p.top)mark('part-height','Invalid thickness interval');
  if(p.role==='floor'&&(p.bottom!==d.floorBottom||p.top!==d.floorTop)||p.role==='roof'&&(p.bottom!==d.roofBottom||p.top!==d.roofTop))mark('part-datum','Structural panel does not follow its named layer');
  if(p.damageMode!==constructionDamageMode(p.role))mark('damage-mode','Damage mode differs from the explicit role contract');
  if(p.damageAdapter&&(!sha(p.damageAdapter.proxySha256)||!p.damageAdapter.nativeClipAdapterId))mark('damage-adapter','Voxel readiness requires pinned proxy and native-visible clipping adapter');
  if(!sha(p.native.sha256)||!p.native.assetId||!p.native.revision||!pointValid(p.native.sourceToNominal.translation,3)||![0,1,2,3].includes(p.native.sourceToNominal.quarterTurns))mark('native-pin','Missing native hash or explicit source transform');
  if(!p.quarterTurns.length||p.quarterTurns.some(q=>![0,1,2,3].includes(q))||new Set(p.quarterTurns).size!==p.quarterTurns.length)mark('rotation','Only explicit unique quarter turns are admitted');
  if(!['forbidden','validated'].includes(p.reflection))mark('reflection','Reflection requires explicit permission');
  if(p.edges.length!==poly.length)mark('edge-coverage','Every nominal boundary edge needs exactly one profile');
  const edgeIds=new Set<string>();
  for(const [i,e] of p.edges.entries()){
   if(!e.id||edgeIds.has(e.id)||!poly[i]||!samePoint(e.a,poly[i])||!samePoint(e.b,poly[(i+1)%poly.length])||!profiles.has(e.profile)||!bounded(e.bottom)||!bounded(e.top)||e.bottom>=e.top)mark('edge-interface','Invalid ordered edge, profile or height');edgeIds.add(e.id);
   for(const seal of e.seals)if(!pointValid(seal.a)||!pointValid(seal.b)||!onSegment(seal.a,e.a,e.b)||!onSegment(seal.b,e.a,e.b)||samePoint(seal.a,seal.b)||!bounded(seal.bottom)||!bounded(seal.top)||seal.bottom<e.bottom||seal.top>e.top||seal.bottom>=seal.top||!seal.family)mark('seal-patch','Seal patch must occupy its declared edge and height interval');
  }
  const mounts=new Set<string>();for(const m of p.mounts){if(!m.id||mounts.has(m.id)||!pointValid(m.position,3)||!pointValid(m.normal,3)||m.normal.every(v=>v===0)||!m.family)mark('mount','Invalid named mount');mounts.add(m.id);}
  const ports=new Set<string>();for(const port of p.ports){if(!port.id||ports.has(port.id)||!mounts.has(port.mountId)||!port.medium)mark('port','Port requires a unique identity and explicit mount/medium');ports.add(port.id);}
 }
 return issues;
}
function edgeWorld(edge:NominalEdge,p:InterfacePlacement){let a=transformInterfacePoint(edge.a,p),b=transformInterfacePoint(edge.b,p);if(p.reflected)[a,b]=[b,a];return {a,b,bottom:edge.bottom+p.origin[2],top:edge.top+p.origin[2]};}
/** Same nominal transforms feed editor fit, publication and runtime compilation.
 * Exposed intervals require enclosure adapters; fit alone does not grant seals. */
export function fitTileset(kit:TilesetInterface,input:readonly InterfacePlacement[]):TilesetFit {
 const result:TilesetFit={valid:false,issues:validateTilesetInterfaces(kit),joins:[],exposed:[],placements:[]};
 if(input.length>TILESET_INTERFACE_LIMITS.parts)result.issues.push({code:'placement-limit',placements:[],detail:'Too many placements'});
 if(result.issues.length)return result;
 const definitions=new Map(kit.parts.map(p=>[p.id,p])),ids=new Set<string>(),profiles=new Map(kit.profiles.map(p=>[p.id,p]));
 type Edge=FittedEdge & {part:NominalPartInterface;placement:InterfacePlacement;source:NominalEdge};const groups=new Map<string,Edge[]>();
 for(const placement of input){
  const part=definitions.get(placement.partId),fail=(code:string,detail:string)=>result.issues.push({code,placements:[placement.id],detail});
  if(!placement.id||ids.has(placement.id)){fail('placement-identity','Missing/duplicate placement identity');continue;}ids.add(placement.id);
  if(!part){fail('part-missing','Pinned interface is absent; preserve draft');continue;}
  if(!pointValid(placement.origin,3)||!part.quarterTurns.includes(placement.quarterTurns)||placement.reflected&&part.reflection!=='validated'){fail('placement-transform','Unapproved rotation/reflection or out-of-bounds origin');continue;}
  let footprint=part.footprint.map(p=>transformInterfacePoint(p,placement));if(placement.reflected)footprint=footprint.reverse();
  if(!footprint.every(v=>pointValid(v))){fail('placement-bounds','Transformed geometry exceeds bounds');continue;}
  const bottom=part.bottom+placement.origin[2],top=part.top+placement.origin[2];
  if(!bounded(bottom)||!bounded(top)){fail('placement-height','Transformed height exceeds bounds');continue;}
  for(const other of result.placements)if(Math.max(bottom,other.bottom)<Math.min(top,other.top)&&positiveOverlap(footprint,other.footprint))result.issues.push({code:'solid-overlap',placements:[other.id,placement.id],detail:'Nominal solids overlap'});
  result.placements.push({id:placement.id,footprint,bottom,top});
  for(const source of part.edges){const edge={...edgeWorld(source,placement),placementId:placement.id,edgeId:source.id,profile:source.profile,sealDefinitions:[],part,placement,source};const key=lineKey(edge.a,edge.b);const list=groups.get(key)??[];list.push(edge);groups.set(key,list);}
 }
 for(const group of groups.values()){
  const axis=group[0].a[0]===group[0].b[0]?1:0,points=new Map<number,Point>();for(const e of group){points.set(e.a[axis],e.a);points.set(e.b[axis],e.b);for(const seal of e.source.seals){const a=transformInterfacePoint(seal.a,e.placement),b=transformInterfacePoint(seal.b,e.placement);points.set(a[axis],a);points.set(b[axis],b);}}
  const stops=[...points.keys()].sort((a,b)=>a-b);
  for(let i=0;i<stops.length-1;i++){
   const lo=stops[i],hi=stops[i+1],from=points.get(lo)!,to=points.get(hi)!;
   const active=group.filter(e=>Math.min(e.a[axis],e.b[axis])<=lo&&Math.max(e.a[axis],e.b[axis])>=hi);
   const visited=new Set<Edge>();
   for(const e of active){if(visited.has(e))continue;visited.add(e);
    const mates=active.filter(o=>o!==e&&!visited.has(o)&&o.bottom===e.bottom&&o.top===e.top&&(o.b[axis]-o.a[axis])*(e.b[axis]-e.a[axis])<0);
    if(mates.length>1){result.issues.push({code:'ambiguous-junction',placements:[e.placementId,...mates.map(m=>m.placementId)],detail:'Multiple owners for the same mating interval'});continue;}
    const mate=mates[0];if(!mate){result.exposed.push({placementId:e.placementId,edgeId:e.edgeId,a:from,b:to,bottom:e.bottom,top:e.top,profile:e.profile,sealDefinitions:[]});continue;}visited.add(mate);
    if(!profiles.get(e.profile)!.mates.includes(mate.profile)){result.issues.push({code:'profile-mismatch',placements:[e.placementId,mate.placementId],detail:'Coincident edges have incompatible profiles'});continue;}
    const seals=(edge:Edge)=>edge.source.seals.filter(s=>{const a=transformInterfacePoint(s.a,edge.placement),b=transformInterfacePoint(s.b,edge.placement);return s.definitionId&&onSegment(from,a,b)&&onSegment(to,a,b)&&s.bottom+edge.placement.origin[2]===edge.bottom&&s.top+edge.placement.origin[2]===edge.top;});
    const pressureRated=seals(e).some(a=>seals(mate).some(b=>a.family===b.family&&a.definitionId===b.definitionId));
    result.joins.push({a:e.placementId,b:mate.placementId,from,to,pressureRated});
   }
  }
 }
 result.valid=!result.issues.length;return result;
}
/** Mechanical substitution only; native rendering/art/damage certification is separate. */
export function compatibleTilesetSubstitution(first:TilesetInterface,second:TilesetInterface):boolean {
 if(validateTilesetInterfaces(first).length||validateTilesetInterfaces(second).length)return false;
 if(first.family!==second.family||stableStringify(first.datums)!==stableStringify(second.datums)||stableStringify(first.profiles)!==stableStringify(second.profiles))return false;
 const signature=(kit:TilesetInterface)=>kit.parts.map(({native,damageAdapter,structuralDefinitionId,...part})=>({...part,edges:part.edges.map(edge=>({...edge,seals:edge.seals.map(({definitionId,...patch})=>patch)})),mounts:part.mounts.map(({definitionId,...mount})=>mount),ports:part.ports.map(({definitionId,sealedPenetrationDefinitionId,...port})=>port)})).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 return stableStringify(signature(first))===stableStringify(signature(second));
}
