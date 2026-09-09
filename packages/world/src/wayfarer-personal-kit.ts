import type { Infer, InferSchema, ReducerCtx } from "spacetimedb/server";
import type world from "./index";
import type { inventoryContainer, inventoryItem } from "./inventory-tables";
import {
  INVENTORY_DEFINITIONS,
  CHARACTER_CARRY_LIMIT_KG,
  LIQUID_DENSITY_KG_PER_LITRE,
} from "@sidereal/content/inventory";
import { validateInventory } from "@sidereal/sim/inventory";
import {
  legacyInventorySnapshot,
  synchronizeLegacyInventory,
} from "./scoped-inventory-authority";
type Context = ReducerCtx<InferSchema<typeof world>>;
type Container = Infer<typeof inventoryContainer.rowType>;
type Item = Infer<typeof inventoryItem.rowType>;

/** Same carried seven-item kit as existing onboarding, without lab supply crates,
 * uniforms or engineering tanks. Internal first-character transaction only. */
export function issueWayfarerPersonalKit(ctx: Context, characterId: string) {
  const actor = ctx.db.character.id.find(characterId);
  if (!actor?.owner.isEqual(ctx.sender) || !actor.connected)
    throw Error("Owned connected starter character required");
  const prior = ctx.db.inventoryState.characterId.find(characterId);
  if (prior?.kitGranted) return;
  const before = legacyInventorySnapshot(ctx, characterId);
  if (
    prior ||
    before.items.length ||
    before.containers.length ||
    [...ctx.db.inventoryHotbar.by_character.filter(characterId)].length
  )
    throw Error("Existing personal inventory requires explicit recovery");
  const containers: Container[] = [],
    items: Item[] = [],
    used = new Set<string>();
  const uuid = () => {
    const id = ctx.newUuidV4().toString();
    if (
      used.has(id) ||
      ctx.db.inventoryItem.id.find(id) ||
      ctx.db.inventoryContainer.id.find(id)
    )
      throw Error("Fresh personal kit UUID required");
    used.add(id);
    return id;
  };
  const grid = (
    name: string,
    width: number,
    height: number,
    maxMassKg: number,
    carried = false,
    parentItemId = "",
  ) => {
    const id = uuid();
    containers.push({
      id,
      characterId,
      parentItemId,
      kind: "grid",
      name,
      width,
      height,
      maxMassKg,
      carried,
      capacityLitres: 0,
      amountLitres: 0,
      liquidType: "",
      shipId: actor.shipId,
      localX: 0,
      localY: 0,
    });
    return id;
  };
  const item = (
    definitionId: string,
    containerId: string,
    x: number,
    y: number,
    equipmentSlot = "",
  ) => {
    const id = uuid();
    items.push({
      id,
      characterId,
      definitionId,
      containerId,
      x,
      y,
      equipmentSlot,
      rotated: false,
    });
    return id;
  };
  const pockets = grid("Pockets", 4, 2, 6, true);
  const pack = item("field-pack", "", 0, 0, "back");
  const backpack = grid("Field backpack", 8, 6, 24, false, pack);
  item("compact-pistol", backpack, 0, 0);
  item("carbine", backpack, 2, 0);
  item("scanner", backpack, 4, 0);
  item("medkit", backpack, 5, 0);
  item("power-cell", backpack, 7, 0);
  const canister = item("resource-canister", backpack, 0, 2);
  containers.push({
    id: uuid(),
    characterId,
    parentItemId: canister,
    kind: "liquid",
    name: "Canister reservoir",
    width: 0,
    height: 0,
    maxMassKg: 4,
    capacityLitres: 5,
    amountLitres: 2,
    liquidType: "fuel",
    shipId: actor.shipId,
    localX: 0,
    localY: 0,
    carried: false,
  });
  validateInventory(
    { items, containers },
    INVENTORY_DEFINITIONS,
    LIQUID_DENSITY_KG_PER_LITRE,
    pockets,
    CHARACTER_CARRY_LIMIT_KG,
  );
  for (const c of containers) ctx.db.inventoryContainer.insert(c);
  for (const i of items) ctx.db.inventoryItem.insert(i);
  ctx.db.inventoryState.insert({ characterId, revision: 1n, kitGranted: true });
  for (let slot = 0; slot < 5; slot++)
    ctx.db.inventoryHotbar.insert({
      id: `${characterId}:${slot}`,
      characterId,
      slot,
      itemId: "",
    });
  synchronizeLegacyInventory(ctx, characterId, before);
}

/** A redeemed native starter must never fall through to the legacy laboratory
 * storage/uniform initializer when the public kit command is replayed. */
export function preserveWayfarerStarterKit(ctx: Context): boolean {
  const receipt = ctx.db.personalStarterReceipt.owner.find(ctx.sender);
  if (!receipt) return false;
  const actor = ctx.db.character.id.find(receipt.characterId);
  const state = ctx.db.inventoryState.characterId.find(receipt.characterId);
  if (
    !actor?.owner.isEqual(ctx.sender) ||
    !actor.connected ||
    !state?.kitGranted
  )
    throw Error("Redeemed starter inventory requires explicit recovery");
  return true;
}
