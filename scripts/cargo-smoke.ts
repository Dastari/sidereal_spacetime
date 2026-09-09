/** Real provider + normal reducer cargo journey. No connection or grants on import. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { tables, type DbConnection } from "../packages/net/src/generated";
import {
  traversalWait as wait,
  traversalIntentSender,
  walkTraversalActor,
  enterTraversalReview,
  leaveTraversalReview,
} from "./traversal-smoke";

export async function subscribeCargoSmoke(c: DbConnection) {
  return new Promise<{ unsubscribe(): void }>((resolve, reject) => {
    const h = c
      .subscriptionBuilder()
      .onApplied(() => resolve(h))
      .onError(() => reject(Error("Cargo subscription denied")))
      .subscribe([
        tables.ownReachableCargoContainers,
        tables.ownReachableCargoItems,
        tables.ownCarriedInventoryRevisions,
      ]);
  });
}
const actor = (c: DbConnection) => [...c.db.ownCharacters.iter()][0]!;
const state = (c: DbConnection) => [...c.db.ownInventoryState.iter()][0]!;
const revision = (c: DbConnection, id: string) =>
  [...c.db.ownCarriedInventoryRevisions.iter()].find((r) => r.id === id)
    ?.revision;
const cargo = (c: DbConnection, id: string) =>
  [...c.db.ownReachableCargoContainers.iter()].find((r) => r.id === id)!;
const pause = () => new Promise((r) => setTimeout(r, 80));
async function denied(action: () => Promise<unknown>) {
  let failed = false;
  try {
    await action();
  } catch {
    failed = true;
  }
  assert(failed, "Authority must deny invalid cargo action");
}
export async function cargoAuthorityJourney(
  c: DbConnection,
  instanceIds: readonly string[],
  route: readonly (readonly [number, number])[],
) {
  assert.equal(instanceIds.length, 2);
  const ownerId = actor(c).id,
    item = [...c.db.ownInventoryItems.iter()].find(
      (i) => i.definitionId === "compact-pistol",
    )!;
  assert(item && !item.equipmentSlot, "Carried starter pistol is required");
  const original = { ...item },
    allContainerIds = new Set<string>(),
    journeys: unknown[] = [];
  let previousInstanceContainer: string | undefined;
  for (const instanceId of instanceIds) {
    await enterTraversalReview(c, instanceId);
    const send = traversalIntentSender(c);
    for (const [x, y] of route) await walkTraversalActor(c, x, y, send);
    await wait(
      () =>
        [...c.db.ownReachableCargoContainers.iter()].filter(
          (r) => r.placedObjectId,
        ).length === 4,
      "Four native cargo access points",
    );
    const roots = [...c.db.ownReachableCargoContainers.iter()].filter(
      (r) => r.placedObjectId,
    );
    assert.equal(
      [...c.db.ownReachableCargoItems.iter()].length,
      0,
      "Each new ship starts with empty cargo",
    );
    for (const root of roots) {
      assert(
        !allContainerIds.has(root.id),
        "Instances must not reuse containers",
      );
      allContainerIds.add(root.id);
    }
    let transfers = 0;
    const crossInstanceDeniedChecks = previousInstanceContainer
      ? roots.length
      : 0;
    for (const root of roots) {
      const command = {
        operationId: randomUUID(),
        itemId: item.id,
        expectedItemRevision: revision(c, item.id)!,
        sourceContainerId: original.containerId,
        expectedSourceRevision: revision(c, original.containerId)!,
        destinationContainerId: root.id,
        expectedDestinationRevision: cargo(c, root.id).revision,
        expectedCharacterRevision: state(c).revision,
        x: 0,
        y: 0,
        rotated: false,
      };
      if (previousInstanceContainer)
        await denied(() =>
          c.reducers.transferScopedCargoItem({
            ...command,
            operationId: randomUUID(),
            destinationContainerId: previousInstanceContainer!,
          }),
        );
      await c.reducers.transferScopedCargoItem(command);
      await wait(
        () =>
          [...c.db.ownReachableCargoItems.iter()].some(
            (i) => i.id === item.id && i.containerId === root.id,
          ),
        "Pistol stored in exact instance",
      );
      assert(
        ![...c.db.ownInventoryItems.iter()].some((i) => i.id === item.id),
        "Old personal lookup must remove stored item",
      );
      const afterRevision = cargo(c, root.id).revision;
      await c.reducers.transferScopedCargoItem(command);
      await pause();
      assert.equal(
        cargo(c, root.id).revision,
        afterRevision,
        "Replay cannot rewrite storage",
      );
      await denied(() =>
        c.reducers.moveInventoryItem({
          operationId: randomUUID(),
          itemId: item.id,
          containerId: original.containerId,
          expectedRevision: state(c).revision,
          x: original.x,
          y: original.y,
          rotated: original.rotated,
        }),
      );
      const current = [...c.db.ownReachableCargoItems.iter()].find(
        (i) => i.id === item.id,
      )!;
      await c.reducers.transferScopedCargoItem({
        operationId: randomUUID(),
        itemId: item.id,
        expectedItemRevision: current.revision,
        sourceContainerId: root.id,
        expectedSourceRevision: cargo(c, root.id).revision,
        destinationContainerId: original.containerId,
        expectedDestinationRevision: revision(c, original.containerId)!,
        expectedCharacterRevision: state(c).revision,
        x: original.x,
        y: original.y,
        rotated: original.rotated,
      });
      await wait(
        () => [...c.db.ownInventoryItems.iter()].some((i) => i.id === item.id),
        "Same pistol withdrawn",
      );
      assert.deepEqual(
        [...c.db.ownInventoryItems.iter()].find((i) => i.id === item.id),
        original,
      );
      transfers++;
    }
    previousInstanceContainer = roots[0].id;
    // Natural range/LOS removal while retracing the same valid floor route.
    for (const [x, y] of [...route].reverse())
      await walkTraversalActor(c, x, y, send);
    await wait(
      () => [...c.db.ownReachableCargoContainers.iter()].length === 0,
      "Cargo disappears after leaving reach",
    );
    await leaveTraversalReview(c);
    assert.equal(actor(c).id, ownerId);
    journeys.push({
      instanceId,
      containerIds: roots.map((r) => r.id),
      fourEmptyIndependentRoots: true,
      transfers,
      samePistolUUID: item.id,
      replayNoWrites: true,
      oldReducerDenied: true,
      crossInstanceDeniedChecks,
      rangeRevokesContents: true,
    });
  }
  assert.equal(allContainerIds.size, 8);
  return {
    actorId: ownerId,
    itemId: item.id,
    journeys,
    independentContainerCount: allContainerIds.size,
  };
}

export async function cargoPrivateBaseDenials(c: DbConnection) {
  const names = ["inventory_container_scope", "inventory_item_membership", "instance_inventory_binding", "scoped_inventory_receipt"];
  for (const name of names) {
    await new Promise<void>((resolve, reject) => {
      let h: { unsubscribe(): void } | undefined;
      const timer = setTimeout(() => { h?.unsubscribe(); reject(Error("Private cargo denial timeout")); }, 5000);
      h = c.subscriptionBuilder().onApplied(() => { clearTimeout(timer); h?.unsubscribe(); reject(Error("Private cargo table exposed: " + name)); })
        .onError(() => { clearTimeout(timer); resolve(); }).subscribe("SELECT * FROM " + name);
    });
  }
  return names;
}
