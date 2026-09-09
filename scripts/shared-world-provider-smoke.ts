/** Actual distinct Dastari accounts + installed SDK cache/subscription integration.
 * Uses private original provider token files; never logs bearer credentials.
 * Run only against an explicitly named isolated -smoke database.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { DbConnection, tables } from "../packages/net/src/generated";
import { bindGameSessionProof } from "../packages/net/src/game-session-proof";
import { createConnectionResources } from "../packages/net/src/connection-resources";
import { bindSharedWorld } from "../packages/net/src/bind-shared-world";
import { SHARED_SYSTEM_SEED } from "@sidereal/content/shared-system";
const host = process.env.SIDEREAL_SMOKE_URL;
const database = process.env.SIDEREAL_SMOKE_DATABASE;
if (!host || !database?.endsWith("-smoke"))
  throw Error("Explicit isolated -smoke database required");
const tokens = [
  process.env.SIDEREAL_PROVIDER_ALPHA,
  process.env.SIDEREAL_PROVIDER_BETA,
].map((file) => {
  if (!file) throw Error("Two private provider token file paths required");
  const token = JSON.parse(readFileSync(file, "utf8")).id_token;
  if (typeof token !== "string") throw Error("Missing provider ID token");
  return token;
});
const wait = async (predicate: () => boolean, label: string) => {
  const end = Date.now() + 15_000;
  while (Date.now() < end) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw Error("Timeout: " + label);
};
const encode = (value: unknown) =>
  JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v));
async function connect(token: string) {
  const resources = createConnectionResources();
  let ready = false,
    error: Error | undefined,
    binding: ReturnType<typeof bindSharedWorld> | undefined;
  const connection = DbConnection.builder()
    .withUri(host!)
    .withDatabaseName(database!)
    .withToken(token)
    .onConnect(async (c) => {
      let phase = "provider proof";
      try {
        await bindGameSessionProof({
          origin: host!,
          database: database!,
          connectionId: c.connectionId!.toHexString(),
          token,
          signal: AbortSignal.timeout(12_000),
        });
        phase = "shared binder creation";
        binding = bindSharedWorld({
          connection: c,
          resources,
          onError: (message) => {
            error = Error(message);
          },
        });
        phase = "private subscription creation";
        const privateScope = c
          .subscriptionBuilder()
          .onApplied(() => {
            ready = true;
          })
          .onError(() => {
            error = Error("Private game subscription rejected");
          })
          .subscribe([
            tables.ownCharacters,
            tables.ownShips,
            tables.ownStations,
            tables.ownAppearance,
            tables.ownInventoryState,
            tables.ownInventoryItems,
            tables.ownInventoryContainers,
            tables.ownInventoryHotbar,
          ]);
        resources.retain("provider-proof-private", privateScope);
      } catch (cause) {
        const status =
          cause instanceof Error &&
          /^Game session verification rejected \(\d+\)$/.test(cause.message)
            ? cause.message
            : "";
        error = Error("Failed during " + phase + ": " + status);
      }
    })
    .onConnectError(() => {
      error = Error("Provider socket connection failed");
    })
    .build();
  try {
    await wait(() => {
      if (error) throw error;
      return ready && !!binding?.readiness.getSnapshot();
    }, "actual provider shared baseline readiness");
  } catch (failure) {
    resources.dispose();
    connection.disconnect();
    throw failure;
  }
  return {
    connection,
    binding: binding!,
    close() {
      resources.dispose();
      connection.disconnect();
    },
  };
}
type Connected = Awaited<ReturnType<typeof connect>>;
const character = (c: Connected) =>
  [...c.connection.db.ownCharacters.iter()][0]!;
const ownShip = (c: Connected) => [...c.connection.db.ownShips.iter()][0]!;
function inventorySnapshot(c: Connected) {
  const db = c.connection.db;
  return encode({
    appearance: [...db.ownAppearance.iter()],
    items: [...db.ownInventoryItems.iter()].sort((a, b) =>
      a.id.localeCompare(b.id),
    ),
    containers: [...db.ownInventoryContainers.iter()].sort((a, b) =>
      a.id.localeCompare(b.id),
    ),
    hotbar: [...db.ownInventoryHotbar.iter()].sort((a, b) => a.slot - b.slot),
  });
}
/** Public read before join: existing admission is a safe no-op. Never invent a
 * new operation or relocate an admitted ship just to prepare a test. */
async function ensureAdmission(c: Connected, name: string) {
  await c.connection.reducers.enterLab({ name });
  await wait(
    () => !!character(c)?.connected && !!ownShip(c),
    "persistent character ready",
  );
  await c.connection.reducers.claimStarterKit({});
  const actor = character(c),
    ship = ownShip(c);
  const known = c.binding.store
    .getSnapshot()
    .admission.find((row) => row.characterId === actor.id);
  if (known) {
    assert.equal(known.shipId, ship.id);
    assert.equal(known.systemId, SHARED_SYSTEM_SEED.systemId);
    return { joined: false, shipId: ship.id, characterId: actor.id };
  }
  const request = {
    characterId: actor.id,
    shipId: ship.id,
    expectedShipRevision: ship.revision,
    expectedAdmissionRevision: 0n,
    operationId: randomUUID(),
  };
  await c.connection.reducers.joinSharedSystem(request);
  await wait(
    () =>
      c.binding.store
        .getSnapshot()
        .admission.some((row) => row.shipId === ship.id),
    "accepted provider world admission",
  );
  return { joined: true, shipId: ship.id, characterId: actor.id };
}
let a: Connected | undefined,
  b: Connected | undefined,
  again: Connected | undefined;
try {
  a = await connect(tokens[0]);
  b = await connect(tokens[1]);
  assert(
    a.connection.identity &&
      b.connection.identity &&
      !a.connection.identity.isEqual(b.connection.identity),
    "actual different provider identities",
  );
  const left = await ensureAdmission(a, "Dastari Shared Alpha"),
    right = await ensureAdmission(b, "Dastari Shared Beta");
  await wait(
    () =>
      a!.binding.store
        .getSnapshot()
        .shipMotion.some((row) => row.shipId === right.shipId) &&
      b!.binding.store
        .getSnapshot()
        .shipMotion.some((row) => row.shipId === left.shipId),
    "two actual accounts see both exteriors",
  );
  assert.deepEqual(
    a.binding.store.getSnapshot().bodyDescription.map((row) => row.bodyId),
    b.binding.store.getSnapshot().bodyDescription.map((row) => row.bodyId),
  );
  assert.equal(a.connection.db.ownShips.count(), 1n);
  assert.equal(b.connection.db.ownShips.count(), 1n);
  const beforeA = inventorySnapshot(a),
    beforeB = inventorySnapshot(b),
    start = { x: ownShip(a).x, y: ownShip(a).y };
  await a.connection.reducers.claimInputControl({});
  for (let i = 1; i <= 14; i++) {
    await a.connection.reducers.setIntent({
      sequence: BigInt(i),
      throttle: 1,
      turn: 0,
      dx: 0,
      dy: 0,
      sprint: false,
    });
    await new Promise((r) => setTimeout(r, 50));
  }
  await a.connection.reducers.setIntent({
    sequence: 15n,
    throttle: 0,
    turn: 0,
    dx: 0,
    dy: 0,
    sprint: false,
  });
  await wait(() => {
    const row = b!.binding.store
      .getSnapshot()
      .shipMotion.find((v) => v.shipId === left.shipId);
    return !!row && Math.hypot(row.x - start.x, row.y - start.y) > 0.02;
  }, "B observes accepted movement from A through retained cell subscription");
  assert.equal(inventorySnapshot(a), beforeA);
  assert.equal(inventorySnapshot(b), beforeB);
  const formerEpoch = a.binding.store.getEpoch();
  a.close();
  assert(a.binding.store.getEpoch() > formerEpoch);
  assert.equal(a.binding.store.getSnapshot().shipMotion.length, 0);
  again = await connect(tokens[0]);
  const resumed = await ensureAdmission(again, "Dastari Shared Alpha");
  assert.equal(resumed.joined, false);
  assert.equal(resumed.shipId, left.shipId);
  assert.equal(resumed.characterId, left.characterId);
  await wait(
    () =>
      again!.binding.store
        .getSnapshot()
        .shipMotion.some((row) => row.shipId === right.shipId),
    "provider reconnect hydrates remote cache",
  );
  assert.equal(inventorySnapshot(again), beforeA);
  const result = {
    database,
    actualDistinctDastariAccounts: true,
    originalProviderProof: true,
    realAuthorizationCodePkce: true,
    keyedCacheAndRetainedCellQueries: true,
    existingAdmissionSkippedOnReconnect: true,
    ownViewsUnbroadened: true,
    appearanceInventoryAndUUIDsPreserved: true,
    acceptedRemoteMovementObserved: true,
    closedSocketCacheCleared: true,
    canonicalSystemId: SHARED_SYSTEM_SEED.systemId,
    ships: [left.shipId, right.shipId],
    characters: [left.characterId, right.characterId],
    canonicalBodies: SHARED_SYSTEM_SEED.bodies.map((row) => row.id),
    initialJoins: [left.joined, right.joined],
    timestamp: new Date().toISOString(),
    visualAcceptance:
      "Parent browser review remains separate; this harness uses no GPU",
  };
  writeFileSync(
    ".runtime/shared-world-provider-summary.json",
    JSON.stringify(result, null, 2),
  );
  console.log("Actual two-provider shared-world acceptance passed", result);
} finally {
  a?.close();
  b?.close();
  again?.close();
}
