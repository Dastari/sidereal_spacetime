import { packArmorIssue } from "@sidereal/sim/armor-issue";
import { LAB_STORAGE_FIXTURES } from "../../content/src/storage-fixtures";
import { CABIN_PARTITIONS } from "../../content/src/interior";
import { interactionLineOfSight } from "../../sim/src/interactions";
import {
  SenderError,
  t,
  type ReducerCtx,
  type ViewCtx,
  type InferSchema,
} from "spacetimedb/server";
import type world from "./index";
import {
  INVENTORY_DEFINITIONS,
  CHARACTER_ARMOR_DEFINITIONS,
  inventoryDefinition,
  CHARACTER_CARRY_LIMIT_KG,
  LIQUID_DENSITY_KG_PER_LITRE,
} from "../../content/src/inventory";
import {
  validateInventory,
  firstInventoryPlacement,
  type InventorySnapshot,
  type GridItem,
} from "../../sim/src/inventory";
type ReadContext = Pick<ViewCtx<InferSchema<typeof world>>, "sender" | "db">;
type Context = ReducerCtx<InferSchema<typeof world>>;
function fail(message: string): never {
  throw new SenderError(message);
}
function actorFor(ctx: ReadContext) {
  return [...ctx.db.character.by_owner.filter(ctx.sender)][0];
}
function snapshot(ctx: ReadContext, characterId: string) {
  return {
    items: [...ctx.db.inventoryItem.by_character.filter(characterId)],
    containers: [...ctx.db.inventoryContainer.by_character.filter(characterId)],
  };
}
export function access(ctx: ReadContext) {
  const actor = actorFor(ctx);
  if (!actor?.connected) return;
  const data = snapshot(ctx, actor.id);
  const bindings = [...ctx.db.storageBinding.by_character.filter(actor.id)];
  const carriedContainer = (id: string, path: string[] = []): boolean => {
    if (path.length > 6 || path.includes(id)) return false;
    const container = data.containers.find((c) => c.id === id);
    if (!container) return false;
    if (!container.parentItemId) return container.carried;
    const parent = data.items.find((i) => i.id === container.parentItemId);
    return (
      !!parent &&
      (!!parent.equipmentSlot ||
        carriedContainer(parent.containerId, [...path, id]))
    );
  };
  const canContainer = (id: string, path: string[] = []): boolean => {
    if (path.length > 6 || path.includes(id)) return false;
    const container = data.containers.find((c) => c.id === id);
    if (!container) return false;
    if (container.parentItemId) {
      const parent = data.items.find((i) => i.id === container.parentItemId);
      return (
        !!parent &&
        (!!parent.equipmentSlot ||
          canContainer(parent.containerId, [...path, id]))
      );
    }
    const binding = bindings.find((binding) => binding.containerId === id);
    const fixture = LAB_STORAGE_FIXTURES.find(
      (fixture) => fixture.placementId === binding?.placementId,
    );
    const x = fixture?.x ?? container.localX,
      y = fixture?.y ?? container.localY;
    return (
      container.carried ||
      (container.shipId === actor.shipId &&
        Math.hypot(x - actor.localX, y - actor.localY) <= 1.8 &&
        interactionLineOfSight(
          actor.localX,
          actor.localY,
          fixture?.approachX ?? x,
          fixture?.approachY ?? y,
          CABIN_PARTITIONS,
        ))
    );
  };
  const canItem = (id: string) => {
    const item = data.items.find((i) => i.id === id);
    return !!item && (!!item.equipmentSlot || canContainer(item.containerId));
  };
  const pockets = data.containers.find(
    (c) => c.carried && !c.parentItemId && c.kind === "grid",
  );
  return {
    actor,
    data,
    pockets,
    canItem,
    canContainer,
    carriedContainer,
    bindings,
  };
}
export const stateProjection = t.object("InventoryStatus", {
  revision: t.u64(),
  kitGranted: t.bool(),
  pocketsId: t.string(),
  carriedMassKg: t.f64(),
  carryLimitKg: t.f64(),
});
export const itemProjection = t.object("VisibleInventoryItem", {
  id: t.string(),
  definitionId: t.string(),
  containerId: t.string(),
  equipmentSlot: t.string(),
  x: t.i32(),
  y: t.i32(),
  rotated: t.bool(),
});
export const containerProjection = t.object("VisibleInventoryContainer", {
  placementId: t.string(),
  id: t.string(),
  parentItemId: t.string(),
  kind: t.string(),
  name: t.string(),
  width: t.u32(),
  height: t.u32(),
  maxMassKg: t.f64(),
  capacityLitres: t.f64(),
  amountLitres: t.f64(),
  liquidType: t.string(),
  carried: t.bool(),
});
export const hotbarProjection = t.object("VisibleInventoryHotbar", {
  slot: t.u8(),
  itemId: t.string(),
});
export function inventoryStateView(ctx: ReadContext) {
  const a = access(ctx);
  if (!a?.pockets) return [];
  const state = ctx.db.inventoryState.characterId.find(a.actor.id);
  if (!state) return [];
  return [
    {
      revision: state.revision,
      kitGranted: state.kitGranted,
      pocketsId: a.pockets.id,
      carriedMassKg: validateInventory(
        a.data,
        INVENTORY_DEFINITIONS,
        LIQUID_DENSITY_KG_PER_LITRE,
        a.pockets.id,
        CHARACTER_CARRY_LIMIT_KG,
      ),
      carryLimitKg: CHARACTER_CARRY_LIMIT_KG,
    },
  ];
}
export function inventoryItemsView(ctx: ReadContext) {
  const a = access(ctx);
  return a
    ? a.data.items
        .filter((i) => a.canItem(i.id))
        .map(
          ({
            id,
            definitionId,
            containerId,
            equipmentSlot,
            x,
            y,
            rotated,
          }) => ({
            id,
            definitionId,
            containerId,
            equipmentSlot,
            x,
            y,
            rotated,
          }),
        )
    : [];
}
export function inventoryContainersView(ctx: ReadContext) {
  const a = access(ctx);
  return a
    ? a.data.containers
        .filter((c) => a.canContainer(c.id))
        .map(
          ({
            id,
            parentItemId,
            kind,
            name,
            width,
            height,
            maxMassKg,
            capacityLitres,
            amountLitres,
            liquidType,
          }) => ({
            id,
            parentItemId,
            kind,
            name,
            width,
            height,
            maxMassKg,
            capacityLitres,
            amountLitres,
            liquidType,
            carried: a.carriedContainer(id),
            placementId:
              a.bindings.find((binding) => binding.containerId === id)
                ?.placementId ?? "",
          }),
        )
    : [];
}
export function inventoryHotbarView(ctx: ReadContext) {
  const a = access(ctx);
  return a
    ? [...ctx.db.inventoryHotbar.by_character.filter(a.actor.id)].map(
        ({ slot, itemId }) => ({
          slot,
          itemId: a.canItem(itemId) ? itemId : "",
        }),
      )
    : [];
}
export function claimKit(ctx: Context) {
  const actor = actorFor(ctx);
  if (!actor?.connected) fail("Enter the lab before claiming equipment");
  if (ctx.db.inventoryState.characterId.find(actor.id)?.kitGranted) {
    seedStorage(ctx, actor.id);
    seedCharacterUniforms(ctx, actor.id);
    return;
  }
  const characterId = actor.id,
    uuid = () => ctx.newUuidV4().toString();
  const grid = (
    name: string,
    width: number,
    height: number,
    maxMassKg: number,
    carried = false,
    parentItemId = "",
    localX = 0,
    localY = 0,
  ) => {
    const row = {
      id: uuid(),
      characterId,
      parentItemId,
      kind: "grid",
      name,
      width,
      height,
      maxMassKg,
      capacityLitres: 0,
      amountLitres: 0,
      liquidType: "",
      shipId: actor.shipId,
      localX,
      localY,
      carried,
    };
    ctx.db.inventoryContainer.insert(row);
    return row.id;
  };
  const item = (
    definitionId: string,
    containerId: string,
    x: number,
    y: number,
    equipmentSlot = "",
  ) => {
    const row = {
      id: uuid(),
      characterId,
      definitionId,
      containerId,
      equipmentSlot,
      x,
      y,
      rotated: false,
    };
    ctx.db.inventoryItem.insert(row);
    return row.id;
  };
  grid("Pockets", 4, 2, 6, true);
  const pack = item("field-pack", "", 0, 0, "back");
  const packGrid = grid("Field backpack", 8, 6, 24, false, pack);
  item("compact-pistol", packGrid, 0, 0);
  item("carbine", packGrid, 2, 0);
  item("scanner", packGrid, 4, 0);
  item("medkit", packGrid, 5, 0);
  item("power-cell", packGrid, 7, 0);
  const canister = item("resource-canister", packGrid, 0, 2);
  const liquid = (
    name: string,
    parentItemId: string,
    capacityLitres: number,
    amountLitres: number,
    x: number,
    y: number,
  ) =>
    ctx.db.inventoryContainer.insert({
      id: uuid(),
      characterId,
      parentItemId,
      kind: "liquid",
      name,
      width: 0,
      height: 0,
      maxMassKg: capacityLitres * 0.8,
      capacityLitres,
      amountLitres,
      liquidType: "fuel",
      shipId: actor.shipId,
      localX: x,
      localY: y,
      carried: false,
    });
  liquid("Canister reservoir", canister, 5, 2, 0, 0);
  const crate = grid("Storage supply crate", 6, 6, 500, false, "", -3.1, 3);
  item("long-rifle", crate, 0, 0);
  item("heavy-handgun", crate, 2, 0);
  liquid("Engineering fuel tank", "", 100, 20, -3.1, -6);
  seedStorage(ctx, actor.id);
  seedCharacterUniforms(ctx, actor.id);
  const data = snapshot(ctx, actor.id),
    pockets = data.containers.find((c) => c.carried)!;
  validateInventory(
    data,
    INVENTORY_DEFINITIONS,
    LIQUID_DENSITY_KG_PER_LITRE,
    pockets.id,
    CHARACTER_CARRY_LIMIT_KG,
  );
  ctx.db.inventoryState.insert({ characterId, revision: 1n, kitGranted: true });
  for (let slot = 0; slot < 5; slot++)
    ctx.db.inventoryHotbar.insert({
      id: `${characterId}:${slot}`,
      characterId,
      slot,
      itemId: "",
    });
}
type Mutation = { expectedRevision: bigint; operationId: string };
export function transaction(
  ctx: Context,
  args: Mutation,
  kind: string,
  request: unknown,
  apply: (a: NonNullable<ReturnType<typeof access>>) => void,
) {
  const a = access(ctx);
  if (!a?.pockets) fail("Character inventory unavailable");
  if (!/^[a-zA-Z0-9:_-]{1,80}$/.test(args.operationId))
    fail("Invalid inventory operation ID");
  const state = ctx.db.inventoryState.characterId.find(a.actor.id);
  if (!state) fail("Claim starter equipment first");
  const serialized = JSON.stringify([
    kind,
    args.expectedRevision.toString(),
    request,
  ]);
  const receiptId = `${a.actor.id}:${args.operationId}`,
    receipt = ctx.db.inventoryReceipt.id.find(receiptId);
  if (receipt) {
    if (receipt.request !== serialized)
      fail("Operation ID reused with a different request");
    return;
  }
  if (state.revision !== args.expectedRevision)
    fail("Inventory revision conflict");
  try {
    apply(a);
  } catch (error) {
    if (error instanceof SenderError) throw error;
    fail(
      error instanceof Error ? error.message : "Invalid inventory operation",
    );
  }
  const revision = state.revision + 1n;
  ctx.db.inventoryState.characterId.update({ ...state, revision });
  const receipts = [
    ...ctx.db.inventoryReceipt.by_character.filter(a.actor.id),
  ].sort((x, y) => (x.revision < y.revision ? -1 : 1));
  while (receipts.length >= 128)
    ctx.db.inventoryReceipt.id.delete(receipts.shift()!.id);
  ctx.db.inventoryReceipt.insert({
    id: receiptId,
    characterId: a.actor.id,
    operationId: args.operationId,
    request: serialized,
    revision,
  });
}
export function commitItems(
  ctx: Context,
  a: NonNullable<ReturnType<typeof access>>,
  items: GridItem[],
) {
  validateInventory(
    { ...a.data, items },
    INVENTORY_DEFINITIONS,
    LIQUID_DENSITY_KG_PER_LITRE,
    a.pockets!.id,
    CHARACTER_CARRY_LIMIT_KG,
  );
  for (const item of items) {
    const old = a.data.items.find((i) => i.id === item.id)!;
    if (JSON.stringify(old) !== JSON.stringify(item))
      ctx.db.inventoryItem.id.update({ ...old, ...item });
  }
  // Ground wrappers have no identity of their own once their item is retrieved.
  for (const binding of a.bindings.filter(b => b.placementId.startsWith("ground:"))) {
    if (!items.some(item => item.containerId === binding.containerId)) {
      ctx.db.storageBinding.id.delete(binding.id);
      ctx.db.inventoryContainer.id.delete(binding.containerId);
    }
  }
}
function equip(
  ctx: Context,
  a: NonNullable<ReturnType<typeof access>>,
  itemId: string,
) {
  if (!a.canItem(itemId)) fail("Item is out of reach");
  const item = a.data.items.find((i) => i.id === itemId)!,
    slot = inventoryDefinition(item.definitionId).equipSlot;
  if (!slot) fail("Item cannot be equipped");
  if (item.equipmentSlot === slot) return;
  const previous = a.data.items.find((i) => i.equipmentSlot === slot);
  let items = a.data.items.map((i) =>
    i.id === itemId
      ? {
          ...i,
          containerId: "",
          equipmentSlot: slot,
          x: 0,
          y: 0,
          rotated: false,
        }
      : i,
  );
  if (previous) {
    // Hand swaps retain possession; only explicit moves may stow a weapon in world storage.
    items = items.map((i) =>
      i.id === previous.id
        ? {
            ...i,
            containerId: item.containerId,
            equipmentSlot: "",
            x: item.x,
            y: item.y,
            rotated: item.rotated,
          }
        : i,
    );
    const staged: InventorySnapshot = { ...a.data, items };
    const destinations =
      slot === "hand"
        ? [
            ...new Set([
              item.containerId,
              ...a.data.containers.map((container) => container.id),
            ]),
          ].filter(
            (id) =>
              a.canContainer(id) &&
              a.carriedContainer(id) &&
              a.data.containers.some(
                (container) => container.id === id && container.kind === "grid",
              ),
          )
        : [item.containerId];
    const location = destinations
      .map((containerId) =>
        firstInventoryPlacement(
          staged,
          INVENTORY_DEFINITIONS,
          LIQUID_DENSITY_KG_PER_LITRE,
          a.pockets!.id,
          CHARACTER_CARRY_LIMIT_KG,
          previous.id,
          containerId,
        ),
      )
      .find((placement) => placement !== undefined);
    if (!location)
      fail(
        slot === "hand"
          ? "No carried storage space to stow the currently held item"
          : "No room to stow currently equipped item",
      );
    items = items.map((i) =>
      i.id === previous.id ? { ...i, ...location } : i,
    );
  }
  commitItems(ctx, a, items);
}
export function moveItem(
  ctx: Context,
  args: Mutation & {
    itemId: string;
    containerId: string;
    x: number;
    y: number;
    rotated: boolean;
  },
) {
  transaction(
    ctx,
    args,
    "move",
    [args.itemId, args.containerId, args.x, args.y, args.rotated],
    (a) => {
      if (!a.canItem(args.itemId) || !a.canContainer(args.containerId))
        fail("Item or destination is out of reach");
      if (a.bindings.some(b => b.containerId === args.containerId && b.placementId.startsWith("ground:")))
        fail("Use Drop to place an item on the ground");
      const items = a.data.items.map((i) =>
        i.id === args.itemId
          ? {
              ...i,
              containerId: args.containerId,
              equipmentSlot: "",
              x: args.x,
              y: args.y,
              rotated: args.rotated,
            }
          : i,
      );
      commitItems(ctx, a, items);
    },
  );
}
export function equipItem(ctx: Context, args: Mutation & { itemId: string }) {
  transaction(ctx, args, "equip", [args.itemId], (a) =>
    equip(ctx, a, args.itemId),
  );
}
export function assignHotbar(
  ctx: Context,
  args: Mutation & { slot: number; itemId: string },
) {
  transaction(ctx, args, "hotbar-assign", [args.slot, args.itemId], (a) => {
    if (!Number.isInteger(args.slot) || args.slot < 0 || args.slot > 4)
      fail("Hotbar slot must be 0..4");
    if (
      args.itemId &&
      (!a.canItem(args.itemId) ||
        !inventoryDefinition(
          a.data.items.find((i) => i.id === args.itemId)!.definitionId,
        ).equipSlot)
    )
      fail("Hotbar requires an accessible equippable item");
    ctx.db.inventoryHotbar.id.update({
      id: `${a.actor.id}:${args.slot}`,
      characterId: a.actor.id,
      slot: args.slot,
      itemId: args.itemId,
    });
  });
}
export function activateHotbar(
  ctx: Context,
  args: Mutation & { slot: number },
) {
  transaction(ctx, args, "hotbar-activate", [args.slot], (a) => {
    if (!Number.isInteger(args.slot) || args.slot < 0 || args.slot > 4)
      fail("Hotbar slot must be 0..4");
    const itemId = ctx.db.inventoryHotbar.id.find(
      `${a.actor.id}:${args.slot}`,
    )?.itemId;
    if (!itemId) fail("Hotbar slot is empty");
    equip(ctx, a, itemId);
  });
}

/** Idempotent fixture migration: retain the old crate UUID/contents; add only empty storage. */
export function seedStorage(ctx: Context, characterId: string) {
  const actor = ctx.db.character.id.find(characterId);
  if (!actor) return;
  const containers = [
    ...ctx.db.inventoryContainer.by_character.filter(characterId),
  ];
  const legacy = containers.find(
    (c) =>
      c.name === "Storage supply crate" &&
      !c.parentItemId &&
      !c.carried &&
      c.kind === "grid",
  );
  if (!legacy) return; // Starter kit has not been issued; do not mint inventory implicitly.
  let changed = false;
  for (const [index, fixture] of LAB_STORAGE_FIXTURES.entries()) {
    const id = characterId + ":" + fixture.placementId;
    if (ctx.db.storageBinding.id.find(id)) continue;
    let container = legacy;
    if (index !== 0) {
      container = ctx.db.inventoryContainer.insert({
        ...legacy,
        id: ctx.newUuidV4().toString(),
        name: fixture.name,
        width: fixture.width,
        height: fixture.height,
        maxMassKg: fixture.maxMassKg,
        localX: fixture.x,
        localY: fixture.y,
      });
    }
    ctx.db.storageBinding.insert({
      id,
      characterId,
      containerId: container.id,
      placementId: fixture.placementId,
    });
    changed = true;
  }
  const state = ctx.db.inventoryState.characterId.find(characterId);
  if (changed && state)
    ctx.db.inventoryState.characterId.update({
      ...state,
      revision: state.revision + 1n,
    });
}

/** Owner-requested one-time uniform delivery into the four existing ship crates.
 * Stable item/container UUIDs, old placements, nested cargo and equipment survive.
 * This is fixed lab content seeding, not an arbitrary client mint capability. */
export function seedCharacterUniforms(
  ctx: Context,
  characterId: string,
): boolean {
  const issued = ctx.db.characterUniformIssue.characterId.find(characterId);
  const a = ctx.db.character.id.find(characterId);
  if (!a) return false;
  const data = snapshot(ctx, characterId),
    bindings = [...ctx.db.storageBinding.by_character.filter(characterId)];
  const supplies = LAB_STORAGE_FIXTURES.map((f) =>
    data.containers.find(
      (c) =>
        c.id ===
        bindings.find((b) => b.placementId === f.placementId)?.containerId,
    ),
  );
  const pockets = data.containers.find(
    (c) => c.carried && !c.parentItemId && c.kind === "grid",
  );
  if (!pockets || supplies.some((c) => !c)) return false;
  if (issued) {
    const changed = supplies.filter((c) => c!.width < 14 || c!.height < 14);
    for (const c of changed)
      ctx.db.inventoryContainer.id.update({
        ...c!,
        width: Math.max(14, c!.width),
        height: Math.max(14, c!.height),
      });
    const state = ctx.db.inventoryState.characterId.find(characterId);
    if (changed.length && state)
      ctx.db.inventoryState.characterId.update({
        ...state,
        revision: state.revision + 1n,
      });
    return true;
  }
  if (
    data.items.length + CHARACTER_ARMOR_DEFINITIONS.length > 128 ||
    data.containers.length + 10 > 24
  )
    return false;
  const ids = supplies.map((c) => c!.id),
    containers = data.containers.map((c) =>
      ids.includes(c.id)
        ? { ...c, width: Math.max(14, c.width), height: Math.max(14, c.height) }
        : c,
    );
  const old = data.items
    .filter((i) => ids.includes(i.containerId))
    .map((i) => {
      const d = inventoryDefinition(i.definitionId);
      return {
        locker: ids.indexOf(i.containerId),
        x: i.x,
        y: i.y,
        width: i.rotated ? d.height : d.width,
        height: i.rotated ? d.width : d.height,
      };
    });
  const groups: Record<string, number> = {
    captain: 0,
    engineer: 0,
    medic: 0,
    pilot: 1,
    security: 1,
    marine: 1,
    salvage: 2,
    recon: 2,
    scientist: 3,
    mechanic: 3,
    legacy: 3,
  };
  const definitions = CHARACTER_ARMOR_DEFINITIONS.map((d) => ({
    ...d,
    preferredLocker: groups[d.characterComponentId!.split("-")[0]] ?? 3,
  }));
  let plan: ReturnType<typeof packArmorIssue>;
  try {
    plan = packArmorIssue(definitions, 14, 14, 4, old);
  } catch {
    return false;
  }
  const items = [...data.items];
  for (const p of plan.placements) {
    const id = ctx.newUuidV4().toString(),
      d = inventoryDefinition(p.definitionId),
      source = supplies[p.locker]!;
    items.push({
      id,
      characterId,
      definitionId: d.id,
      containerId: source.id,
      equipmentSlot: "",
      x: p.x,
      y: p.y,
      rotated: false,
    });
    if (d.storage)
      containers.push({
        ...source,
        id: ctx.newUuidV4().toString(),
        parentItemId: id,
        name: d.name + " storage",
        width: d.storage.width,
        height: d.storage.height,
        maxMassKg: d.storage.maxMassKg,
      });
  }
  // A full/overweight legacy crate defers the fixed delivery, never prevents
  // entering the ship or partially issues equipment into existing inventory.
  try {
    validateInventory(
      { items, containers },
      INVENTORY_DEFINITIONS,
      LIQUID_DENSITY_KG_PER_LITRE,
      pockets.id,
      CHARACTER_CARRY_LIMIT_KG,
    );
  } catch {
    return false;
  }
  for (const c of containers) {
    const old = data.containers.find((x) => x.id === c.id);
    if (!old) ctx.db.inventoryContainer.insert(c);
    else if (old.width !== c.width || old.height !== c.height)
      ctx.db.inventoryContainer.id.update(c);
  }
  for (const item of items)
    if (!data.items.some((old) => old.id === item.id))
      ctx.db.inventoryItem.insert(item);
  ctx.db.characterUniformIssue.insert({ characterId, version: 1 });
  const state = ctx.db.inventoryState.characterId.find(characterId);
  if (state)
    ctx.db.inventoryState.characterId.update({
      ...state,
      revision: state.revision + 1n,
    });
  return true;
}
export function claimCharacterArmory(ctx: Context, args: Mutation) {
  transaction(ctx, args, "character-uniforms-v1", [], (a) => {
    if (ctx.db.characterUniformIssue.characterId.find(a.actor.id)) return;
    if (
      !a.data.containers.some(
        (c) => !c.parentItemId && !c.carried && a.canContainer(c.id),
      )
    )
      fail("Move within reach of a storage supply crate");
    if (!seedCharacterUniforms(ctx, a.actor.id))
      fail("Make room in the four supply crates before issuing uniforms");
  });
}
