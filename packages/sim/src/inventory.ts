/** Pure bounded inventory placement and mass rules. A drag is an intent, never
 * a persistent item location; every instance has one container or equipment slot. */
export interface GridItem {id:string;definitionId:string;containerId:string;equipmentSlot:string;x:number;y:number;rotated:boolean;}
export interface GridContainer {id:string;parentItemId:string;kind:string;width:number;height:number;maxMassKg:number;capacityLitres:number;amountLitres:number;liquidType:string;}
export interface GridDefinition {id:string;width:number;height:number;massKg:number;equipSlot?:string;}
export type InventoryLocation = Pick<GridItem,"containerId"|"equipmentSlot"|"x"|"y"|"rotated">;
export interface InventorySnapshot {items:readonly GridItem[];containers:readonly GridContainer[];}
const MAX_ITEMS=128, MAX_CONTAINERS=152, MAX_DEPTH=6;
export function itemSize(item:GridItem,definition:GridDefinition) {return item.rotated ? {width:definition.height,height:definition.width} : {width:definition.width,height:definition.height};}
function definitionsById(definitions:readonly GridDefinition[]) {return new Map(definitions.map(d=>[d.id,d]));}
export function inventoryMass(snapshot:InventorySnapshot,definitions:readonly GridDefinition[],liquidDensity:Readonly<Record<string,number>>) {
  if(snapshot.items.length>MAX_ITEMS || snapshot.containers.length>MAX_CONTAINERS)throw new Error("Inventory budget exceeded");
  const defs=definitionsById(definitions), items=new Map(snapshot.items.map(item=>[item.id,item]));
  const memo=new Map<string,number>();
  const itemMass=(id:string,path:string[]=[]):number=>{
    if(path.includes(id)||path.length>MAX_DEPTH)throw new Error("Container cycle or nesting limit");
    if(memo.has(id))return memo.get(id)!;
    const item=items.get(id),definition=item&&defs.get(item.definitionId);
    if(!item||!definition)throw new Error("Unknown item definition or instance");
    let mass=definition.massKg;
    for(const container of snapshot.containers.filter(c=>c.parentItemId===id))mass+=containerMass(container,[...path,id]);
    memo.set(id,mass);return mass;
  };
  const containerMass=(container:GridContainer,path:string[]=[]):number=>container.kind==="liquid"
    ? container.amountLitres*(liquidDensity[container.liquidType]??0)
    : snapshot.items.filter(i=>i.containerId===container.id).reduce((sum,item)=>sum+itemMass(item.id,path),0);
  for(const item of snapshot.items)itemMass(item.id);
  return {itemMass:(id:string)=>itemMass(id),containerMass:(id:string)=>{const c=snapshot.containers.find(c=>c.id===id);if(!c)throw new Error("Unknown container");return containerMass(c);}};
}
export function validateInventory(snapshot:InventorySnapshot,definitions:readonly GridDefinition[],liquidDensity:Readonly<Record<string,number>>,pocketsId:string,carryLimitKg:number) {
  const defs=definitionsById(definitions), containers=new Map(snapshot.containers.map(c=>[c.id,c]));
  if(new Set(snapshot.items.map(i=>i.id)).size!==snapshot.items.length || containers.size!==snapshot.containers.length)throw new Error("Duplicate inventory identity");
  const slots=new Set<string>();
  for(const container of snapshot.containers){
    if(container.parentItemId&&!snapshot.items.some(i=>i.id===container.parentItemId))throw new Error("Container has no parent item");
    if(container.kind!=="grid"&&container.kind!=="liquid")throw new Error("Unknown storage kind");
    if(container.kind==="grid"&&(!Number.isInteger(container.width)||!Number.isInteger(container.height)||container.width<1||container.height<1||container.width>16||container.height>16))throw new Error("Invalid grid bounds");
    if(container.kind==="liquid"&&(!Number.isFinite(container.amountLitres)||!Number.isFinite(container.capacityLitres)||container.amountLitres<0||container.amountLitres>container.capacityLitres||!(container.liquidType in liquidDensity)))throw new Error("Invalid reservoir contents");
  }
  for(const item of snapshot.items){
    const definition=defs.get(item.definitionId);if(!definition)throw new Error("Unknown item definition");
    if(Boolean(item.containerId)===Boolean(item.equipmentSlot))throw new Error("Item must have exactly one location");
    if(item.equipmentSlot){
      if(item.equipmentSlot!==definition.equipSlot)throw new Error("Item does not fit this equipment slot");
      if(slots.has(item.equipmentSlot))throw new Error("Equipment slot occupied");slots.add(item.equipmentSlot);continue;
    }
    const container=containers.get(item.containerId);if(!container||container.kind!=="grid")throw new Error("Items require a grid container");
    const size=itemSize(item,definition);
    if(!Number.isInteger(item.x)||!Number.isInteger(item.y)||item.x<0||item.y<0||item.x+size.width>container.width||item.y+size.height>container.height)throw new Error("Item extends outside the container");
    for(const other of snapshot.items){
      if(other.id===item.id||other.containerId!==item.containerId)continue;
      const otherDef=defs.get(other.definitionId);if(!otherDef)throw new Error("Unknown item definition");
      const otherSize=itemSize(other,otherDef);
      if(item.x<other.x+otherSize.width&&item.x+size.width>other.x&&item.y<other.y+otherSize.height&&item.y+size.height>other.y)throw new Error("Inventory items overlap");
    }
  }
  const mass=inventoryMass(snapshot,definitions,liquidDensity);
  for(const container of snapshot.containers)if(mass.containerMass(container.id)>container.maxMassKg+1e-8)throw new Error("Container payload limit exceeded");
  const carried=mass.containerMass(pocketsId)+snapshot.items.filter(i=>i.equipmentSlot).reduce((sum,item)=>sum+mass.itemMass(item.id),0);
  if(carried>carryLimitKg+1e-8)throw new Error("Character carry limit exceeded");
  return carried;
}
export function placeInventoryItem(snapshot:InventorySnapshot,definitions:readonly GridDefinition[],liquidDensity:Readonly<Record<string,number>>,pocketsId:string,carryLimitKg:number,itemId:string,location:InventoryLocation) {
  if(!snapshot.items.some(item=>item.id===itemId))throw new Error("Item unavailable");
  const result={...snapshot,items:snapshot.items.map(item=>item.id===itemId?{...item,...location}:item)};
  validateInventory(result,definitions,liquidDensity,pocketsId,carryLimitKg);return result.items;
}
/** Finds a legal complete move, including payload/nesting/carry checks. */
export function firstInventoryPlacement(snapshot:InventorySnapshot,definitions:readonly GridDefinition[],liquidDensity:Readonly<Record<string,number>>,pocketsId:string,carryLimitKg:number,itemId:string,containerId:string):InventoryLocation|undefined {
  const container=snapshot.containers.find(c=>c.id===containerId);if(!container||container.kind!=="grid")return;
  const item=snapshot.items.find(i=>i.id===itemId), definition=item&&definitions.find(d=>d.id===item.definitionId);
  if(!item||!definition)return;
  const occupied=snapshot.items.filter(i=>i.containerId===containerId&&i.id!==itemId).map(i=>({item:i,size:itemSize(i,definitions.find(d=>d.id===i.definitionId)!)}));
  for(const rotated of [item.rotated,!item.rotated])for(let y=0;y<container.height;y++)for(let x=0;x<container.width;x++){
    const width=rotated?definition.height:definition.width,height=rotated?definition.width:definition.height;
    if(x+width>container.width||y+height>container.height||occupied.some(o=>x<o.item.x+o.size.width&&x+width>o.item.x&&y<o.item.y+o.size.height&&y+height>o.item.y))continue;
    const location={containerId,equipmentSlot:"",x,y,rotated};
    try{placeInventoryItem(snapshot,definitions,liquidDensity,pocketsId,carryLimitKg,itemId,location);return location;}catch{}
  }
}
