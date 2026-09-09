/** Real-provider additive legacy317c→native refit acceptance. No admin grants,
 * direct world writes, reset, account creation or service lifecycle here. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { DbConnection, tables } from "../packages/net/src/generated";
import { bindGameSessionProof } from "../packages/net/src/game-session-proof";
import { constructionFlightIntentSender } from "./construction-flight-smoke";
import { walkTraversalActor, traversalWait as wait } from "./traversal-smoke";
const host = process.env.SIDEREAL_SMOKE_URL,
  database = process.env.SIDEREAL_SMOKE_DATABASE,
  file = process.env.SIDEREAL_PROVIDER_ALPHA,
  phase = process.env.SIDEREAL_REFIT_PHASE;
if (
  !host ||
  !database?.endsWith("-smoke") ||
  !database.includes("-review-refit-") ||
  !file ||
  !["seed", "convert", "pilot", "reconnect", "privacy"].includes(phase ?? "")
)
  throw Error(
    "Explicit isolated refit database, provider file and phase required",
  );
const token = JSON.parse(readFileSync(file, "utf8")).id_token;
if (typeof token !== "string")
  throw Error("Original provider ID token required");
const json = (v: unknown) =>
  JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x));
const baselinePath =
  process.env.SIDEREAL_REFIT_BASELINE ??
  ".runtime/refit-provider-baseline.json";
let connection: DbConnection | undefined;
try {
  connection = await new Promise<DbConnection>((resolve, reject) => {
    const c = DbConnection.builder()
      .withUri(host)
      .withDatabaseName(database)
      .withToken(token)
      .onConnect(async (c) => {
        try {
          await bindGameSessionProof({
            origin: host,
            database,
            connectionId: c.connectionId!.toHexString(),
            token,
            signal: AbortSignal.timeout(12000),
          });
          c.subscriptionBuilder()
            .onApplied(() => resolve(c))
            .onError(() => reject(Error("Refit private subscription rejected")))
            .subscribe([
              tables.ownCharacters,
              tables.ownShips,
              tables.ownStations,
              tables.ownAppearance,
              tables.ownInventoryState,
              tables.ownInventoryItems,
              tables.ownInventoryContainers,
              tables.ownInventoryHotbar,
              tables.ownWorldAdmission,
            ]);
        } catch {
          reject(Error("Provider admission failed"));
        }
      })
      .onConnectError(() => reject(Error("Provider socket failed")))
      .build();
    connection = c;
  });
  const c = connection,
    actor = () => [...c.db.ownCharacters.iter()][0]!,
    station = () => [...c.db.ownStations.iter()][0]!,
    send = constructionFlightIntentSender(c);
  if (phase === "privacy") {
    assert.equal([...c.db.ownCharacters.iter()].length, 0);
    await new Promise<void>((resolve, reject) =>
      c
        .subscriptionBuilder()
        .onApplied(() => resolve())
        .onError(() => reject(Error("Privacy view subscribe failed")))
        .subscribe([
          tables.ownWayfarerRefitAttachments,
          tables.ownWayfarerRefitOffer,
          tables.ownReachableCargoContainers,
        ]),
    );
    assert.equal([...c.db.ownWayfarerRefitAttachments.iter()].length, 0);
    assert.equal([...c.db.ownWayfarerRefitOffer.iter()].length, 0);
    assert.equal([...c.db.ownReachableCargoContainers.iter()].length, 0);
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
    await assert.rejects(
      c.reducers.refitExistingWayfarer({
        shipId: baseline.actor.shipId,
        expectedShipRevision: 1n,
        expectedInventoryRevision: 1n,
        fingerprint: "0".repeat(64),
        operationId: randomUUID(),
      }),
    );
    for (const name of [
      "wayfarer_refit_receipt",
      "wayfarer_refit_attachment",
      "wayfarer_liquid_receipt",
      "inventory_container",
    ]) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(Error("Private base denial timed out")),
          5000,
        );
        c.subscriptionBuilder()
          .onApplied(() => {
            clearTimeout(timer);
            reject(Error("Private base exposed"));
          })
          .onError(() => {
            clearTimeout(timer);
            resolve();
          })
          .subscribe("SELECT * FROM " + name);
      });
    }
    console.log(
      json({
        phase,
        foreignRefitDenied: true,
        privateViewsEmpty: true,
        privateBaseDenials: 4,
      }),
    );
  } else if (phase === "seed") {
    assert.equal(
      [...c.db.ownCharacters.iter()].length,
      0,
      "Pre-upgrade fixture must be genuinely fresh",
    );
    await c.reducers.enterLab({ name: "Refit Legacy Review" });
    await wait(() => !!actor(), "legacy actor");
    await c.reducers.claimStarterKit({});
    if (station()?.occupantId === actor().id) await c.reducers.useStation({});
    await wait(() => !station()?.occupantId, "standing legacy actor");
    await walkTraversalActor(c, 0, 7, send);
    await send(0, 0);
    const appearance = [...c.db.ownAppearance.iter()][0];
    await c.reducers.setCharacterAppearance({
      appearanceJson: JSON.stringify({
        bodyType: "female",
        hairStyle: "braids",
      }),
      expectedRevision: appearance?.revision ?? 0n,
      operationId: randomUUID(),
    });
    const snapshot = {
      actor: {
        id: actor().id,
        shipId: actor().shipId,
        x: actor().localX,
        y: actor().localY,
      },
      stationId: station().id,
      appearance: [...c.db.ownAppearance.iter()],
      visibleItems: [...c.db.ownInventoryItems.iter()].map((i) => i.id).sort(),
    };
    writeFileSync(baselinePath, json(snapshot), { mode: 0o600, flag: "wx" });
    console.log(
      json({
        phase,
        actor: snapshot.actor,
        stationId: snapshot.stationId,
        visibleItems: snapshot.visibleItems.length,
      }),
    );
  } else {
    await c.reducers.enterLab({ name: "Ignored reconnect name" });
    await new Promise<void>((resolve, reject) =>
      c
        .subscriptionBuilder()
        .onApplied(() => resolve())
        .onError(() => reject(Error("Refit view subscription failed")))
        .subscribe([
          tables.ownWayfarerRefitOffer,
          tables.ownWayfarerRefitAttachments,
          tables.ownGameShipAccess,
          tables.ownConstructionInstances,
          tables.ownConstructionDecks,
          tables.ownConstructionLocation,
          tables.ownAuthoredFlights,
          tables.ownAuthoredFlightFittings,
          tables.ownActuatorOutputs,
          tables.ownReachableCargoContainers,
          tables.ownReachableCargoItems,
          tables.ownCarriedInventoryRevisions,
        ]),
    );
    const before = JSON.parse(readFileSync(baselinePath, "utf8"));
    assert.equal(actor().id, before.actor.id);
    assert.equal(actor().shipId, before.actor.shipId);
    assert.equal(station().id, before.stationId);
    assert.deepEqual(
      JSON.parse(json([...c.db.ownAppearance.iter()])),
      before.appearance,
    );
    if (phase === "convert") {
      const offer = [...c.db.ownWayfarerRefitOffer.iter()][0]!;
      assert.equal(offer.status, "ready");
      const request = {
        shipId: offer.shipId,
        expectedShipRevision: offer.expectedShipRevision,
        expectedInventoryRevision: offer.expectedInventoryRevision,
        fingerprint: offer.fingerprint,
        operationId: randomUUID(),
      };
      await c.reducers.refitExistingWayfarer(request);
      await c.reducers.refitExistingWayfarer(request);
      await wait(
        () => !![...c.db.ownGameShipAccess.iter()][0],
        "permanent converted access",
      );
      const outputs = [...c.db.ownActuatorOutputs.iter()];
      const actuators = [...c.db.ownAuthoredFlightFittings.iter()].filter(
        (r) => r.kind === "actuator",
      );
      assert.equal(outputs.length, 9, "no duplicate legacy output projections");
      assert.deepEqual(
        outputs.map((r) => r.actuatorId).sort(),
        actuators.map((r) => r.id).sort(),
      );
      assert.ok(
        outputs.every((r) => r.throttle === 0),
        "released controls have zero telemetry",
      );
      assert.equal(actor().localX, before.actor.x);
      assert.equal(actor().localY, before.actor.y);
      const attachments = [...c.db.ownWayfarerRefitAttachments.iter()];
      assert.equal(attachments.length, 1);
      assert.equal(attachments[0]!.assetId, "part-81d226967abf2efefc20");
      await c.reducers.claimStarterKit({});
      await walkTraversalActor(c, -1.875, 7, send);
      await send(0, 0);
      await wait(
        () =>
          [...c.db.ownReachableCargoContainers.iter()].some(
            (r) => r.id === attachments[0]!.containerId,
          ),
        "reachable preserved fuel",
      );
      const tank = [...c.db.ownReachableCargoContainers.iter()].find(
        (r) => r.id === attachments[0]!.containerId,
      )!;
      assert.equal(tank.capacityLitres, 100);
      assert.equal(tank.amountLitres, 20);
      const canister = [...c.db.ownInventoryContainers.iter()].find(
        (r) => r.kind === "liquid" && r.parentItemId,
      )!;
      const revisions = () => [...c.db.ownCarriedInventoryRevisions.iter()],
        state = () => [...c.db.ownInventoryState.iter()][0]!;
      const pour = {
        sourceId: tank.id,
        destinationId: canister.id,
        litres: 1,
        expectedSourceRevision: tank.revision,
        expectedDestinationRevision: revisions().find(
          (r) => r.id === canister.id,
        )!.revision,
        expectedInventoryRevision: state().revision,
        operationId: randomUUID(),
      };
      await c.reducers.transferWayfarerLiquid(pour);
      await c.reducers.transferWayfarerLiquid(pour);
      await wait(
        () =>
          [...c.db.ownReachableCargoContainers.iter()].find(
            (r) => r.id === tank.id,
          )?.amountLitres === 19,
        "conserved pour",
      );
      const back = {
        sourceId: canister.id,
        destinationId: tank.id,
        litres: 1,
        expectedSourceRevision: revisions().find((r) => r.id === canister.id)!
          .revision,
        expectedDestinationRevision: [
          ...c.db.ownReachableCargoContainers.iter(),
        ].find((r) => r.id === tank.id)!.revision,
        expectedInventoryRevision: state().revision,
        operationId: randomUUID(),
      };
      await c.reducers.transferWayfarerLiquid(back);
      await wait(
        () =>
          [...c.db.ownReachableCargoContainers.iter()].find(
            (r) => r.id === tank.id,
          )?.amountLitres === 20,
        "restored fuel balance",
      );
      console.log(
        json({
          phase,
          actorId: actor().id,
          shipId: actor().shipId,
          stationId: station().id,
          attachmentId: attachments[0]!.id,
          liquidRoundTrip: true,
          nativeActuatorOutputs: outputs.length,
          kitReplay: true,
        }),
      );
    } else if (phase === "pilot") {
      for (const [x, y] of [
        [0, 7],
        [0, 9.375],
      ])
        await walkTraversalActor(c, x!, y!, send);
      const flight = () => [...c.db.ownAuthoredFlights.iter()][0]!;
      const originalStation = station().id;
      await c.reducers.enterAuthoredPilot({
        stationId: originalStation,
        expectedStationRevision: flight().stationRevision,
        operationId: randomUUID(),
      });
      await wait(
        () => flight().seatState === "seated",
        "refitted original station grants native pilot control",
      );
      for (let n = 0; n < 12; n++) {
        await send(0, 0, 1, 0);
        await new Promise((r) => setTimeout(r, 60));
      }
      assert.equal([...c.db.ownActuatorOutputs.iter()].length, 9);
      assert.ok(
        [...c.db.ownActuatorOutputs.iter()].some((r) => r.throttle > 0),
      );
      await send(0, 0);
      await c.reducers.leaveAuthoredPilot({
        stationId: originalStation,
        expectedStationRevision: flight().stationRevision,
        operationId: randomUUID(),
      });
      await wait(
        () => flight().seatState !== "seated",
        "refitted pilot releases control",
      );
      await wait(
        () =>
          [...c.db.ownActuatorOutputs.iter()].every((r) => r.throttle === 0),
        "released native outputs zero",
      );
      assert.equal(station().id, before.stationId);
      console.log(
        json({
          phase,
          originalStationPreserved: true,
          acceptedThrust: true,
          nativeActuatorOutputs: 9,
          released: true,
        }),
      );
    } else {
      assert.equal([...c.db.ownGameShipAccess.iter()].length, 1);
      assert.equal([...c.db.ownWayfarerRefitAttachments.iter()].length, 1);
      console.log(
        json({
          phase,
          actorId: actor().id,
          shipId: actor().shipId,
          stationId: station().id,
          appearancePreserved: true,
        }),
      );
    }
  }
} finally {
  connection?.disconnect();
}
