import assert from "node:assert/strict";
import { DbConnection, tables } from "../packages/net/src/generated";
import { createNativeStairRoomDocument } from "@sidereal/sim/construction-stairs-document";
import {
  traversalWait as wait,
  traversalIntentSender,
  walkTraversalActor,
  enterTraversalReview,
  leaveTraversalReview,
  traversalInventorySnapshot,
  requireTraversalInventoryUnchanged,
} from "./traversal-smoke";

/** Helpers only: caller owns isolated database, real provider admission and cleanup. */
export async function subscribeStairs(c: DbConnection) {
  return await new Promise<
    ReturnType<ReturnType<DbConnection["subscriptionBuilder"]>["subscribe"]>
  >((resolve, reject) => {
    const handle = c
      .subscriptionBuilder()
      .onApplied(() => resolve(handle))
      .onError((e) => reject(Error(String(e.event))))
      .subscribe([
        tables.ownCharacters,
        tables.ownStations,
        tables.ownAppearance,
        tables.ownInventoryState,
        tables.ownInventoryItems,
        tables.ownInventoryContainers,
        tables.ownInventoryHotbar,
        tables.ownConstructionGrants,
        tables.ownConstructionDrafts,
        tables.ownConstructionBlueprints,
        tables.ownConstructionInstances,
        tables.ownConstructionDecks,
        tables.ownConstructionLocation,
        tables.ownConstructionStairWalks,
        tables.ownConstructionStairEgressGeometry,
      ]);
  });
}
export async function stairPrivateBaseDenials(c: DbConnection) {
  for (const name of [
    "construction_stair_link",
    "construction_stair_walk",
    "construction_stair_reservation",
    "construction_stair_audit",
  ]) {
    let rejected = false;
    c.subscriptionBuilder()
      .onError(() => {
        rejected = true;
      })
      .subscribe("SELECT * FROM " + name);
    await wait(() => rejected, "private stair base denied: " + name);
    // Rejected subscription handles are already closed by the server.
  }
}
const actor = (c: DbConnection) => [...c.db.ownCharacters.iter()][0]!;
const visit = (c: DbConnection) => [...c.db.ownConstructionLocation.iter()][0];
const active = (c: DbConnection) =>
  [...c.db.ownConstructionStairWalks.iter()][0];
const pause = () => new Promise((resolve) => setTimeout(resolve, 60));
export async function publishStairFixture(
  c: DbConnection,
  workspaceId: string,
) {
  assert(c.identity);
  const d = createNativeStairRoomDocument();
  for (const capability of [
    "draft.read",
    "draft.write",
    "blueprint.publish",
    "instance.spawn",
  ]) {
    await c.reducers.setConstructionGrant({
      principal: c.identity.toHexString(),
      workspaceId,
      capability,
      revoked: false,
      expiresMicros: BigInt(Date.now() + 3600000) * 1000n,
      expectedRevision: 0n,
      operationId: crypto.randomUUID(),
    });
  }
  const draftId = workspaceId + ":draft";
  await c.reducers.saveConstructionDraft({
    workspaceId,
    draftId,
    documentJson: JSON.stringify(d),
    expectedRevision: 0n,
    operationId: crypto.randomUUID(),
  });
  await wait(
    () =>
      !![...c.db.ownConstructionDrafts.iter()].find((p) => p.id === draftId),
    "stair draft",
  );
  await c.reducers.publishConstructionBlueprint({
    workspaceId,
    draftId,
    expectedRevision: 1n,
    operationId: crypto.randomUUID(),
  });
  await wait(
    () =>
      !![...c.db.ownConstructionBlueprints.iter()].find(
        (p) => p.draftId === draftId,
      ),
    "stair blueprint",
  );
  const b = [...c.db.ownConstructionBlueprints.iter()].find(
    (p) => p.draftId === draftId,
  )!;
  for (let n = 1; n <= 2; n++) {
    await c.reducers.spawnConstructionBlueprint({
      blueprintId: b.id,
      expectedSha256: b.sha256,
      sourceDeckId: d.stairRoom.lowerDeckId,
      operationId: crypto.randomUUID(),
    });
    await wait(
      () =>
        [...c.db.ownConstructionInstances.iter()].filter(
          (p) => p.workspaceId === workspaceId,
        ).length === n,
      "independent stair spawn",
    );
  }
  const instances = [...c.db.ownConstructionInstances.iter()].filter(
    (p) => p.workspaceId === workspaceId,
  );
  const ids = instances.flatMap((i) => {
    const d = JSON.parse(i.documentJson) as ReturnType<
      typeof createNativeStairRoomDocument
    >;
    return [
      i.id,
      ...d.layout.decks.map((p) => p.id),
      d.stairRoom.stairId,
      ...d.stairRoom.parts.map((p) => p.id),
      ...d.stairRoom.supports.map((p) => p.id),
    ];
  });
  assert.equal(new Set(ids).size, ids.length);
  return instances;
}
export async function driveStair(c: DbConnection, direction: "up" | "down") {
  const send = traversalIntentSender(c),
    samples: unknown[] = [];
  const startDeck = visit(c)!.deckId;
  const run = async (
    done: () => boolean,
    dx: number,
    dy: number,
    label: string,
  ) => {
    const deadline = Date.now() + 15000;
    while (!done()) {
      assert(
        Date.now() < deadline,
        label +
          " timeout: " +
          JSON.stringify(active(c), (_, v) =>
            typeof v === "bigint" ? String(v) : v,
          ),
      );
      const row = active(c);
      if (row) {
        assert.equal(visit(c)?.deckId, startDeck);
        samples.push({ phase: row.phase, x: row.x, y: row.y, z: row.z });
      }
      await send(dx, dy);
      await pause();
    }
    await send(0, 0);
  };
  await run(() => !!active(c), 0, 1, "automatic entry");
  await assert.rejects(
    c.reducers.leaveConstructionReview({
      expectedVisitId: visit(c)!.visitId,
      expectedRevision: visit(c)!.revision,
      operationId: crypto.randomUUID(),
    }),
  );
  await run(() => (active(c)?.y ?? 0) >= 7 - 1e-7, 0, 1, "first flight");
  await run(
    () =>
      direction === "up"
        ? (active(c)?.x ?? 0) >= 5 - 1e-7
        : (active(c)?.x ?? 9) <= 3 + 1e-7,
    direction === "up" ? 1 : -1,
    0,
    "mid landing",
  );
  await run(() => !active(c), 0, -1, "second flight");
  assert.notEqual(visit(c)?.deckId, startDeck);
  return samples;
}
export async function stairAuthorityJourney(
  c: DbConnection,
  instanceIds: string[],
) {
  const inventory = traversalInventorySnapshot(c),
    original = { ...actor(c) },
    events: unknown[] = [];
  const send = traversalIntentSender(c);
  for (const instanceId of instanceIds) {
    await enterTraversalReview(c, instanceId);
    // Approach the lower entrance from the open south floor, then let normal intent acquire it.
    await walkTraversalActor(c, 1, 1, send);
    await walkTraversalActor(c, 3, 1, send);
    await walkTraversalActor(c, 3, 1.8, send);
    events.push({
      instanceId,
      direction: "up",
      samples: await driveStair(c, "up"),
    });
    events.push({
      instanceId,
      direction: "down",
      samples: await driveStair(c, "down"),
    });
    await leaveTraversalReview(c);
    assert.equal(actor(c).id, original.id);
    assert.equal(actor(c).shipId, original.shipId);
    assert.equal(actor(c).localX, original.localX);
    assert.equal(actor(c).localY, original.localY);
    requireTraversalInventoryUnchanged(c, inventory);
  }
  return {
    events,
    inventoryUnchanged: true,
    independentInstances: instanceIds.length,
  };
}

/** Grants expire through normal server expiry; no privileged mutation occurs
 * while the actor is on stairs. The accepted recovery remains ordinary intent. */
export async function stairGrantLossJourney(
  c: DbConnection,
  instanceId: string,
  workspaceId: string,
) {
  const inventory = traversalInventorySnapshot(c),
    original = { ...actor(c) };
  const send = traversalIntentSender(c),
    expiresMicros = BigInt(Date.now() + 10000) * 1000n;
  for (const capability of ["draft.read", "instance.spawn"]) {
    const prior = [...c.db.ownConstructionGrants.iter()].find(
      (g) => g.workspaceId === workspaceId && g.capability === capability,
    )!;
    assert(prior);
    await c.reducers.setConstructionGrant({
      principal: c.identity!.toHexString(),
      workspaceId,
      capability,
      expiresMicros,
      revoked: false,
      expectedRevision: prior.revision,
      operationId: crypto.randomUUID(),
    });
  }
  await enterTraversalReview(c, instanceId);
  await walkTraversalActor(c, 1, 1, send);
  await walkTraversalActor(c, 3, 1, send);
  await walkTraversalActor(c, 3, 1.8, send);
  let deadline = Date.now() + 10000;
  while ((active(c)?.z ?? 0) < 0.6) {
    assert(Date.now() < deadline, "grant loss test did not reach mid-flight");
    await send(0, 1);
    await pause();
  }
  await send(0, 0);
  await wait(
    () => !!active(c)?.egressOnly,
    "restricted stair egress after expiry",
  );
  await wait(
    () =>
      ![...c.db.ownConstructionInstances.iter()].some(
        (i) => i.id === instanceId,
      ),
    "full document removed after read expiry",
  );
  const minimum = [...c.db.ownConstructionStairEgressGeometry.iter()][0];
  assert(minimum);
  assert.equal(Object.keys(minimum).length, 11);
  const during = { ...active(c) };
  deadline = Date.now() + 20000;
  while (visit(c)) {
    assert(Date.now() < deadline, "restricted supported egress did not finish");
    await send(0, -1);
    await pause();
  }
  await send(0, 0);
  assert.equal(actor(c).id, original.id);
  assert.equal(actor(c).shipId, original.shipId);
  assert.equal(actor(c).localX, original.localX);
  assert.equal(actor(c).localY, original.localY);
  assert.equal([...c.db.ownConstructionStairEgressGeometry.iter()].length, 0);
  await assert.rejects(
    c.reducers.enterConstructionReview({
      instanceId,
      expectedShipId: original.shipId,
      operationId: crypto.randomUUID(),
    }),
  );
  requireTraversalInventoryUnchanged(c, inventory);
  return {
    during,
    minimum,
    fullDocumentRevoked: true,
    safeReturn: true,
    reentryDenied: true,
    inventoryUnchanged: true,
  };
}
