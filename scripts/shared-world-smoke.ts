import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { DbConnection, tables } from "../packages/net/src/generated";
import {
  SHARED_SYSTEM_SEED,
  SHARED_STOCK_EXTERIOR_ID,
} from "@sidereal/content/shared-system";
import { sharedCellQueries } from "../packages/net/src/world-subscriptions";

type Client = (
  token?: string,
) => Promise<{ connection: DbConnection; token: string }>;
type Wait = (predicate: () => boolean, label: string) => Promise<void>;
const json = (value: unknown) =>
  JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v));
const actor = (c: DbConnection) => [...c.db.ownCharacters.iter()][0]!;
const ship = (c: DbConnection) => [...c.db.ownShips.iter()][0]!;
const snapshot = (c: DbConnection) =>
  json({
    appearance: [...c.db.ownAppearance.iter()],
    items: [...c.db.ownInventoryItems.iter()].sort((a, b) =>
      a.id.localeCompare(b.id),
    ),
    containers: [...c.db.ownInventoryContainers.iter()].sort((a, b) =>
      a.id.localeCompare(b.id),
    ),
    hotbar: [...c.db.ownInventoryHotbar.iter()].sort((a, b) => a.slot - b.slot),
  });
async function subscribe(c: DbConnection) {
  return await new Promise<
    ReturnType<ReturnType<DbConnection["subscriptionBuilder"]>["subscribe"]>
  >((resolve, reject) => {
    const handle = c
      .subscriptionBuilder()
      .onApplied(() => resolve(handle))
      .onError((e) => reject(e.event))
      .subscribe([
        tables.ownWorldAdmission,
        tables.visibleShipMotion,
        tables.visibleShipDescriptions,
        tables.visibleBodyMotion,
        tables.visibleBodyDescriptions,
      ]);
  });
}
/** Reusable with an admitted real-provider client factory. Standalone mode below
 * uses ordinary development principals only and does not claim OIDC acceptance. */
export async function sharedWorldSmoke(client: Client, wait: Wait) {
  const first = await client(),
    second = await client(),
    third = await client();
  const a = first.connection,
    b = second.connection,
    outsider = third.connection;
  let reconnected: Awaited<ReturnType<Client>> | undefined;
  const handles: ReturnType<typeof subscribe> extends Promise<infer H>
    ? H[]
    : never = [];
  try {
    handles.push(
      await subscribe(a),
      await subscribe(b),
      await subscribe(outsider),
    );
    for (const [c, name] of [
      [a, "Shared Alpha"],
      [b, "Shared Beta"],
    ] as const) {
      await c.reducers.enterLab({ name });
      await c.reducers.claimStarterKit({});
      await c.reducers.claimInputControl({});
    }
    await wait(
      () => a.db.ownShips.count() === 1n && b.db.ownShips.count() === 1n,
      "new persistent identities",
    );
    await wait(
      () =>
        a.db.ownWorldAdmission.count() === 1n &&
        b.db.ownWorldAdmission.count() === 1n,
      "new characters enter shared world atomically",
    );
    // Third principal intentionally has no character: arbitrary wildcard SQL
    // does not create admission or grant a view of the canonical system.
    assert.equal(outsider.db.ownCharacters.count(), 0n);
    const oldA = ship(a),
      oldB = ship(b),
      actorA = actor(a),
      actorB = actor(b);
    const beforeA = snapshot(a),
      beforeB = snapshot(b);
    const request = (c: DbConnection) => ({
      characterId: actor(c).id,
      shipId: ship(c).id,
      expectedShipRevision: ship(c).revision,
      expectedAdmissionRevision: 0n,
      operationId: randomUUID(),
    });
    const joinA = request(a);
    await assert.rejects(
      b.reducers.joinSharedSystem({ ...joinA, operationId: randomUUID() }),
    );
    await assert.rejects(
      outsider.reducers.joinSharedSystem({
        ...joinA,
        operationId: randomUUID(),
      }),
    );
    await assert.rejects(
      a.reducers.joinSharedSystem(joinA),
      "automatic admission must not be relocated by a new explicit join",
    );
    await wait(
      () =>
        a.db.visibleShipMotion.shipId.find(oldB.id) !== undefined &&
        b.db.visibleShipMotion.shipId.find(oldA.id) !== undefined,
      "two accounts discover shared ships",
    );
    assert.equal(a.db.ownShips.count(), 1n);
    assert.equal(b.db.ownShips.count(), 1n);
    assert.equal(a.db.ownCharacters.count(), 1n);
    assert.equal(b.db.ownCharacters.count(), 1n);
    assert.equal(ship(a).id, oldA.id);
    assert.equal(actor(a).id, actorA.id);
    assert.equal(actor(b).id, actorB.id);
    assert.notDeepEqual([ship(a).x, ship(a).y], [ship(b).x, ship(b).y]);
    assert.equal(snapshot(a), beforeA);
    assert.equal(snapshot(b), beforeB);
    assert.equal(
      a.db.ownSpaceBodies.count(),
      0n,
      "admitted ship hides preserved legacy fixture rows",
    );
    assert.equal(outsider.db.ownWorldAdmission.count(), 0n);
    assert.equal(outsider.db.visibleShipMotion.count(), 0n);
    assert.equal(outsider.db.visibleBodyMotion.count(), 0n);
    assert.deepEqual(
      [...a.db.visibleBodyDescriptions.iter()].map((v) => v.bodyId).sort(),
      [...b.db.visibleBodyDescriptions.iter()].map((v) => v.bodyId).sort(),
    );
    for (const seed of SHARED_SYSTEM_SEED.bodies)
      assert(
        a.db.visibleBodyDescriptions.bodyId.find(seed.id),
        "canonical body ID",
      );
    const description = a.db.visibleShipDescriptions.shipId.find(oldB.id)!;
    assert.equal(
      description.publishedExteriorAssetId,
      SHARED_STOCK_EXTERIOR_ID,
    );
    assert.deepEqual(
      Object.keys(description).sort(),
      [
        "shipId",
        "publishedExteriorAssetId",
        "appearanceRevision",
        "displayName",
      ].sort(),
    );
    const stableMotion = json(a.db.visibleShipMotion.shipId.find(oldA.id));
    const stableAdmission = json([...a.db.ownWorldAdmission.iter()]);
    await a.reducers.enterLab({ name: "Shared Alpha" });
    assert.equal(json([...a.db.ownWorldAdmission.iter()]), stableAdmission);
    assert.equal(
      json(a.db.visibleShipMotion.shipId.find(oldA.id)),
      stableMotion,
      "re-entering existing character does not relocate",
    );
    await assert.rejects(
      a.reducers.joinSharedSystem({ ...joinA, operationId: randomUUID() }),
    );
    for (const name of [
      "world_system",
      "ship_world_motion",
      "system_body",
      "body_world_motion",
      "world_admission",
      "world_join_receipt",
      "legacy_body_alias",
    ]) {
      let rejected = false;
      outsider
        .subscriptionBuilder()
        .onError(() => {
          rejected = true;
        })
        .subscribe(`SELECT * FROM ${name}`);
      await wait(() => rejected, "private shared base denied: " + name);
    }
    // Actual SQL parser acceptance, including negative cell values and generated names.
    const cellHandle = await new Promise<
      ReturnType<ReturnType<DbConnection["subscriptionBuilder"]>["subscribe"]>
    >((resolve, reject) => {
      const h = a
        .subscriptionBuilder()
        .onApplied(() => resolve(h))
        .onError((e) => reject(e.event))
        .subscribe(
          sharedCellQueries(SHARED_SYSTEM_SEED.systemId, { x: -1, y: -1 }),
        );
      handles.push(h);
    });
    await new Promise<void>((resolve) =>
      cellHandle.unsubscribeThen(() => resolve()),
    );
    const rockId = SHARED_SYSTEM_SEED.bodies[0].id;
    const samplesA = new Map<bigint, string>(),
      samplesB = new Map<bigint, string>();
    const captureA: Parameters<typeof a.db.visibleBodyMotion.onUpdate>[0] = (
      _ctx,
      _old,
      row,
    ) => {
      if (row.bodyId === rockId) samplesA.set(row.serverTick, json(row));
    };
    const captureB: Parameters<typeof b.db.visibleBodyMotion.onUpdate>[0] = (
      _ctx,
      _old,
      row,
    ) => {
      if (row.bodyId === rockId) samplesB.set(row.serverTick, json(row));
    };
    a.db.visibleBodyMotion.onUpdate(captureA);
    b.db.visibleBodyMotion.onUpdate(captureB);
    let sequence = 0n;
    try {
      for (let i = 0; i < 65; i++) {
        await a.reducers.setIntent({
          sequence: ++sequence,
          throttle: 1,
          turn: 0,
          dx: 0,
          dy: 0,
          sprint: false,
        });
        await new Promise((resolve) => setTimeout(resolve, 45));
      }
      await a.reducers.setIntent({
        sequence: ++sequence,
        throttle: 0,
        turn: 0,
        dx: 0,
        dy: 0,
        sprint: false,
      });
      await wait(
        () =>
          [...samplesA.keys()].filter((tick) => samplesB.has(tick)).length >= 2,
        "both accounts receive same moving shared rock",
      );
      for (const [tick, row] of samplesA)
        if (samplesB.has(tick))
          assert.equal(
            samplesB.get(tick),
            row,
            "same canonical body/sample for both principals",
          );
    } finally {
      a.db.visibleBodyMotion.removeOnUpdate(captureA);
      b.db.visibleBodyMotion.removeOnUpdate(captureB);
    }
    // Keep B's wildcard view open while A crosses a cell and leaves discovery.
    // This proves SQL is not the authority boundary and stale contacts are removed.
    for (
      let i = 0;
      i < 1200 &&
      Math.hypot(ship(a).x - ship(b).x, ship(a).y - ship(b).y) <= 415;
      i++
    ) {
      await a.reducers.setIntent({
        sequence: ++sequence,
        throttle: 1,
        turn: 0,
        dx: 0,
        dy: 0,
        sprint: false,
      });
      await new Promise((resolve) => setTimeout(resolve, 45));
    }
    await a.reducers.setIntent({
      sequence: ++sequence,
      throttle: 0,
      turn: 0,
      dx: 0,
      dy: 0,
      sprint: false,
    });
    assert(
      Math.hypot(ship(a).x - ship(b).x, ship(a).y - ship(b).y) > 400,
      "accepted flight crosses discovery range",
    );
    await wait(
      () =>
        !b.db.visibleShipMotion.shipId.find(oldA.id) &&
        !b.db.visibleShipDescriptions.shipId.find(oldA.id),
      "wildcard subscriber loses out-of-range ship and description",
    );
    await wait(
      () => !a.db.visibleShipMotion.shipId.find(oldB.id),
      "moving observer loses former nearby ship",
    );
    assert(
      [...a.db.visibleBodyDescriptions.iter()].filter(
        (row) => row.kind !== "asteroid",
      ).length >= 12,
      "charted distant planets survive cell crossing",
    );
    assert.notEqual(
      ship(a).y,
      oldA.y,
      "own legacy-shaped projection follows shared motion",
    );
    assert.equal(snapshot(a), beforeA);
    assert.equal(snapshot(b), beforeB);
    // A real moving ship must reach terminal IFCS rest; testing only initial
    // zeroes misses asymptotic braking tails that rewrite motion indefinitely.
    for (
      let i = 0;
      i < 450 && (ship(a).vx !== 0 || ship(a).vy !== 0 || ship(a).omega !== 0);
      i++
    ) {
      await a.reducers.setIntent({
        sequence: ++sequence,
        throttle: 0,
        turn: 0,
        dx: 0,
        dy: 0,
        sprint: false,
      });
      await new Promise((resolve) => setTimeout(resolve, 45));
    }
    assert.deepEqual(
      [ship(a).vx, ship(a).vy, ship(a).omega],
      [0, 0, 0],
      "accepted flight brakes to exact terminal rest",
    );
    const settled = json(a.db.visibleShipMotion.shipId.find(oldA.id));
    for (let i = 0; i < 25; i++) {
      await a.reducers.setIntent({
        sequence: ++sequence,
        throttle: 0,
        turn: 0,
        dx: 0,
        dy: 0,
        sprint: false,
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(
      json(a.db.visibleShipMotion.shipId.find(oldA.id)),
      settled,
      "resting ship motion and sample tick remain unchanged despite active idle input",
    );
    const admissionBefore = [...a.db.ownWorldAdmission.iter()][0]!;
    a.disconnect();
    reconnected = await client(first.token);
    handles.push(await subscribe(reconnected.connection));
    await reconnected.connection.reducers.enterLab({ name: "Shared Alpha" });
    await wait(
      () => reconnected!.connection.db.ownWorldAdmission.count() === 1n,
      "shared membership reconnect",
    );
    assert.deepEqual(
      [...reconnected.connection.db.ownWorldAdmission.iter()][0],
      admissionBefore,
    );
    assert.equal(ship(reconnected.connection).id, oldA.id);
    assert.equal(snapshot(reconnected.connection), beforeA);
    assert.equal(reconnected.connection.db.ownSpaceBodies.count(), 0n);
    assert.equal(
      outsider.db.visibleShipMotion.count(),
      0n,
      "wildcard view cannot grant membership",
    );
    return {
      principals: 3,
      ships: [oldA.id, oldB.id],
      canonicalSystemId: SHARED_SYSTEM_SEED.systemId,
      canonicalBodyCount: SHARED_SYSTEM_SEED.bodies.length,
      sharedRockSamples: [...samplesA.keys()].filter((tick) =>
        samplesB.has(tick),
      ).length,
      ownerViewsUnbroadened: true,
      outOfRangeWildcardRevocation: true,
      privateBasesDenied: 7,
      canonicalIdsAndInventoryPreserved: true,
      reconnectMembershipPreserved: true,
      movedThenRestedWithoutMotionWrites: true,
      exactNegativeCellSqlAccepted: true,
      admission:
        "new characters join atomically; existing admission is retained",
      crossOwnerAndUnenteredJoinDenied: true,
      reentryPreservesAdmission: true,
      exactLegacyJoinReceiptReplay:
        "separate pure and preupgrade-fixture acceptance",
      scope:
        "ordinary authenticated development principals; real-provider factory supported separately",
    };
  } finally {
    for (const h of handles)
      if (h.isActive() && !h.isEnded()) {
        try {
          h.unsubscribe();
        } catch {
          /* owning socket closes next */
        }
      }
    a.disconnect();
    b.disconnect();
    outsider.disconnect();
    reconnected?.connection.disconnect();
  }
}
if (process.argv[1]?.endsWith("shared-world-smoke.ts")) {
  const host = process.env.SIDEREAL_SMOKE_URL,
    database = process.env.SIDEREAL_SMOKE_DATABASE;
  if (!host || !database?.endsWith("-smoke"))
    throw Error("Explicit isolated -smoke database environment required");
  const wait: Wait = async (predicate, label) => {
    const end = Date.now() + 12_000;
    while (Date.now() < end) {
      if (predicate()) return;
      await new Promise((r) => setTimeout(r, 30));
    }
    throw Error("Timeout: " + label);
  };
  const client: Client = async (token) => {
    let ready = false,
      saved = "";
    const connection = DbConnection.builder()
      .withUri(host)
      .withDatabaseName(database)
      .withToken(token)
      .onConnect((c, _i, t) => {
        saved = t;
        c.subscriptionBuilder()
          .onApplied(() => {
            ready = true;
          })
          .subscribe([
            tables.ownCharacters,
            tables.ownShips,
            tables.ownStations,
            tables.ownSpaceBodies,
            tables.ownAppearance,
            tables.ownInventoryItems,
            tables.ownInventoryContainers,
            tables.ownInventoryHotbar,
          ]);
      })
      .build();
    await wait(() => ready, "base subscription");
    return { connection, token: saved };
  };
  const summary = await sharedWorldSmoke(client, wait);
  writeFileSync(
    ".runtime/shared-world-smoke-summary.json",
    JSON.stringify(
      { ...summary, database, timestamp: new Date().toISOString() },
      null,
      2,
    ),
  );
  console.log("Shared world authority smoke passed", summary);
}
