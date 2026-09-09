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
