import assert from "node:assert/strict";
import type { DbConnection } from "../packages/net/src/generated";

/** Uses only the normal starter's owned items and normal intent reducers. */
export async function backpackSmoke(
  a: DbConnection,
  b: DbConnection,
  wait: (fn: () => boolean, message: string) => Promise<void>,
) {
  const state = () => [...a.db.ownInventoryState.iter()][0];
  const items = () => [...a.db.ownInventoryItems.iter()];
  const pack = items().find((i) => i.equipmentSlot === "back")!;
  const packGrid = [...a.db.ownInventoryContainers.iter()].find(
    (c) => c.parentItemId === pack.id,
  )!;
  const originalIds = items()
    .map((i) => i.id)
    .sort();
  let sequence = 0;
  const mutation = () => ({
    expectedRevision: state().revision,
    operationId: `backpack-smoke-${++sequence}`,
  });
  for (const item of items().filter((i) => i.containerId === state().pocketsId))
    await a.reducers.transferInventoryItem({
      ...mutation(),
      itemId: item.id,
      containerId: packGrid.id,
    });
  for (const [definitionId, x] of [
    ["compact-pistol", 0],
    ["medkit", 2],
  ] as const) {
    const item = items().find((i) => i.definitionId === definitionId)!;
    await a.reducers.moveInventoryItem({
      ...mutation(),
      itemId: item.id,
      containerId: state().pocketsId,
      x,
      y: 0,
      rotated: false,
    });
  }
  const nested = [...a.db.ownInventoryContainers.iter()].filter(
    (c) => c.kind === "liquid",
  );
  const contents = items().filter((i) => i.containerId === packGrid.id);
  await a.reducers.dropInventoryItem({ ...mutation(), itemId: pack.id });
  await wait(
    () => [...a.db.ownGroundItems.iter()].some((i) => i.id === pack.id),
    "backpack ground projection",
  );
  const ground = [...a.db.ownGroundItems.iter()].find((i) => i.id === pack.id)!;
  const visit = [...a.db.ownConstructionLocation.iter()][0]!;
  assert(
    visit,
    "drop smoke exercises accepted native construction, not the legacy lab",
  );
  assert.equal(
    ground.instanceId,
    visit.instanceId,
    "ground row uses the accepted native instance",
  );
  assert.equal(
    ground.deckId,
    visit.deckId,
    "ground row uses the accepted native deck",
  );
  assert(
    Math.abs(ground.elevationM - visit.standingElevationM) < 1e-8,
    "ground row uses the actual supported drop height",
  );
  assert(
    ground.reachable,
    "same-position native drop is immediately reachable",
  );
  assert(
    ![...b.db.ownGroundItems.iter()].some((i) => i.id === pack.id),
    "another character cannot discover the private ground wrapper",
  );
  assert(!items().some((i) => i.equipmentSlot === "back"));
  const revision = state().revision;
  await assert.rejects(
    a.reducers.transferInventoryItem({
      ...mutation(),
      itemId: pack.id,
      containerId: state().pocketsId,
    }),
    "ordinary container placement still requires the backpack's full rectangle",
  );
  await assert.rejects(
    b.reducers.equipInventoryItem({
      itemId: pack.id,
      expectedRevision: [...b.db.ownInventoryState.iter()][0].revision,
      operationId: "foreign-backpack-equip",
    }),
  );
  assert.equal(state().revision, revision);
  const command = { ...mutation(), itemId: pack.id, containerId: "" };
  await a.reducers.transferInventoryItem(command);
  await wait(
    () => items().some((i) => i.id === pack.id && i.equipmentSlot === "back"),
    "full-pocket pickup equips backpack directly",
  );
  await a.reducers.transferInventoryItem(command);
  assert.equal(
    state().revision,
    revision + 1n,
    "backpack pickup retry consumes exactly one revision",
  );
  assert.deepEqual(
    items()
      .map((i) => i.id)
      .sort(),
    originalIds,
    "pickup preserves every item UUID",
  );
  assert.deepEqual(
    items().filter((i) => i.containerId === packGrid.id),
    contents,
    "pack contents keep their coordinates and UUIDs",
  );
  assert.deepEqual(
    [...a.db.ownInventoryContainers.iter()].filter((c) => c.kind === "liquid"),
    nested,
    "nested reservoir identity and fuel survive the drop/pickup",
  );
  assert(
    ![...a.db.ownGroundItems.iter()].some((i) => i.id === pack.id),
    "empty source wrapper is cleaned up",
  );
  return {
    nativeGround: {
      instanceId: ground.instanceId,
      deckId: ground.deckId,
      elevationM: ground.elevationM,
      reachable: ground.reachable,
    },
    fullPockets: true,
    directlyEquipped: true,
    retryExactlyOnce: true,
    itemCount: originalIds.length,
    revision: state().revision.toString(),
  };
}
