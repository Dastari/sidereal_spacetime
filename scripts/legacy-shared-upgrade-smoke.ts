/** Seed on an exact old module, then verify additive upgrade never auto-relocates.
 * Credentials/evidence remain private; no direct table writes are used. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { DbConnection, tables } from "../packages/net/src/generated";
const host = process.env.SIDEREAL_SMOKE_URL;
const database = process.env.SIDEREAL_SMOKE_DATABASE;
if (
  !host ||
  database !== "sidereal-spacetime-dev-review-legacy-private-upgrade"
)
  throw Error("Dedicated isolated legacy-upgrade database required");
const verify = process.argv.includes("--verify");
const privatePath = ".runtime/legacy-private-upgrade-credentials.json";
const baselinePath = ".runtime/legacy-private-upgrade-before.json";
const token = verify
  ? JSON.parse(readFileSync(privatePath, "utf8")).token
  : undefined;
let admitted = false;
let error: unknown;
let saved = "";
const connection = DbConnection.builder()
  .withUri(host)
  .withDatabaseName(database)
  .withToken(token)
  .onConnect((c, _identity, value) => {
    saved = value;
    c.subscriptionBuilder()
      .onApplied(() => {
        admitted = true;
      })
      .onError((e) => {
        error = e.event;
      })
      .subscribe([
        tables.ownCharacters,
        tables.ownShips,
        tables.ownStations,
        tables.ownSpaceBodies,
        tables.ownAppearance,
        tables.ownInventoryItems,
        tables.ownInventoryContainers,
        tables.ownInventoryState,
        tables.ownInventoryHotbar,
        ...(verify
          ? [
              tables.ownWorldAdmission,
              tables.visibleShipMotion,
              tables.visibleBodyMotion,
            ]
          : []),
      ]);
  })
  .onConnectError(() => {
    error = Error("Isolated development login failed");
  })
  .build();
const wait = async (test: () => boolean) => {
  const until = Date.now() + 15_000;
  while (!test()) {
    if (error) throw error;
    if (Date.now() > until) throw Error("Isolated upgrade view timeout");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
};
const json = (value: unknown) =>
  JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
const rows = (table: { iter(): Iterable<object> }) =>
  [...table.iter()].sort((a, b) => json(a).localeCompare(json(b)));
function snapshot() {
  return JSON.parse(
    json({
      characters: rows(connection.db.ownCharacters),
      ships: [...connection.db.ownShips.iter()].map(
        ({ tick: _tick, ...ship }) => ship,
      ),
      stations: rows(connection.db.ownStations),
      bodyIds: [...connection.db.ownSpaceBodies.iter()]
        .map((row) => row.id)
        .sort(),
      appearance: rows(connection.db.ownAppearance),
      items: rows(connection.db.ownInventoryItems),
      containers: rows(connection.db.ownInventoryContainers),
      inventory: rows(connection.db.ownInventoryState),
      hotbar: rows(connection.db.ownInventoryHotbar),
    }),
  );
}
try {
  await wait(() => admitted);
  await connection.reducers.enterLab({ name: "Preserved legacy owner" });
  if (!verify) {
    await connection.reducers.claimStarterKit({});
    await connection.reducers.enterLab({ name: "Preserved legacy owner" });
  }
  await wait(
    () =>
      connection.db.ownCharacters.count() === 1n &&
      connection.db.ownSpaceBodies.count() > 0n,
  );
  // Disconnect intentionally releases control; reacquire through the normal proximity reducer.
  if (verify && ![...connection.db.ownStations.iter()][0]?.occupantId)
    await connection.reducers.useStation({});
  const current = snapshot();
  const actor = [...connection.db.ownCharacters.iter()][0]!;
  assert.equal(
    [...connection.db.ownStations.iter()][0]!.occupantId,
    actor.id,
    "pilot occupancy remains intact",
  );
  if (verify) {
    assert.deepEqual(current, JSON.parse(readFileSync(baselinePath, "utf8")));
    assert.equal(
      connection.db.ownWorldAdmission.count(),
      0n,
      "existing login does not implicitly join",
    );
    assert.equal(connection.db.visibleShipMotion.count(), 0n);
    assert.equal(connection.db.visibleBodyMotion.count(), 0n);
    writeFileSync(
      ".runtime/legacy-private-upgrade-summary.json",
      JSON.stringify(
        {
          database,
          preserved: true,
          actorId: actor.id,
          shipId: actor.shipId,
          pilotReacquiredAfterDisconnect: true,
          privateBodies: current.bodyIds.length,
          visibleItems: current.items.length,
          automaticAdmission: false,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    const request = {
      characterId: actor.id,
      shipId: actor.shipId,
      expectedShipRevision: [...connection.db.ownShips.iter()][0]!.revision,
      expectedAdmissionRevision: 0n,
      operationId: randomUUID(),
    };
    await connection.reducers.joinSharedSystem(request);
    await wait(() => connection.db.ownWorldAdmission.count() === 1n);
    const accepted = json([...connection.db.ownWorldAdmission.iter()]);
    await connection.reducers.joinSharedSystem(request);
    assert.equal(
      json([...connection.db.ownWorldAdmission.iter()]),
      accepted,
      "identical operation replay preserves admission",
    );
    assert.equal([...connection.db.ownCharacters.iter()][0]!.id, actor.id);
    assert.equal([...connection.db.ownShips.iter()][0]!.id, actor.shipId);
    assert.deepEqual(
      snapshot().items,
      current.items,
      "explicit join preserves every visible inventory row",
    );
    const summaryPath = ".runtime/legacy-private-upgrade-summary.json";
    const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
    writeFileSync(
      summaryPath,
      JSON.stringify(
        {
          ...summary,
          explicitJoinPreservedIdsAndItems: true,
          receiptReplayIdempotent: true,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    console.log(
      "Existing private actor, ship transform, bodies and inventory survived additive upgrade unchanged; explicit join and identical retry preserved IDs and inventory.",
    );
  } else {
    writeFileSync(privatePath, JSON.stringify({ token: saved }), {
      mode: 0o600,
    });
    writeFileSync(baselinePath, JSON.stringify(current, null, 2), {
      mode: 0o600,
    });
    console.log(
      "Private pre-upgrade fixture seeded through ordinary reducers.",
    );
  }
} finally {
  connection.disconnect();
}
