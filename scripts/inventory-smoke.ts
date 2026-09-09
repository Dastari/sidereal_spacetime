import { firstInventoryPlacement } from "../packages/sim/src/inventory";
import {
  INVENTORY_DEFINITIONS,
  LIQUID_DENSITY_KG_PER_LITRE,
} from "../packages/content/src/inventory";
import { walkNative } from "./native-starter-smoke";
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
  assert.equal(
    containers().length,
    3,
    "native kit replay retains exactly three personal containers",
  );
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
  // Native starters own empty instance containers. Personal inventory remains
  // private; scoped transfers validate both container revisions and item identity.
  await a.reducers.claimInputControl({});
  for (const [x, y] of [
    [-2, -1.5],
    [0, -1.5],
    [0, 3],
    [-2.4, 3],
    [-3.5, 2.75],
  ])
    await walkNative(a, x!, y!);
  const cargo = () => [...a.db.ownReachableCargoContainers.iter()];
  const cargoItems = () => [...a.db.ownReachableCargoItems.iter()];
  const revisions = () => [...a.db.ownCarriedInventoryRevisions.iter()];
  const revision = (id: string) =>
    revisions().find((r) => r.id === id)?.revision ??
    cargo().find((r) => r.id === id)?.revision ??
    cargoItems().find((r) => r.id === id)?.revision;
  await wait(
    () => cargo().filter((c) => c.placedObjectId).length === 4,
    "four native cargo containers reachable",
  );
  const roots = cargo().filter((c) => c.placedObjectId);
  assert.equal(cargoItems().length, 0, "new authored containers start empty");
  assert.equal(
    new Set(roots.map((c) => c.id)).size,
    4,
    "four independent container UUIDs",
  );
  assert(
    roots.every((c) => c.id !== c.placedObjectId),
    "inventory and placed-object identities remain distinct",
  );
  const crate = roots[0]!;
  const originalPistol = { ...find("compact-pistol") };
  const transferCommand = (
    itemId: string,
    destinationContainerId: string,
    x: number,
    y: number,
    rotated = false,
  ) => {
    const item =
      items().find((i) => i.id === itemId) ??
      cargoItems().find((i) => i.id === itemId);
    assert(item, "visible transfer source");
    return {
      operationId: crypto.randomUUID(),
      itemId,
      sourceContainerId: item.containerId,
      destinationContainerId,
      x,
      y,
      rotated,
      expectedItemRevision: revision(itemId)!,
      expectedSourceRevision: revision(item.containerId)!,
      expectedDestinationRevision: revision(destinationContainerId)!,
      expectedCharacterRevision: state().revision,
    };
  };
  const restorePistol = async () => {
    await a.reducers.transferScopedCargoItem(
      transferCommand(
        pistol.id,
        originalPistol.containerId,
        originalPistol.x,
        originalPistol.y,
        originalPistol.rotated,
      ),
    );
    await wait(
      () => items().some((i) => i.id === pistol.id),
      "same pistol withdrawn to personal grid",
    );
    assert.deepEqual(find("compact-pistol"), originalPistol);
  };
  for (const root of roots) {
    const command = transferCommand(pistol.id, root.id, 0, 0);
    await assert.rejects(b.reducers.transferScopedCargoItem(command));
    await a.reducers.transferScopedCargoItem(command);
    await wait(
      () =>
        cargoItems().some(
          (i) => i.id === pistol.id && i.containerId === root.id,
        ),
      "pistol stored in actual native container",
    );
    assert(
      !items().some((i) => i.id === pistol.id),
      "stored item leaves carried projection",
    );
    const after = revision(root.id);
    await a.reducers.transferScopedCargoItem(command);
    assert.equal(
      revision(root.id),
      after,
      "scoped transfer retry is exactly once",
    );
    await assert.rejects(
      a.reducers.moveInventoryItem({
        ...mutation(),
        itemId: pistol.id,
        containerId: originalPistol.containerId,
        x: originalPistol.x,
        y: originalPistol.y,
        rotated: originalPistol.rotated,
      }),
    );
    await restorePistol();
  }
  // A stored weapon cannot be equipped through the legacy private reducer. The
  // deliberate take-then-equip sequence must preserve the displaced hand item.
  await a.reducers.transferScopedCargoItem(
    transferCommand(pistol.id, crate.id, 0, 0),
  );
  await assert.rejects(
    a.reducers.equipInventoryItem({ ...mutation(), itemId: pistol.id }),
  );
  await restorePistol();
  await a.reducers.equipInventoryItem({ ...mutation(), itemId: pistol.id });
  await a.reducers.equipInventoryItem({ ...mutation(), itemId: carbine.id });
  assert.equal(find("compact-pistol").id, pistol.id);
  assert(
    containers().find((c) => c.id === find("compact-pistol").containerId)
      ?.carried,
  );
  // Capture an otherwise-valid withdrawal before walking away: reach loss must
  // deny it and remove both container metadata and its contents from this client.
  const beforeRangePistol = { ...find("compact-pistol") };
  await a.reducers.transferScopedCargoItem(
    transferCommand(pistol.id, crate.id, 0, 0),
  );
  const withdrawal = transferCommand(
    pistol.id,
    beforeRangePistol.containerId,
    beforeRangePistol.x,
    beforeRangePistol.y,
    beforeRangePistol.rotated,
  );
  for (const [x, y] of [
    [-2.4, 3],
    [0, 3],
    [0, -1.5],
  ])
    await walkNative(a, x!, y!);
  await wait(
    () => !cargo().some((c) => c.id === crate.id),
    "range loss revokes native cargo discovery",
  );
  assert(!cargoItems().some((i) => i.id === pistol.id));
  await assert.rejects(a.reducers.transferScopedCargoItem(withdrawal));
  // Personal operation IDs stay single-use even after bounded receipt eviction.
  const oldest = { ...mutation(), slot: 4, itemId: "" };
  await a.reducers.assignInventoryHotbar(oldest);
  for (let i = 0; i < 129; i++)
    await a.reducers.assignInventoryHotbar({
      ...mutation(),
      slot: 4,
      itemId: "",
    });
  await assert.rejects(a.reducers.assignInventoryHotbar(oldest));
  for (const [x, y] of [
    [0, 3],
    [-2.4, 3],
    [-3.5, 2.75],
  ])
    await walkNative(a, x!, y!);
  await wait(
    () => cargo().some((c) => c.id === crate.id),
    "native cargo rediscovered",
  );
  await a.reducers.transferScopedCargoItem(
    transferCommand(
      pistol.id,
      beforeRangePistol.containerId,
      beforeRangePistol.x,
      beforeRangePistol.y,
      beforeRangePistol.rotated,
    ),
  );
  // Bulk UI is intentionally serial: each item receives fresh revisions and an
  // explicit operation ID, with completed UUIDs restored even between operations.
  const storedBefore = items()
    .filter((i) => i.containerId === packGrid.id)
    .map((i) => ({ ...i }));
  const placed: typeof storedBefore = [];
  for (const item of storedBefore) {
    const fit = firstInventoryPlacement(
      {
        items: [
          ...items(),
          ...cargoItems().map((i) => ({ ...i, equipmentSlot: "" })),
        ],
        containers: [
          ...containers(),
          ...cargo().map((c) => ({
            ...c,
            carried: false,
            placementId: c.placedObjectId,
          })),
        ],
      },
      INVENTORY_DEFINITIONS,
      LIQUID_DENSITY_KG_PER_LITRE,
      state().pocketsId,
      32,
      item.id,
      crate.id,
    );
    if (!fit) continue;
    await a.reducers.transferScopedCargoItem(
      transferCommand(item.id, crate.id, fit.x, fit.y, fit.rotated),
    );
    placed.push(item);
  }
  assert(placed.length > 0, "serial bulk stores fitting carried items");
  assert.equal(
    find("field-pack").equipmentSlot,
    "back",
    "bulk preserves worn pack",
  );
  for (const item of placed)
    await a.reducers.transferScopedCargoItem(
      transferCommand(item.id, item.containerId, item.x, item.y, item.rotated),
    );
  assert.deepEqual(
    items()
      .map((i) => i.id)
      .sort(),
    original,
    "all seven starter UUIDs survive scoped storage",
  );
  // Ground loot uses server-derived positions, persistent UUIDs and ordinary access.
  const dropCommand = { ...mutation(), itemId: scanner.id };
  await a.reducers.dropInventoryItem(dropCommand);
  await wait(
    () => [...a.db.ownGroundItems.iter()].some((i) => i.id === scanner.id),
    "dropped scanner projection",
  );
  const dropRevision = state().revision;
  await a.reducers.dropInventoryItem(dropCommand);
  assert.equal(state().revision, dropRevision, "drop retry is exactly once");
  assert(
    ![...b.db.ownGroundItems.iter()].some((i) => i.id === scanner.id),
    "foreign ground loot is private",
  );
  const dropped = [...a.db.ownGroundItems.iter()].find(
    (i) => i.id === scanner.id,
  )!;
  const character = [...a.db.ownCharacters.iter()][0];
  assert.equal(dropped.localX, character.localX);
  assert.equal(dropped.localY, character.localY);
  assert(
    !("characterId" in dropped) && !("shipId" in dropped),
    "ground projection redacts internal ownership",
  );
  await assert.rejects(
    b.reducers.transferInventoryItem({
      itemId: scanner.id,
      containerId: "",
      expectedRevision: [...b.db.ownInventoryState.iter()][0].revision,
      operationId: "foreign-ground-pickup",
    }),
  );
  await a.reducers.transferInventoryItem({
    ...mutation(),
    itemId: scanner.id,
    containerId: "",
  });
  await wait(
    () => ![...a.db.ownGroundItems.iter()].some((i) => i.id === scanner.id),
    "ground wrapper removed after pickup",
  );
  assert.equal(
    find("scanner").containerId,
    packGrid.id,
    "quick pickup prefers backpack",
  );
  // Pin the final equipped item explicitly for the reconnect evidence contract.
  await a.reducers.equipInventoryItem({ ...mutation(), itemId: scanner.id });
  return {
    itemId: scanner.id,
    packId: pack.id,
    pistolId: pistol.id,
    revision: state().revision.toString(),
  };
}
