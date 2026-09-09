import { expect, test } from 'vitest';
import { inventoryAppearance } from './inventory';
import type { InventoryState } from '../../../packages/canvas-ui/src';
const empty:InventoryState={revision:'1',items:[],containers:[],hotbar:[],carriedMassKg:0,carryLimitKg:32};
test('cosmetic previews cannot create held weapons or a backpack without inventory',()=>{
  const result=inventoryAppearance(empty,{weapon:'rifle',backpack:true,suit:'#345678'});
  expect(result.equippedAsset).toBeNull();expect(result.crewAppearance.weapon).toBe('none');expect(result.crewAppearance.backpack).toBe(false);expect(result.crewAppearance.suit).toBe('#345678');
});
test('same-pose weapons keep their distinct actual asset and backpack equipment follows authority',()=>{
  for(const [definitionId,asset] of [['compact-pistol','compact-pistol'],['heavy-handgun','heavy-handgun'],['scanner','sample-scanner']]){
    const result=inventoryAppearance({...empty,items:[{id:'hand',definitionId,containerId:'',equipmentSlot:'hand',x:0,y:0,rotated:false},{id:'pack',definitionId:'field-pack',containerId:'',equipmentSlot:'back',x:0,y:0,rotated:false}]},{});
    expect(result.equippedAsset).toBe(asset);expect(result.crewAppearance.weapon).toBe('pistol');expect(result.crewAppearance.backpack).toBe(true);
  }
});

test('reachable cargo preserves actual nested liquid payload and drops revoked contents', async()=>{
 const {inventoryView}=await import('./inventory');
 const table=(rows:unknown[])=>({iter:()=>rows.values()});
 const cargo=[{id:'reservoir',parentItemId:'canister',kind:'liquid',name:'Fuel',placedObjectId:'',width:0,height:0,maxMassKg:30,capacityLitres:20,amountLitres:7,liquidType:'fuel',revision:4n}];
 const contents=[{id:'canister',definitionId:'fuel-canister',containerId:'cargo-root',x:0,y:0,rotated:false,revision:2n}];
 const connection={db:{ownInventoryState:table([]),ownInventoryItems:table([]),ownInventoryContainers:table([]),ownInventoryHotbar:table([]),ownReachableCargoContainers:table(cargo),ownReachableCargoItems:table(contents)}} as unknown as import('@sidereal/net').DbConnection;
 expect(inventoryView(connection,true).containers[0]).toMatchObject({capacityLitres:20,amountLitres:7,liquidType:'fuel',carried:false});
 expect(inventoryView(connection,true).items[0].equipmentSlot).toBe('');
 cargo.length=0;contents.length=0;
 expect(inventoryView(connection,true).items).toEqual([]);
 expect(inventoryView(connection,true).containers).toEqual([]);
});
