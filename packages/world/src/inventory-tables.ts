import { table, t } from "spacetimedb/server";
const byCharacter = [
  {
    accessor: "by_character",
    algorithm: "btree" as const,
    columns: ["characterId"] as ["characterId"],
  },
];
export const inventoryState = table(
  { name: "inventory_state" },
  {
    characterId: t.string().primaryKey(),
    revision: t.u64(),
    kitGranted: t.bool(),
  },
);
export const inventoryItem = table(
  { name: "inventory_item", indexes: byCharacter },
  {
    id: t.string().primaryKey(),
    characterId: t.string(),
    definitionId: t.string(),
    containerId: t.string(),
    equipmentSlot: t.string(),
    x: t.i32(),
    y: t.i32(),
    rotated: t.bool(),
  },
);
export const inventoryContainer = table(
  { name: "inventory_container", indexes: [...byCharacter, { accessor: "by_ship", algorithm: "btree", columns: ["shipId"] }] },
  {
    id: t.string().primaryKey(),
    characterId: t.string(),
    parentItemId: t.string(),
    kind: t.string(),
    name: t.string(),
    width: t.u32(),
    height: t.u32(),
    maxMassKg: t.f64(),
    capacityLitres: t.f64(),
    amountLitres: t.f64(),
    liquidType: t.string(),
    shipId: t.string(),
    localX: t.f64(),
    localY: t.f64(),
    carried: t.bool(),
  },
);
export const inventoryHotbar = table(
  { name: "inventory_hotbar", indexes: byCharacter },
  {
    id: t.string().primaryKey(),
    characterId: t.string(),
    slot: t.u8(),
    itemId: t.string(),
  },
);
export const inventoryReceipt = table(
  { name: "inventory_receipt", indexes: byCharacter },
  {
    id: t.string().primaryKey(),
    characterId: t.string(),
    operationId: t.string(),
    request: t.string(),
    revision: t.u64(),
  },
);
/** Permanent content-delivery receipt; never pruned with command replay receipts. */
export const characterUniformIssue = table(
  { name: "character_uniform_issue" },
  { characterId: t.string().primaryKey(), version: t.u32() },
);
