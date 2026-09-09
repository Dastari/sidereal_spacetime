import { expect, test } from "vitest";
import { validateInventory, placeInventoryItem, inventoryMass, type InventorySnapshot } from "./inventory";
import { INVENTORY_DEFINITIONS as definitions, LIQUID_DENSITY_KG_PER_LITRE as density } from "../../content/src/inventory";
function fixture():InventorySnapshot {
  return {containers:[
    {id:"pockets",parentItemId:"",kind:"grid",width:4,height:2,maxMassKg:6,capacityLitres:0,amountLitres:0,liquidType:""},
    {id:"bag",parentItemId:"pack",kind:"grid",width:8,height:6,maxMassKg:24,capacityLitres:0,amountLitres:0,liquidType:""},
    {id:"fuel",parentItemId:"can",kind:"liquid",width:0,height:0,maxMassKg:4,capacityLitres:5,amountLitres:2,liquidType:"fuel"},
    {id:"crate",parentItemId:"",kind:"grid",width:6,height:6,maxMassKg:500,capacityLitres:0,amountLitres:0,liquidType:""},
  ],items:[
    {id:"pack",definitionId:"field-pack",containerId:"",equipmentSlot:"back",x:0,y:0,rotated:false},
    {id:"pistol",definitionId:"compact-pistol",containerId:"bag",equipmentSlot:"",x:0,y:0,rotated:false},
    {id:"rifle",definitionId:"carbine",containerId:"bag",equipmentSlot:"",x:2,y:0,rotated:false},
    {id:"can",definitionId:"resource-canister",containerId:"bag",equipmentSlot:"",x:0,y:2,rotated:false},
  ]};
}
const move=(s:InventorySnapshot,id:string,containerId:string,x:number,y:number,rotated=false)=>placeInventoryItem(s,definitions,density,"pockets",32,id,{containerId,equipmentSlot:"",x,y,rotated});
test("rotated rifle fits pockets, unrotated/overlapping/outside placement rejects without changing input",()=>{
  const s=fixture(),before=JSON.stringify(s);
  expect(()=>move(s,"rifle","pockets",0,0)).toThrow("outside");
  const placed=move(s,"rifle","pockets",0,0,true);
  expect(placed.find(i=>i.id==="rifle")?.rotated).toBe(true);
  expect(()=>move(s,"rifle","bag",0,0)).toThrow("overlap");
  for(const x of [-1,NaN,Infinity,1.5])expect(()=>move(s,"pistol","bag",x,0)).toThrow();
  expect(JSON.stringify(s)).toBe(before);
});
test("backpack storage follows its stable item and rejects direct/indirect cycles",()=>{
  const s=fixture(),before=inventoryMass(s,definitions,density).itemMass("pack");
  expect(()=>move(s,"pack","bag",4,0)).toThrow(/cycle|nesting/);
  const items=move(s,"pack","crate",0,0);
  const result={...s,items};
  expect(inventoryMass(result,definitions,density).itemMass("pack")).toBe(before);
  expect(result.items.filter(i=>i.containerId==="bag")).toHaveLength(3);
  expect(validateInventory(result,definitions,density,"pockets",32)).toBe(0);
  const second={id:"other-pack",definitionId:"field-pack",containerId:"bag",equipmentSlot:"",x:4,y:0,rotated:false};
  const nested={items:[...s.items,second],containers:[...s.containers,{...s.containers[1],id:"other-bag",parentItemId:second.id}]};
  expect(()=>move(nested,"pack","other-bag",0,0)).toThrow(/cycle|nesting/);
});
test("nested reservoir mass counted once, capacity-only storage rejects grid items and overflow",()=>{
  const s=fixture(),mass=inventoryMass(s,definitions,density);
  expect(mass.itemMass("can")).toBeCloseTo(2.2);
  expect(validateInventory(s,definitions,density,"pockets",32)).toBeCloseTo(7.7);
  expect(()=>move(s,"pistol","fuel",0,0)).toThrow("grid");
  const overflow={...s,containers:s.containers.map(c=>c.id==="fuel"?{...c,amountLitres:6}:c)};
  expect(()=>validateInventory(overflow,definitions,density,"pockets",32)).toThrow("reservoir");
  const tooHeavy={...s,containers:s.containers.map(c=>c.id==="bag"?{...c,maxMassKg:1}:c)};
  expect(()=>validateInventory(tooHeavy,definitions,density,"pockets",32)).toThrow("payload");
  expect(()=>validateInventory(s,definitions,density,"pockets",2)).toThrow("carry");
});
