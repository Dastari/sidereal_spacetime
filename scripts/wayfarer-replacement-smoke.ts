/** Real-provider migration verification on an explicitly isolated database. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { DbConnection, tables } from "../packages/net/src/generated";
import { bindGameSessionProof } from "../packages/net/src/game-session-proof";
import { createConnectionResources } from "../packages/net/src/connection-resources";
import { bindSharedWorld } from "../packages/net/src/bind-shared-world";
import { constructionFlightIntentSender } from "./construction-flight-smoke";
import { walkTraversalActor } from "./traversal-smoke";
import { CURRENT_WAYFARER_STARTER } from "../packages/content/src/wayfarer-current-starter";
const host = process.env.SIDEREAL_SMOKE_URL,
  database = process.env.SIDEREAL_SMOKE_DATABASE;
const summary = process.env.SUMMARY_FILE!,
  phase = process.env.SIDEREAL_REPLACEMENT_PHASE;
if (
  !host ||
  !database?.includes("review-replacement") ||
  !database.endsWith("-smoke") ||
  !summary ||
  !["seed", "verify"].includes(phase ?? "")
)
  throw Error("Explicit isolated replacement smoke inputs required");
const tokenFiles = [
  process.env.SIDEREAL_PROVIDER_ALPHA!,
  process.env.SIDEREAL_PROVIDER_BETA!,
];
const tokens = tokenFiles.map(
  (f) => JSON.parse(readFileSync(f, "utf8")).id_token,
);
const wait = async (predicate: () => boolean, label: string) => {
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw Error("Timeout: " + label);
};
const encode = (v: unknown) =>
  JSON.stringify(v, (_, v) => (typeof v === "bigint" ? String(v) : v));
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
            (tables as any).ownWayfarerRebuildOffer,
            tables.ownWorldAdmission,
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

const sessions: Awaited<ReturnType<typeof connect>>[] = [];
const pause = (n = 100) => new Promise((r) => setTimeout(r, n));
try {
  const saved =
    phase === "verify" ? JSON.parse(readFileSync(summary, "utf8")) : undefined;
  const result: any[] = [];
  for (let i = 0; i < 2; i++) {
    const s = await connect(tokens[i]);
    sessions.push(s);
    const c = s.connection;
    await c.reducers.enterLab({
      name: "Replacement " + (i ? "Beta" : "Alpha"),
    });
    await wait(
      () =>
        !![...c.db.ownGameShipAccess.iter()][0] &&
        [...c.db.ownCharacters.iter()][0]?.connected,
      "owned active ship",
    );
    const actor = [...c.db.ownCharacters.iter()][0],
      access = [...c.db.ownGameShipAccess.iter()][0];
    const items = [...c.db.ownInventoryItems.iter()].map((x) => x.id).sort();
    const appearance = encode([...c.db.ownAppearance.iter()]);
    if (phase === "seed") {
      result.push({
        actorId: actor.id,
        shipId: actor.shipId,
        items,
        appearance,
      });
      continue;
    }
    assert.equal(actor.id, saved.before[i].actorId);
    assert.notEqual(actor.shipId, saved.before[i].shipId);
    assert.equal(access.templateSha256, CURRENT_WAYFARER_STARTER.sha256);
    assert.equal(access.revision, 1n);
    assert.equal(appearance, saved.before[i].appearance);
    assert.equal(items.length, 7);
    assert(items.every((id) => !saved.before[i].items.includes(id)));
    if (saved.after)
      assert.equal(
        actor.shipId,
        saved.after[i].shipId,
        "restart/reconnect cannot give another ship",
      );
    const denied: Response = await fetch(
      host +
        "/v1/database/" +
        database +
        "/call/replace_legacy_player_wayfarer",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + tokens[i],
          "Content-Type": "application/json",
        },
        body: JSON.stringify([actor.id, actor.shipId, 1]),
      },
    );
    assert(!denied.ok, "Ordinary account invoked deployment replacement");
    assert.match(await denied.text(), /Deployment operator required/);
    result.push({
      actorId: actor.id,
      shipId: actor.shipId,
      items,
      appearance,
      template: access.templateSha256,
    });
  }
  if (phase === "seed") {
    writeFileSync(summary, encode({ database, before: result }) + "\n", {
      mode: 0o600,
    });
    console.log("Seeded two old-template provider accounts");
  } else {
    assert.notEqual(result[0].shipId, result[1].shipId);
    for (let i = 0; i < 2; i++)
      assert(
        [...sessions[i].connection.db.ownConstructionInstances.iter()].every(
          (x) => x.id !== result[1 - i].shipId,
        ),
      );
    const c = sessions[0].connection,
      send = constructionFlightIntentSender(c);
    for (const [x, y] of [
      [0, -2],
      [0, 7],
      [0, 9.375],
    ])
      await walkTraversalActor(c, x, y, send);
    const flight = () => [...c.db.ownAuthoredFlights.iter()][0];
    await c.reducers.enterAuthoredPilot({
      stationId: flight().stationId,
      expectedStationRevision: flight().stationRevision,
      operationId: crypto.randomUUID(),
    });
    await wait(() => flight().seatState === "seated", "qualified rebuilt seat");
    const motion = () =>
      [...sessions[1].connection.db.visibleShipMotion.iter()].find(
        (m) => m.shipId === result[0].shipId,
      );
    await wait(() => !!motion(), "remote ship visible");
    const before = { ...motion()! };
    try {
      for (let n = 0; n < 8; n++) {
        await send(0, 0, 1, 0);
        await pause(75);
      }
    } finally {
      await send(0, 0, 0, 0);
    }
    await wait(
      () => Math.hypot(motion()!.x - before.x, motion()!.y - before.y) > 0.02,
      "second account sees thrust motion",
    );
    await c.reducers.leaveAuthoredPilot({});
    await wait(() => flight().seatState === "none", "pilot exit");
    await assert.rejects(send(0, 0, 1, 0));
    await send(0, 0, 0, 0);
    saved.after = result;
    saved.verifiedAt = new Date().toISOString();
    saved.walking = true;
    saved.pilot = true;
    saved.remoteMotion = true;
    saved.ordinaryReplacementDenied = true;
    writeFileSync(summary, encode(saved) + "\n", { mode: 0o600 });
    console.log(
      "Verified two replacements: character/appearance retained, fresh kits, exact source, walking, pilot, remote motion and operator-only denial",
    );
  }
} finally {
  for (const s of sessions) s.close();
}
