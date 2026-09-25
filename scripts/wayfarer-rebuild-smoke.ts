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
import { WAYFARER_REBUILD_SHA256 } from "../packages/sim/src/wayfarer-rebuild-contract";
import { WAYFARER_STARTER } from "@sidereal/content/wayfarer-starter";
import { constructionFlightIntentSender } from "./construction-flight-smoke";
import { walkTraversalActor } from "./traversal-smoke";
const host = process.env.SIDEREAL_SMOKE_URL;
const database = process.env.SIDEREAL_SMOKE_DATABASE;
const summaryFile =
  process.env.SIDEREAL_REBUILD_SUMMARY_FILE ?? process.env.SUMMARY_FILE;
const phase = process.env.SIDEREAL_REBUILD_PHASE ?? "integrate";
if (!summaryFile || !["integrate", "verify"].includes(phase))
  throw Error("Explicit SUMMARY_FILE and integrate/verify phase required");
if (
  !host ||
  !database?.includes("review-rebuild") ||
  !database.endsWith("-smoke")
)
  throw Error("Explicit isolated -smoke database required");
if (!(tables as any).ownWayfarerRebuildOffer)
  throw Error(
    "Generate SDK from the exact rebuild candidate before running this smoke",
  );
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

type Connected = Awaited<ReturnType<typeof connect>>;
const actor = (s: Connected) => [...s.connection.db.ownCharacters.iter()][0]!;
const access = (s: Connected) =>
  [...s.connection.db.ownGameShipAccess.iter()][0]!;
const flight = (s: Connected) =>
  [...s.connection.db.ownAuthoredFlights.iter()][0]!;
const motion = (s: Connected, id: string) =>
  [...s.connection.db.visibleShipMotion.iter()].find((r) => r.shipId === id)!;
const pause = (ms = 100) => new Promise((r) => setTimeout(r, ms));
function conserved(s: Connected) {
  const d = s.connection.db,
    order = <T extends { id: string }>(values: T[]) =>
      values.sort((a, b) => a.id.localeCompare(b.id));
  const instance = [...d.ownConstructionInstances.iter()][0]!;
  const doc = JSON.parse(instance.documentJson);
  return {
    actorId: actor(s).id,
    shipId: actor(s).shipId,
    deckId: access(s).deckId,
    items: order([...d.ownInventoryItems.iter()]),
    containers: order([...d.ownInventoryContainers.iter()]),
    hotbar: [...d.ownInventoryHotbar.iter()].sort((a, b) => a.slot - b.slot),
    inventoryStates: [...d.ownInventoryState.iter()],
    appearance: [...d.ownAppearance.iter()],
    fittings: order([...d.ownAuthoredFlightFittings.iter()]),
    stations: [...d.ownStations.iter()],
    admission: [...d.ownWorldAdmission.iter()],
    location: [...d.ownConstructionLocation.iter()],
    floors: order(doc.layout.tiles),
    objects: order(doc.layout.assembly?.parts ?? []),
    source: instance.blueprintSha256,
    revision: String(instance.revision),
  };
}
function requireConserved(
  before: ReturnType<typeof conserved>,
  after: ReturnType<typeof conserved>,
) {
  for (const key of [
    "actorId",
    "shipId",
    "deckId",
    "items",
    "containers",
    "hotbar",
    "inventoryStates",
    "appearance",
    "fittings",
    "stations",
    "admission",
    "location",
    "floors",
  ] as const)
    assert.equal(
      encode(after[key]),
      encode(before[key]),
      "Conservation: " + key,
    );
  for (const object of after.objects)
    assert.equal(
      encode(object),
      encode(before.objects.find((p: any) => p.id === object.id)),
      "Retained native object " + object.id,
    );
  assert.equal(after.source, WAYFARER_REBUILD_SHA256);
  assert.equal(after.revision, "2");
}
const offer = (s: Connected) =>
  [...(s.connection.db as any).ownWayfarerRebuildOffer.iter()][0];
const apply = (s: Connected, args: unknown) =>
  (s.connection.reducers as any).refitRebuiltWayfarer(args);
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
const senders = new Map<
  Connected,
  ReturnType<typeof constructionFlightIntentSender>
>();
const report: Record<string, unknown>[] = [];
const sendFor = (s: Connected) => {
  let send = senders.get(s);
  if (!send) {
    send = constructionFlightIntentSender(s.connection);
    senders.set(s, send);
  }
  return send;
};
const log = (entry: Record<string, unknown>) => {
  report.push(entry);
  console.log(encode(entry));
};
try {
  if (phase === "verify") {
    const saved = JSON.parse(readFileSync(summaryFile, "utf8"));
    assert.equal(saved.database, database);
    assert.equal(saved.target, WAYFARER_REBUILD_SHA256);
    for (let i = 0; i < 2; i++) {
      const s = await connect(tokens[i]);
      sessions.push(s);
      assert.equal(
        actor(s)?.id,
        saved.conserved[i].actorId,
        "Persisted actor missing; verify phase must not mint a replacement",
      );
      await s.connection.reducers.enterLab({
        name: "Persisted rebuilt Wayfarer",
      });
      await wait(
        () => !!access(s) && !!flight(s) && actor(s)?.connected,
        "restart owned rebuilt admission",
      );
      assert.equal(
        encode(conserved(s)),
        encode(saved.conserved[i]),
        "Restart must preserve accepted IDs/state",
      );
      assert.equal(access(s).templateSha256, WAYFARER_REBUILD_SHA256);
      assert.equal(flight(s).flightAdmitted, true);
      await apply(s, {
        ...saved.requests[i],
        expectedInstanceRevision: BigInt(
          saved.requests[i].expectedInstanceRevision,
        ),
        expectedShipRevision: BigInt(saved.requests[i].expectedShipRevision),
      });
      assert.equal(
        encode(conserved(s)),
        encode(saved.conserved[i]),
        "Persisted receipt replay",
      );
    }
    log({
      phase: "restart-verified",
      actors: sessions.map((s) => actor(s).id),
      independentInstances: 2,
      exactSource: WAYFARER_REBUILD_SHA256,
      receiptReplay: true,
    });
    writeFileSync(
      summaryFile,
      JSON.stringify(
        {
          ...saved,
          restartVerified: true,
          restartAt: new Date().toISOString(),
        },
        null,
        2,
      ) + "\n",
      { mode: 0o600 },
    );
  } else {
    const before: ReturnType<typeof conserved>[] = [],
      requests: any[] = [];
    for (let i = 0; i < 2; i++) {
      const s = await connect(tokens[i]);
      sessions.push(s);
      await s.connection.reducers.enterLab({
        name: i === 0 ? "Rebuild Alpha" : "Rebuild Beta",
      });
      await wait(
        () => !!access(s) && !!flight(s) && actor(s)?.connected,
        "original starter admission",
      );
      assert.equal(
        access(s).templateSha256,
        WAYFARER_STARTER.sha256,
        "Fresh original starter required; do not overwrite previous smoke state",
      );
      assert.equal([...s.connection.db.ownConstructionGrants.iter()].length, 0);
      const send = sendFor(s);
      const approach =
        Math.abs(actor(s).localX) < 0.15
          ? [[0, -2]]
          : [
              [-2, -1.5],
              [0, -1.5],
              [0, -2],
            ];
      for (const [x, y] of approach)
        await walkTraversalActor(s.connection, x, y, send);
      await send(0, 0);
      await pause(250);
      await wait(
        () => !!offer(s)?.eligible,
        "qualified refit offer: " + String(offer(s)?.reason ?? "pending"),
      );
      const o = offer(s);
      assert.equal(o.targetSha256, WAYFARER_REBUILD_SHA256);
      const args = {
        shipId: o.shipId,
        expectedInstanceRevision: o.expectedInstanceRevision,
        expectedShipRevision: o.expectedShipRevision,
        fingerprint: o.fingerprint,
        operationId: randomUUID(),
      };
      before.push(conserved(s));
      requests.push(args);
      await wait(
        () => !!motion(s, actor(s).shipId),
        "own original ship motion",
      );
      const m = { ...motion(s, actor(s).shipId) };
      await apply(s, args);
      await wait(
        () =>
          access(s)?.templateSha256 === WAYFARER_REBUILD_SHA256 &&
          [...s.connection.db.ownConstructionInstances.iter()][0]
            ?.blueprintSha256 === WAYFARER_REBUILD_SHA256,
        "refitted exact source",
      );
      requireConserved(before[i], conserved(s));
      const next = motion(s, actor(s).shipId);
      assert(next && m);
      for (const key of [
        "shipId",
        "systemId",
        "x",
        "y",
        "vx",
        "vy",
        "heading",
        "omega",
      ] as const)
        assert.equal(next[key], m[key], "Refit conserves motion " + key);
      await apply(s, args);
      requireConserved(before[i], conserved(s));
      await assert.rejects(
        apply(s, {
          ...args,
          expectedInstanceRevision: args.expectedInstanceRevision + 1n,
        }),
      );
      log({
        phase: "refit",
        actor: actor(s).id,
        ship: actor(s).shipId,
        source: WAYFARER_REBUILD_SHA256,
        items: before[i].items.length,
        containers: before[i].containers.length,
        retainedFittings: before[i].fittings.length,
        receiptReplay: true,
      });
    }
    const [alpha, beta] = sessions;
    assert.notEqual(actor(alpha).id, actor(beta).id);
    assert.notEqual(actor(alpha).shipId, actor(beta).shipId);
    for (const [s, foreign] of [
      [alpha, beta],
      [beta, alpha],
    ]) {
      assert(
        [...s.connection.db.ownConstructionInstances.iter()].every(
          (i) => i.id !== actor(foreign).shipId,
        ),
      );
      const foreignItems = new Set(conserved(foreign).items.map((i) => i.id));
      assert(conserved(s).items.every((i) => !foreignItems.has(i.id)));
    }
    await assert.rejects(apply(beta, requests[0]));
    for (const name of [
      "construction_instance",
      "construction_receipt",
      "game_ship_access",
      "inventory_item",
      "construction_flight_fitting",
    ])
      await denyPrivate(alpha, name);
    log({
      phase: "privacy",
      distinctActors: true,
      distinctInstances: true,
      crossOwnerRefitDenied: true,
      privateTablesDenied: true,
    });
    const c = alpha.connection,
      send = sendFor(alpha);
    // Drive into the solid port corridor at y=-2. The opening is at y=-5.
    await walkTraversalActor(c, 0, -2, send);
    try {
      for (let n = 0; n < 18; n++) {
        await send(-1, 0);
        await pause(70);
      }
    } finally {
      await send(0, 0);
    }
    assert(actor(alpha).localX > -1.6, "Actor crossed the solid new port wall");
    assert(
      actor(alpha).localX < -0.4,
      "Movement test never approached the wall",
    );
    const blockedPosition = [actor(alpha).localX, actor(alpha).localY];
    for (const [x, y] of [
      [0, -2],
      [0, -5],
      [-2.25, -5],
      [0, -5],
      [0, 7],
      [0, 9.375],
    ])
      await walkTraversalActor(c, x, y, send);
    log({
      phase: "walking",
      wallStoppedAt: blockedPosition,
      openPassageCrossed: true,
      cockpitApproach: true,
    });
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
      "rebuilt pilot seat",
    );
    const start = { ...motion(alpha, actor(alpha).shipId) };
    let thrust = false;
    try {
      for (let n = 0; n < 12; n++) {
        await send(0, 0, 1, 0);
        await pause(70);
        thrust ||= [...c.db.ownActuatorOutputs.iter()].some(
          (o) => o.throttle > 0,
        );
      }
    } finally {
      await send(0, 0, 0, 0);
    }
    assert(thrust, "Qualified fitted actuators did not fire");
    await wait(() => {
      const m = motion(beta, actor(alpha).shipId);
      return !!m && Math.hypot(m.x - start.x, m.y - start.y) > 0.05;
    }, "second account observes rebuilt flight motion");
    await c.reducers.leaveAuthoredPilot({});
    await wait(() => flight(alpha).seatState === "none", "rebuilt pilot exit");
    await assert.rejects(send(0, 0, 1, 0));
    await send(0, 0, 0, 0);
    log({
      phase: "pilot",
      qualifiedStation: true,
      remoteMotion: true,
      unseatedFlightDenied: true,
    });
    const saved = conserved(alpha);
    alpha.close();
    const reconnected = await connect(tokens[0]);
    sessions.push(reconnected);
    await reconnected.connection.reducers.enterLab({
      name: "Reconnect must retain rebuilt ship",
    });
    await wait(
      () => !!access(reconnected) && actor(reconnected)?.connected,
      "rebuilt reconnect",
    );
    assert.equal(encode(conserved(reconnected)), encode(saved));
    // Store bigint request revisions as decimal strings and restore them when verifying restart.
    const summary = {
      database,
      target: WAYFARER_REBUILD_SHA256,
      source: WAYFARER_STARTER.sha256,
      conserved: [conserved(reconnected), conserved(beta)],
      requests,
      checks: report,
      reconnect: true,
      at: new Date().toISOString(),
    };
    writeFileSync(
      summaryFile,
      JSON.stringify(
        summary,
        (_, v) => (typeof v === "bigint" ? v.toString() : v),
        2,
      ) + "\n",
      { mode: 0o600 },
    );
    log({
      phase: "complete",
      reconnect: true,
      actors: [actor(reconnected).id, actor(beta).id],
      target: WAYFARER_REBUILD_SHA256,
    });
  }
} finally {
  for (const [s, send] of senders) {
    try {
      await Promise.race([send(0, 0, 0, 0), pause(1000)]);
    } catch {}
    try {
      await Promise.race([
        s.connection.reducers.releaseInputControl({}),
        pause(1000),
      ]);
    } catch {}
  }
  for (const s of sessions) s.close();
}
