import {expect,test,vi} from 'vitest';
vi.mock('spacetimedb/server',()=>({SenderError:class extends Error{},t:new Proxy({}, {get:()=>()=>({primaryKey(){return this;}})})}));
import {seedStorage} from './inventory';
import {LAB_STORAGE_FIXTURES} from '../../content/src/storage-fixtures';
test('fixture migration retains the original container and creates only empty stable links once',()=>{
 const legacy={id:'existing-crate',characterId:'actor',name:'Storage supply crate',kind:'grid',parentItemId:'',carried:false,shipId:'ship',width:6,height:6,maxMassKg:500,capacityLitres:0,amountLitres:0,liquidType:'',localX:-3.1,localY:3};
 const containers=[legacy],bindings:{id:string;containerId:string;placementId:string;characterId:string}[]=[];
 let state={characterId:'actor',revision:12n,kitGranted:true},sequence=0;
 const db={character:{id:{find:()=>({id:'actor',shipId:'ship'})}},inventoryContainer:{by_character:{filter:()=>containers},insert:(row:typeof legacy)=>{containers.push(row);return row;}},storageBinding:{id:{find:(id:string)=>bindings.find(row=>row.id===id)},insert:(row:typeof bindings[number])=>bindings.push(row)},inventoryState:{characterId:{find:()=>state,update:(row:typeof state)=>{state=row;}}}};
 const ctx={db,newUuidV4:()=>`new-${++sequence}`} as unknown as Parameters<typeof seedStorage>[0];
 seedStorage(ctx,'actor');expect(bindings).toHaveLength(4);expect(containers).toHaveLength(4);
 expect(bindings.find(row=>row.placementId===LAB_STORAGE_FIXTURES[0].placementId)?.containerId).toBe('existing-crate');expect(containers[0]).toBe(legacy);expect(state.revision).toBe(13n);
 const ids=containers.map(row=>row.id);seedStorage(ctx,'actor');expect(containers.map(row=>row.id)).toEqual(ids);expect(state.revision).toBe(13n);
 // No inventoryItem table exists in this context: migration cannot mint, move or delete contents.
});

test('container views inherit reach and wall occlusion, including nested contents',async()=>{
 const {inventoryContainersView,inventoryItemsView}=await import('./inventory');
 const actor={id:'actor',shipId:'ship',connected:true,localX:-3.1,localY:.4};
 const container={id:'world',characterId:'actor',shipId:'ship',parentItemId:'',kind:'grid',name:'Crate',width:6,height:6,maxMassKg:500,capacityLitres:0,amountLitres:0,liquidType:'',localX:-3.1,localY:1,carried:false};
 const item={id:'pack',definitionId:'field-pack',containerId:'world',equipmentSlot:'',x:0,y:0,rotated:false};
 const child={...container,id:'nested',parentItemId:'pack'};
 const ctx={sender:{},db:{character:{by_owner:{filter:()=>[actor]}},inventoryContainer:{by_character:{filter:()=>[container,child]}},inventoryItem:{by_character:{filter:()=>[item]}},storageBinding:{by_character:{filter:()=>[]}}}} as unknown as Parameters<typeof inventoryContainersView>[0];
 expect(inventoryContainersView(ctx)).toEqual([]);expect(inventoryItemsView(ctx)).toEqual([]);
 actor.localY=1.1;expect(inventoryContainersView(ctx).map(row=>row.id)).toEqual(['world','nested']);expect(inventoryItemsView(ctx)[0].id).toBe('pack');
 actor.localY=4;expect(inventoryContainersView(ctx)).toEqual([]);
 actor.localY=1.1;actor.connected=false;expect(inventoryContainersView(ctx)).toEqual([]);
});

test('bound cargo reach follows the authored floor arrangement without rewriting persisted coordinates',async()=>{
 const {inventoryContainersView}=await import('./inventory');
 const actor={id:'actor',shipId:'ship',connected:true,localX:-2.4,localY:2.75};
 const containers=LAB_STORAGE_FIXTURES.map((f,i)=>({id:`crate-${i}`,characterId:'actor',shipId:'ship',parentItemId:'',kind:'grid',name:f.name,width:6,height:6,maxMassKg:500,capacityLitres:0,amountLitres:0,liquidType:'',localX:100,localY:100,carried:false}));
 const bindings=LAB_STORAGE_FIXTURES.map((f,i)=>({id:`link-${i}`,characterId:'actor',containerId:`crate-${i}`,placementId:f.placementId}));
 const ctx={sender:{},db:{character:{by_owner:{filter:()=>[actor]}},inventoryContainer:{by_character:{filter:()=>containers}},inventoryItem:{by_character:{filter:()=>[]}},storageBinding:{by_character:{filter:()=>bindings}}}} as unknown as Parameters<typeof inventoryContainersView>[0];
 expect(inventoryContainersView(ctx)).toHaveLength(4);
 // At this distance only the aisle-facing row is reachable. Old shared X would expose all four.
 actor.localX=-2.2;
 expect(inventoryContainersView(ctx).map(row=>row.placementId)).toEqual([LAB_STORAGE_FIXTURES[1].placementId,LAB_STORAGE_FIXTURES[3].placementId]);
 expect(containers.every(row=>row.localX===100&&row.localY===100)).toBe(true);
});
