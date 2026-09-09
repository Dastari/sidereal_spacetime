import { firstInventoryPlacement } from "../packages/sim/src/inventory";
import {
  INVENTORY_DEFINITIONS,
  LIQUID_DENSITY_KG_PER_LITRE,
} from "../packages/content/src/inventory";
import { LAB_STORAGE_FIXTURES } from "../packages/content/src/storage-fixtures";
import assert from "node:assert/strict";
import type { DbConnection } from "../packages/net/src/generated";
export async function inventorySmoke(
  a: DbConnection,
  b: DbConnection,
  wait: (fn: () => boolean, message: string) => Promise<void>,
) {
  await assert.rejects(a.reducers.claimStarterKit({}));
  await a.reducers.enterLab({ name: "Inventory Smoke" });
  await a.reducers.claimStarterKit({});
  await b.reducers.claimStarterKit({});
  await wait(
    () => a.db.ownInventoryState.count() === 1n,
    "starter inventory state",
  );
  const state = () => [...a.db.ownInventoryState.iter()][0],
    items = () => [...a.db.ownInventoryItems.iter()],
    containers = () => [...a.db.ownInventoryContainers.iter()];
  const find = (definitionId: string) =>
    items().find((i) => i.definitionId === definitionId)!;
  const original = items()
    .map((i) => i.id)
    .sort();
  assert.equal(original.length, 7);
  assert(Math.abs(state().carriedMassKg - 9.7) < 1e-8);
  await a.reducers.claimStarterKit({});
  assert.deepEqual(
    items()
      .map((i) => i.id)
      .sort(),
    original,
  );
  assert.equal(state().revision, 1n);
  assert(
    !containers().some(
      (c) => c.name.includes("Storage") || c.name.includes("Engineering"),
    ),
    "out-of-range world containers hidden",
  );
  assert(
    containers().every(
      (c) => !("localX" in c) && !("characterId" in c) && !("shipId" in c),
    ),
    "view redacts location and internal actor fields",
  );
  let privateRejected = false;
  a.subscriptionBuilder()
    .onError(() => {
      privateRejected = true;
    })
    .subscribe("SELECT * FROM inventory_item");
  await wait(() => privateRejected, "private inventory table rejected");
  const pistol = find("compact-pistol"),
    carbine = find("carbine"),
    pack = find("field-pack"),
    scanner = find("scanner"),
    cell = find("power-cell"),
    canister = find("resource-canister");
  const packGrid = containers().find((c) => c.parentItemId === pack.id)!,
    reservoir = containers().find((c) => c.parentItemId === canister.id)!;
  assert.equal(reservoir.capacityLitres, 5);
  assert.equal(reservoir.amountLitres, 2);
  await assert.rejects(
    b.reducers.equipInventoryItem({
      itemId: pistol.id,
      expectedRevision: [...b.db.ownInventoryState.iter()][0].revision,
      operationId: "foreign-equip",
    }),
  );
  let operation = 0;
  const mutation = () => ({
    expectedRevision: state().revision,
    operationId: `smoke-inventory-${++operation}`,
  });
  const equipArgs = { ...mutation(), itemId: pistol.id };
  await a.reducers.equipInventoryItem(equipArgs);
  await wait(() => state().revision === 2n, "equipped pistol committed");
  await a.reducers.equipInventoryItem(equipArgs);
  assert.equal(state().revision, 2n);
  await assert.rejects(
    a.reducers.equipInventoryItem({ ...equipArgs, itemId: carbine.id }),
  );
  await assert.rejects(
    a.reducers.equipInventoryItem({
      ...equipArgs,
      operationId: "stale-new-op",
    }),
  );
  await a.reducers.equipInventoryItem({ ...mutation(), itemId: carbine.id });
  await wait(
    () => find("carbine").equipmentSlot === "hand",
    "atomic hand swap",
  );
  assert.equal(find("compact-pistol").containerId, packGrid.id);
  assert.equal(items().filter((i) => i.equipmentSlot === "hand").length, 1);
  const rejectMove = async (
    itemId: string,
    containerId: string,
    x: number,
    y: number,
    rotated = false,
  ) => {
    const before = state().revision;
    await assert.rejects(
      a.reducers.moveInventoryItem({
        ...mutation(),
        itemId,
        containerId,
        x,
        y,
        rotated,
      }),
    );
    assert.equal(state().revision, before);
  };
  await rejectMove(pack.id, packGrid.id, 4, 2); // Fits the free region geometrically; would create a true self-nesting cycle.
  await rejectMove(cell.id, packGrid.id, 99, 0);
  await rejectMove(cell.id, packGrid.id, -1, 0);
  await rejectMove(cell.id, packGrid.id, 4, 0);
  await rejectMove(cell.id, reservoir.id, 0, 0);
  await a.reducers.moveInventoryItem({
    ...mutation(),
    itemId: carbine.id,
    containerId: state().pocketsId,
    x: 0,
    y: 0,
    rotated: true,
  });
  await wait(
    () => find("carbine").containerId === state().pocketsId,
    "rotation fits four-by-two pockets",
  );
  assert.equal(find("carbine").rotated, true);
  await a.reducers.equipInventoryItem({ ...mutation(), itemId: carbine.id });
  // A full source pocket falls back to another carried grid for the displaced hand item.
  await a.reducers.moveInventoryItem({
    ...mutation(),
    itemId: scanner.id,
    containerId: state().pocketsId,
    x: 0,
    y: 0,
    rotated: false,
  });
  await a.reducers.moveInventoryItem({
    ...mutation(),
    itemId: cell.id,
    containerId: state().pocketsId,
    x: 1,
    y: 0,
    rotated: false,
  });
  await a.reducers.equipInventoryItem({ ...mutation(), itemId: scanner.id });
  assert.equal(find("scanner").equipmentSlot, "hand");
  assert.equal(find("carbine").containerId, packGrid.id);
  await a.reducers.equipInventoryItem({ ...mutation(), itemId: carbine.id });
  await a.reducers.moveInventoryItem({
    ...mutation(),
    itemId: scanner.id,
    containerId: packGrid.id,
    x: 4,
    y: 0,
    rotated: false,
  });
  await a.reducers.moveInventoryItem({
    ...mutation(),
    itemId: cell.id,
    containerId: packGrid.id,
    x: 7,
    y: 0,
    rotated: false,
  });
  await a.reducers.assignInventoryHotbar({
    ...mutation(),
    slot: 0,
    itemId: scanner.id,
  });
  await a.reducers.activateInventoryHotbar({ ...mutation(), slot: 0 });
  await wait(
    () => find("scanner").equipmentSlot === "hand",
    "hotbar resolves authoritative instance",
  );
  await assert.rejects(
    a.reducers.assignInventoryHotbar({
      ...mutation(),
      slot: 5,
      itemId: pistol.id,
    }),
  );
  await a.reducers.assignInventoryHotbar({
    ...mutation(),
    slot: 1,
    itemId: "",
  });
  await assert.rejects(
    a.reducers.activateInventoryHotbar({ ...mutation(), slot: 1 }),
  );
  // Reach an actual world container using validated walk intents through its doorway.
  await a.reducers.useStation({});
    await a.reducers.claimInputControl({});
  let sequence = 0n;
  const walk = async (dx: number, dy: number, duration: number) => {
    const end = Date.now() + duration;
    while (Date.now() < end) {
      await a.reducers.setIntent({
        sequence: ++sequence,
        throttle: 0,
        turn: 0,
        dx,
        dy,
        sprint: false,
      });
      await new Promise((r) => setTimeout(r, 100));
    }
    await a.reducers.setIntent({
      sequence: ++sequence,
      throttle: 0,
      turn: 0,
      dx: 0,
      dy: 0,
      sprint: false,
    });
  };
  const approach = async (x: number, y: number) => {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const actor = [...a.db.ownCharacters.iter()][0];
      const dx = x - actor.localX,
        dy = y - actor.localY,
        length = Math.hypot(dx, dy);
      if (length < 0.09) {
        await walk(0, 0, 0);
        return;
      }
      await a.reducers.setIntent({
        sequence: ++sequence,
        throttle: 0,
        turn: 0,
        dx: dx / Math.max(1, length),
        dy: dy / Math.max(1, length),
        sprint: false,
      });
      await new Promise((resolve) => setTimeout(resolve, 70));
    }
    throw new Error("Storage approach timed out");
  };
  await approach(0, 3);
  await approach(-2.4, 3);
  await approach(-2.5, 2.75);
  await wait(
    () => containers().some((c) => c.name === "Storage supply crate"),
    "nearby storage crate discovered by authority",
  );
  const crate = containers().find((c) => c.name === "Storage supply crate")!,
    rifle = find("long-rifle");
  assert(rifle);
  await wait(
    () => containers().filter((c) => c.placementId).length === 4,
    "four actual storage placement bindings visible",
  );
  assert.equal(crate.placementId, LAB_STORAGE_FIXTURES[0].placementId);
  const storageRows = containers().filter((c) => c.placementId);
  const storedIds = storageRows.map((c) => c.id).sort(),
    beforeKitAgain = state().revision;
  await a.reducers.claimStarterKit({});
  assert.deepEqual(
    containers()
      .filter((c) => c.placementId)
      .map((c) => c.id)
      .sort(),
    storedIds,
  );
  assert.equal(state().revision, beforeKitAgain);
  const otherCrate = storageRows.find((c) => c.id !== crate.id)!;
  assert(
    storageRows.every((c) =>
      items().some(
        (i) => i.containerId === c.id && i.definitionId.startsWith("crew-"),
      ),
    ),
    "all four existing crates contain uniform pieces",
  );
  const freeStorage = (itemId: string, containerId: string) => {
    const found = firstInventoryPlacement(
      { items: items(), containers: containers() },
      INVENTORY_DEFINITIONS,
      LIQUID_DENSITY_KG_PER_LITRE,
      state().pocketsId,
      32,
      itemId,
      containerId,
    );
    assert(found, "legal storage position");
    return found;
  };
  const scannerBefore = { ...find("scanner") };
  await a.reducers.moveInventoryItem({
    ...mutation(),
    itemId: scanner.id,
    ...freeStorage(scanner.id, otherCrate.id),
  });
  assert.equal(find("scanner").containerId, otherCrate.id);
  if (scannerBefore.equipmentSlot)
    await a.reducers.equipInventoryItem({ ...mutation(), itemId: scanner.id });
  else
    await a.reducers.moveInventoryItem({
      ...mutation(),
      itemId: scanner.id,
      containerId: scannerBefore.containerId,
      x: scannerBefore.x,
      y: scannerBefore.y,
      rotated: scannerBefore.rotated,
    });

  // Taking a weapon from world storage must never silently leave the old hand item there.
  await a.reducers.equipInventoryItem({ ...mutation(), itemId: pistol.id });
  await a.reducers.equipInventoryItem({ ...mutation(), itemId: rifle.id });
  assert.equal(find("compact-pistol").id, pistol.id);
  assert(
    containers().find((c) => c.id === find("compact-pistol").containerId)
      ?.carried,
  );
  // Without the pack, the long rifle fits no carried grid. Reject the swap atomically.
  await a.reducers.moveInventoryItem({
    ...mutation(),
    itemId: pack.id,
    ...storageRows
      .map((c) =>
        firstInventoryPlacement(
          { items: items(), containers: containers() },
          INVENTORY_DEFINITIONS,
          LIQUID_DENSITY_KG_PER_LITRE,
          state().pocketsId,
          32,
          pack.id,
          c.id,
        ),
      )
      .find((p) => p !== undefined)!,
  });
  const beforeNoFit = state().revision;
  const beforeNoFitItems = JSON.stringify(items());
  await assert.rejects(
    a.reducers.equipInventoryItem({
      ...mutation(),
      itemId: find("heavy-handgun").id,
    }),
  );
  assert.equal(state().revision, beforeNoFit);
  assert.equal(JSON.stringify(items()), beforeNoFitItems);
  await a.reducers.equipInventoryItem({ ...mutation(), itemId: pack.id });
  await a.reducers.moveInventoryItem({
    ...mutation(),
    itemId: rifle.id,
    containerId: crate.id,
    x: 0,
    y: 0,
    rotated: false,
  });
  await a.reducers.equipInventoryItem({ ...mutation(), itemId: scanner.id });
  await a.reducers.assignInventoryHotbar({
    ...mutation(),
    slot: 2,
    itemId: rifle.id,
  });
  const retainedPistol = { ...find("compact-pistol") };
  await a.reducers.moveInventoryItem({
    ...mutation(),
    itemId: pistol.id,
    ...freeStorage(pistol.id, crate.id),
  });
  await wait(
    () => find("compact-pistol").containerId === crate.id,
    "actual transfer into nearby crate",
  );
  assert(Math.abs(state().carriedMassKg - 8.6) < 1e-8);
  await walk(1, 0, 800);
  await wait(
    () => !containers().some((c) => c.id === crate.id),
    "container access revoked on range loss",
  );
  assert(!items().some((i) => i.id === rifle.id || i.id === pistol.id));
  await rejectMove(rifle.id, packGrid.id, 2, 0);
  await assert.rejects(
    a.reducers.activateInventoryHotbar({ ...mutation(), slot: 2 }),
  );
  assert.equal(
    [...a.db.ownInventoryHotbar.iter()].find((h) => h.slot === 2)!.itemId,
    "",
  );
  // Retries remain exactly once even after capacity128 receipt eviction.
  const oldest = { ...mutation(), slot: 4, itemId: "" };
  await a.reducers.assignInventoryHotbar(oldest);
  for (let i = 0; i < 129; i++)
    await a.reducers.assignInventoryHotbar({
      ...mutation(),
      slot: 4,
      itemId: "",
    });
  await assert.rejects(a.reducers.assignInventoryHotbar(oldest));
  await approach(-2.5, 2.75);
  await wait(
    () => containers().some((c) => c.id === crate.id),
    "explicitly stored pistol becomes reachable again",
  );
  assert.equal(find("compact-pistol").id, pistol.id);
  await a.reducers.moveInventoryItem({
    ...mutation(),
    itemId: pistol.id,
    containerId: retainedPistol.containerId,
    x: retainedPistol.x,
    y: retainedPistol.y,
    rotated: retainedPistol.rotated,
  });
  // Store all uses one expected revision and keeps carried/equipped UUIDs intact.
  const storeBefore = items().filter(i => i.containerId === packGrid.id).map(i => ({...i}));
  const storeCommand = {...mutation(), containerId:packGrid.id, destinationId:crate.id};
  await a.reducers.storeAllInventoryItems(storeCommand);
  const storeRevision=state().revision;
  await a.reducers.storeAllInventoryItems(storeCommand);
  assert.equal(state().revision,storeRevision,"store-all retry is exactly once");
  const stored=storeBefore.filter(i=>items().find(x=>x.id===i.id)?.containerId===crate.id);
  assert(stored.length>0,"store all transfers fitting carried items");
  assert.equal(items().find(i=>i.id===pack.id)?.equipmentSlot,"back","store all retains worn backpack");
  await assert.rejects(b.reducers.storeAllInventoryItems({containerId:packGrid.id,destinationId:crate.id,expectedRevision:[...b.db.ownInventoryState.iter()][0].revision,operationId:"foreign-store-all"}));
  for(const i of stored)await a.reducers.moveInventoryItem({...mutation(),itemId:i.id,containerId:i.containerId,x:i.x,y:i.y,rotated:i.rotated});
  // Ground loot uses server-derived positions, persistent UUIDs and ordinary access.
  const dropBefore = {...find("scanner")};
  const dropCommand = {...mutation(),itemId:scanner.id};
  await a.reducers.dropInventoryItem(dropCommand);
  await wait(()=>[...a.db.ownGroundItems.iter()].some(i=>i.id===scanner.id),"dropped scanner projection");
  const dropRevision=state().revision;
  await a.reducers.dropInventoryItem(dropCommand);
  assert.equal(state().revision,dropRevision,"drop retry is exactly once");
  assert(![...b.db.ownGroundItems.iter()].some(i=>i.id===scanner.id),"foreign ground loot is private");
  const dropped=[...a.db.ownGroundItems.iter()].find(i=>i.id===scanner.id)!;
  const character=[...a.db.ownCharacters.iter()][0];
  assert.equal(dropped.localX,character.localX);assert.equal(dropped.localY,character.localY);
  assert(!("characterId" in dropped)&&!("shipId" in dropped),"ground projection redacts internal ownership");
  await assert.rejects(b.reducers.transferInventoryItem({itemId:scanner.id,containerId:"",expectedRevision:[...b.db.ownInventoryState.iter()][0].revision,operationId:"foreign-ground-pickup"}));
  await a.reducers.transferInventoryItem({...mutation(),itemId:scanner.id,containerId:""});
  await wait(()=>![...a.db.ownGroundItems.iter()].some(i=>i.id===scanner.id),"ground wrapper removed after pickup");
  assert.equal(find("scanner").containerId,packGrid.id,"quick pickup prefers backpack");
  if(dropBefore.equipmentSlot)await a.reducers.equipInventoryItem({...mutation(),itemId:scanner.id});
  return {
    itemId: scanner.id,
    packId: pack.id,
    pistolId: pistol.id,
    revision: state().revision.toString(),
  };
}
