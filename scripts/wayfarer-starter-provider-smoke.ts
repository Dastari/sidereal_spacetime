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
import { WAYFARER_STARTER } from "@sidereal/content/wayfarer-starter";
import { constructionFlightIntentSender } from "./construction-flight-smoke";
import { walkTraversalActor } from "./traversal-smoke";
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
            tables.ownGameShipAccess,
            tables.ownConstructionInstances,
            tables.ownConstructionDecks,
            tables.ownConstructionLocation,
            tables.ownConstructionGrants,
            tables.ownAuthoredFlights,
            tables.ownAuthoredFlightFittings,
            tables.ownActuatorOutputs,
            tables.ownReachableCargoContainers,
            tables.ownReachableCargoItems,
            tables.ownCarriedInventoryRevisions,
            tables.ownInteractions,
            tables.ownConstructionSeat,
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
const actor = (s: Connected) => [...s.connection.db.ownCharacters.iter()][0]!;
const access = (s: Connected) =>
  [...s.connection.db.ownGameShipAccess.iter()][0]!;
const flight = (s: Connected) =>
  [...s.connection.db.ownAuthoredFlights.iter()][0]!;
const motion = (s: Connected, id: string) =>
  [...s.connection.db.visibleShipMotion.iter()].find((r) => r.shipId === id)!;
const pause = (ms = 100) => new Promise((r) => setTimeout(r, ms));
function stable(s: Connected) {
  const d = s.connection.db;
  return encode({
    actor: actor(s).id,
    ship: actor(s).shipId,
    access: [...d.ownGameShipAccess.iter()],
    items: [...d.ownInventoryItems.iter()].sort((a, b) =>
      a.id.localeCompare(b.id),
    ),
    containers: [...d.ownInventoryContainers.iter()].sort((a, b) =>
      a.id.localeCompare(b.id),
    ),
    appearance: [...d.ownAppearance.iter()],
  });
}
async function denyPrivate(s: Connected, name: string) {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error("Private denial timed out: " + name)),
      5000,
    );
    const handle = s.connection
      .subscriptionBuilder()
      .onApplied(() => {
        clearTimeout(timer);
        handle.unsubscribe();
        reject(Error("Private base exposed: " + name));
      })
      .onError(() => {
        clearTimeout(timer);
        resolve();
      })
      .subscribe("SELECT * FROM " + name);
  });
}
const sessions: Connected[] = [];
try {
  for (let i = 0; i < 2; i++) {
    const s = await connect(tokens[i]);
    sessions.push(s);
    const existed = !!actor(s);
    await s.connection.reducers.enterLab({
      name: i === 0 ? "Starter Alpha" : "Starter Beta",
    });
    await wait(
      () => !!access(s) && !!flight(s) && actor(s)?.connected,
      "native owned starter admission",
    );
    const d = s.connection.db;
    assert.equal(access(s).characterId, actor(s).id);
    assert.equal(access(s).shipId, actor(s).shipId);
    assert.equal(access(s).templateSha256, WAYFARER_STARTER.sha256);
    assert.equal([...d.ownConstructionInstances.iter()].length, 1);
    assert.equal([...d.ownConstructionDecks.iter()].length, 1);
    assert.equal([...d.ownConstructionGrants.iter()].length, 0);
    assert.equal([...d.ownInventoryItems.iter()].length, 7);
    assert.equal([...d.ownInventoryContainers.iter()].length, 3);
    assert.equal([...d.ownAuthoredFlightFittings.iter()].length, 10);
    assert.equal(flight(s).active, true);
    assert.equal(flight(s).flightAdmitted, true);
    assert.equal(flight(s).seatState, "none");
    const before = stable(s);
    await s.connection.reducers.enterLab({ name: "Must preserve starter" });
    await pause();
    assert.equal(stable(s), before);
    console.log(
      encode({
        phase: "starter",
        fresh: !existed,
        actor: actor(s).id,
        ship: actor(s).shipId,
        x: actor(s).localX,
        y: actor(s).localY,
      }),
    );
  }
  const [alpha, beta] = sessions;
  await wait(
    () =>
      !!motion(alpha, actor(beta).shipId) &&
      !!motion(beta, actor(alpha).shipId),
    "both shared ships",
  );
  assert.notEqual(access(alpha).instanceId, access(beta).instanceId);
  const ids = new Set(
    [...alpha.connection.db.ownInventoryItems.iter()].map((r) => r.id),
  );
  assert(
    [...beta.connection.db.ownInventoryItems.iter()].every(
      (r) => !ids.has(r.id),
    ),
  );
  for (const name of [
    "personal_starter_receipt",
    "game_ship_access",
    "construction_instance",
    "inventory_item",
  ])
    await denyPrivate(alpha, name);
  console.log(
    encode({
      phase: "bootstrap-pass",
      privateBaseDenied: true,
      ordinaryAccountsNoAuthoringGrants: true,
      independentKit: true,
    }),
  );
  const c = alpha.connection,
    d = c.db,
    send = constructionFlightIntentSender(c);
  const original = stable(alpha);
  if (actor(alpha).localY > 0) {
    await walkTraversalActor(c, 0, 7, send);
    await walkTraversalActor(c, 0, -1.5, send);
  }
  const interactions = () => [...d.ownInteractions.iter()];
  assert.equal(interactions().length, 4);
  for (const [x, y] of [
    [-2, -1.5],
    [0, -1.5],
    [0, 3],
    [2.25, 3],
  ])
    await walkTraversalActor(c, x, y, send);
  const couch = () => interactions().find((r) => r.kind === "seat")!;
  const sit = {
    objectId: couch().id,
    action: "sit",
    expectedRevision: couch().revision,
    operationId: randomUUID(),
  };
  await assert.rejects(beta.connection.reducers.interactObject(sit));
  await c.reducers.interactObject(sit);
  await c.reducers.interactObject(sit);
  await wait(() => couch().seatedByYou, "owned sofa sit");
  const seated = [actor(alpha).localX, actor(alpha).localY];
  await send(1, 1);
  await pause(200);
  assert.deepEqual([actor(alpha).localX, actor(alpha).localY], seated);
  await c.reducers.interactObject({
    objectId: couch().id,
    action: "stand",
    expectedRevision: couch().revision,
    operationId: randomUUID(),
  });
  await wait(() => !couch().seatedByYou, "owned sofa stand");
  for (const [x, y] of [
    [0, 3],
    [0, -1.5],
    [-2.4, -1.5],
  ])
    await walkTraversalActor(c, x, y, send);
  const light = () =>
    interactions()
      .filter((r) => r.kind !== "seat" && r.reachable)
      .sort(
        (a, b) =>
          Math.hypot(
            a.localX - actor(alpha).localX,
            a.localY - actor(alpha).localY,
          ) -
          Math.hypot(
            b.localX - actor(alpha).localX,
            b.localY - actor(alpha).localY,
          ),
      )[0]!;
  const enabled = light().enabled;
  const toggle = {
    objectId: light().id,
    action: enabled ? "set-light-off" : "set-light-on",
    expectedRevision: light().revision,
    operationId: randomUUID(),
  };
  await c.reducers.interactObject(toggle);
  await c.reducers.interactObject(toggle);
  await wait(() => light().enabled !== enabled, "owned hydroponics toggle");
  await assert.rejects(
    beta.connection.reducers.interactObject({
      ...toggle,
      operationId: randomUUID(),
      expectedRevision: light().revision,
    }),
  );
  await c.reducers.interactObject({
    objectId: light().id,
    action: enabled ? "set-light-on" : "set-light-off",
    expectedRevision: light().revision,
    operationId: randomUUID(),
  });
  await wait(() => light().enabled === enabled, "owned light restore");
  console.log(
    encode({
      phase: "interactions-pass",
      sofa: true,
      seatedMovementBlocked: true,
      lightToggle: true,
      crossOwnerDenied: true,
    }),
  );
  for (const [x, y] of [
    [-2, -1.5],
    [0, -1.5],
    [0, 2.75],
    [-2.5, 2.75],
    [-3.5, 2.75],
  ])
    await walkTraversalActor(c, x, y, send);
  await wait(
    () => d.ownReachableCargoContainers.count() === 4n,
    "four game-owned cargo roots",
  );
  const roots = [...d.ownReachableCargoContainers.iter()];
  assert.equal(d.ownReachableCargoItems.count(), 0n);
  const item = [...d.ownInventoryItems.iter()].find(
    (r) => r.definitionId === "compact-pistol",
  )!;
  const rev = (id: string) =>
    [...d.ownCarriedInventoryRevisions.iter()].find((r) => r.id === id)!
      .revision;
  const state = () => [...d.ownInventoryState.iter()][0]!;
  const cargo = (id: string) =>
    [...d.ownReachableCargoContainers.iter()].find((r) => r.id === id)!;
  for (const root of roots) {
    const command = {
      operationId: randomUUID(),
      itemId: item.id,
      expectedItemRevision: rev(item.id),
      sourceContainerId: item.containerId,
      expectedSourceRevision: rev(item.containerId),
      destinationContainerId: root.id,
      expectedDestinationRevision: cargo(root.id).revision,
      expectedCharacterRevision: state().revision,
      x: 0,
      y: 0,
      rotated: false,
    };
    await assert.rejects(
      beta.connection.reducers.transferScopedCargoItem(command),
    );
    await c.reducers.transferScopedCargoItem(command);
    await wait(
      () => [...d.ownReachableCargoItems.iter()].some((r) => r.id === item.id),
      "stored native cargo pistol",
    );
    const savedRevision = cargo(root.id).revision;
    await c.reducers.transferScopedCargoItem(command);
    await pause();
    assert.equal(cargo(root.id).revision, savedRevision);
    await assert.rejects(
      c.reducers.moveInventoryItem({
        operationId: randomUUID(),
        itemId: item.id,
        containerId: item.containerId,
        expectedRevision: state().revision,
        x: item.x,
        y: item.y,
        rotated: item.rotated,
      }),
    );
    const stored = [...d.ownReachableCargoItems.iter()].find(
      (r) => r.id === item.id,
    )!;
    await c.reducers.transferScopedCargoItem({
      operationId: randomUUID(),
      itemId: item.id,
      expectedItemRevision: stored.revision,
      sourceContainerId: root.id,
      expectedSourceRevision: cargo(root.id).revision,
      destinationContainerId: item.containerId,
      expectedDestinationRevision: rev(item.containerId),
      expectedCharacterRevision: state().revision,
      x: item.x,
      y: item.y,
      rotated: item.rotated,
    });
    await wait(
      () => [...d.ownInventoryItems.iter()].some((r) => r.id === item.id),
      "same pistol retrieved",
    );
  }
  assert.equal(stable(alpha), original);
  console.log(
    encode({
      phase: "cargo-pass",
      fourIndependentContainers: roots.map((r) => r.id),
      pistol: item.id,
      replay: true,
      crossOwnerDenied: true,
      legacyBypassDenied: true,
    }),
  );
  for (const [x, y] of [
    [-2.5, 2.75],
    [0, 2.75],
    [0, 7],
    [0, 9.375],
  ])
    await walkTraversalActor(c, x, y, send);
  const enter = {
    stationId: flight(alpha).stationId,
    expectedStationRevision: flight(alpha).stationRevision,
    operationId: randomUUID(),
  };
  await assert.rejects(beta.connection.reducers.enterAuthoredPilot(enter));
  await c.reducers.enterAuthoredPilot(enter);
  await c.reducers.enterAuthoredPilot(enter);
  await wait(
    () => flight(alpha).seatState === "seated",
    "owned native pilot seat",
  );
  const start = { ...motion(alpha, actor(alpha).shipId) };
  let thrust = false;
  for (let n = 0; n < 12; n++) {
    await send(0, 0, 1, 0);
    await pause(70);
    thrust ||= [...d.ownActuatorOutputs.iter()].some((r) => r.throttle > 0);
  }
  await send(0, 0, 0, 0);
  await wait(
    () =>
      Math.hypot(
        motion(beta, actor(alpha).shipId).x - start.x,
        motion(beta, actor(alpha).shipId).y - start.y,
      ) > 0.05,
    "remote accepted native motion",
  );
  assert(thrust);
  await c.reducers.leaveAuthoredPilot({});
  await wait(() => flight(alpha).seatState === "none", "owned pilot exit");
  await assert.rejects(send(0, 0, 1, 0));
  await send(0, 0, 0, 0);
  const saved = stable(alpha),
    locationBefore = encode([...d.ownConstructionLocation.iter()]);
  alpha.close();
  const replacement = await connect(tokens[0]);
  sessions.push(replacement);
  await replacement.connection.reducers.enterLab({
    name: "Reconnect must not remint",
  });
  await wait(
    () => !!access(replacement) && actor(replacement)?.connected,
    "owned native reconnect",
  );
  assert.equal(stable(replacement), saved);
  assert.equal(
    encode([...replacement.connection.db.ownConstructionLocation.iter()]),
    locationBefore,
  );
  console.log(
    encode({
      phase: "flight-reconnect-pass",
      nativePilot: true,
      remoteMotion: true,
      stationPermission: true,
      exactKitAndLocation: true,
    }),
  );
  const summary = {
    database,
    source: WAYFARER_STARTER.sha256,
    actors: sessions.slice(0, 2).map((r) => actor(r)?.id),
    bootstrap: true,
    cargo: true,
    interactions: true,
    pilot: true,
    reconnect: true,
    at: new Date().toISOString(),
  };
  writeFileSync(
    process.env.SIDEREAL_STARTER_SUMMARY ??
      ".runtime/wayfarer-starter-provider-summary.json",
    JSON.stringify(summary, null, 2) + "\n",
    { mode: 0o600 },
  );
} finally {
  for (const s of sessions) s.close();
}
