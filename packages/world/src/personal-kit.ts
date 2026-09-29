import type { Infer, InferSchema, ReducerCtx } from "spacetimedb/server";
import type world from "./index";
import type { inventoryContainer, inventoryItem } from "./inventory-tables";
import { itemDefinitions, commitPin } from "./item-definitions";
import {
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

/** The carried seven-item personal kit, without lab supply crates,
 * uniforms or engineering tanks. Internal first-character transaction only. */
export function issuePersonalKit(ctx: Context, characterId: string) {
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
    used = new Set<string>(),
    defs = itemDefinitions(ctx);
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
    defs.stage(id, definitionId);
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
  // Container sizes come from each new instance's pinned definition (revision 1 = 8x6, 24 kg).
  const packStorage = defs.item({ id: pack, definitionId: "field-pack" })
    .storage ?? { width: 8, height: 6, maxMassKg: 24 };
  const backpack = grid(
    "Field backpack",
    packStorage.width,
    packStorage.height,
    packStorage.maxMassKg,
    false,
    pack,
  );
  item("compact-pistol", backpack, 0, 0);
  item("carbine", backpack, 2, 0);
  item("scanner", backpack, 4, 0);
  item("medkit", backpack, 5, 0);
  item("power-cell", backpack, 7, 0);
  const canister = item("resource-canister", backpack, 0, 2);
  const reservoir = defs.item({
    id: canister,
    definitionId: "resource-canister",
  }).reservoir ?? { capacityLitres: 5, liquidType: "fuel" };
  containers.push({
    id: uuid(),
    characterId,
    parentItemId: canister,
    kind: "liquid",
    name: "Canister reservoir",
    width: 0,
    height: 0,
    maxMassKg:
      reservoir.capacityLitres *
      (LIQUID_DENSITY_KG_PER_LITRE[reservoir.liquidType] ?? 1),
    capacityLitres: reservoir.capacityLitres,
    amountLitres: Math.min(2, reservoir.capacityLitres),
    liquidType: reservoir.liquidType,
    shipId: actor.shipId,
    localX: 0,
    localY: 0,
    carried: false,
  });
  validateInventory(
    { items, containers },
    defs.grid,
    LIQUID_DENSITY_KG_PER_LITRE,
    pockets,
    CHARACTER_CARRY_LIMIT_KG,
  );
  for (const c of containers) ctx.db.inventoryContainer.insert(c);
  for (const i of items) {
    ctx.db.inventoryItem.insert(i);
    commitPin(ctx, defs, i.id);
  }
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

/** A character boarded on an accepted game ship (a prefab ship) keeps its
 * personal kit: replaying the public kit command must never fall through to the
 * legacy laboratory storage/uniform initializer. */
export function preserveShipKit(ctx: Context): boolean {
  const actors = [...ctx.db.character.by_owner.filter(ctx.sender)];
  const actor = actors[0];
  const access = actor && ctx.db.gameShipAccess.shipId.find(actor.shipId);
  if (!access) return false;
  if (
    actors.length !== 1 ||
    !actor?.owner.isEqual(ctx.sender) ||
    !actor.connected ||
    !access.owner.isEqual(ctx.sender) ||
    access.characterId !== actor.id ||
    access.instanceId !== actor.shipId ||
    access.lifecycle !== "active"
  )
    throw Error("Ship inventory requires explicit recovery");
  return true;
}
