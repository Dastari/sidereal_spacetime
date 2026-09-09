/** Isolated real-provider helpers only. Caller owns tokens, database and cleanup. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { tables, type DbConnection } from "../packages/net/src/generated";
import {
  traversalWait as wait,
  walkTraversalActor,
  enterTraversalReview,
  traversalInventorySnapshot,
  requireTraversalInventoryUnchanged,
} from "./traversal-smoke";
const pause = (ms = 70) => new Promise((r) => setTimeout(r, ms));
const actor = (c: DbConnection) => [...c.db.ownCharacters.iter()][0]!;
const location = (c: DbConnection) =>
  [...c.db.ownConstructionLocation.iter()][0]!;
const flight = (c: DbConnection, id: string) =>
  [...c.db.ownAuthoredFlights.iter()].find((r) => r.shipId === id)!;
const ship = (c: DbConnection, id: string) =>
  [...c.db.ownShips.iter()].find((r) => r.id === id)!;
export async function subscribeConstructionFlight(c: DbConnection) {
  return new Promise<{ unsubscribe(): void }>((resolve, reject) => {
    const h = c
      .subscriptionBuilder()
      .onApplied(() => resolve(h))
      .onError(() => reject(Error("Flight subscription failed")))
      .subscribe([
        tables.ownShips,
        tables.ownActuatorOutputs,
        tables.ownWorldAdmission,
        tables.visibleShipMotion,
        tables.visibleShipDescriptions,
        tables.visibleBodyMotion,
        tables.visibleBodyDescriptions,
        tables.ownAuthoredFlights,
        tables.ownAuthoredFlightFittings,
      ]);
  });
}
export async function constructionFlightPrivateDenials(c: DbConnection) {
  const names = [
    "construction_flight_binding",
    "construction_flight_fitting",
    "construction_flight_station",
    "construction_flight_receipt",
    "construction_pilot_seat",
    "construction_flight_review",
  ];
  for (const name of names)
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error("Private flight table denial timed out")),
        5000,
      );
      c.subscriptionBuilder()
        .onApplied(() => {
          clearTimeout(timer);
          reject(Error("Private flight table exposed: " + name));
        })
        .onError(() => {
          clearTimeout(timer);
          resolve();
        })
        .subscribe("SELECT * FROM " + name);
    });
  return names;
}
export function constructionFlightIntentSender(c: DbConnection) {
  let sequence = 0n;
  let lease: Promise<unknown> | undefined;
  return async (dx: number, dy: number, throttle = 0, turn = 0) => {
    lease ??= c.reducers.claimInputControl({});
    await lease;
    return c.reducers.setIntent({
      sequence: ++sequence,
      dx,
      dy,
      throttle,
      turn,
      sprint: false,
    });
  };
}
export async function constructionFlightAuthorityJourney(
  c: DbConnection,
  instanceIds: readonly string[],
) {
  assert.equal(instanceIds.length, 2);
  const original = { ...actor(c) },
    oldShip = { ...ship(c, original.shipId) },
    inventory = traversalInventorySnapshot(c),
    admission = { ...[...c.db.ownWorldAdmission.iter()][0]! },
    ids = new Set<string>(),
    reports = [];
  const send = constructionFlightIntentSender(c);
  for (const id of instanceIds) {
    const beforeCount = [...c.db.ownShips.iter()].length;
    const install = {
      instanceId: id,
      expectedInstanceRevision: 1n,
      operationId: randomUUID(),
    };
    await c.reducers.installAuthoredShipFlight(install);
    await c.reducers.installAuthoredShipFlight(install);
    await wait(() => !!flight(c, id), "Installed authored flight status");
    assert.equal([...c.db.ownShips.iter()].length, beforeCount + 1);
    assert.equal(flight(c, id).lifecycle, "installed-dormant");
    assert.equal(flight(c, id).active, false);
    assert.equal(actor(c).shipId, original.shipId);
    assert.deepEqual(ship(c, original.shipId), oldShip);
    assert.equal(
      [...c.db.ownWorldAdmission.iter()][0]?.shipId,
      admission.shipId,
    );
    const activation = {
      shipId: id,
      expectedRevision: flight(c, id).revision,
      operationId: randomUUID(),
    };
    await c.reducers.activateAuthoredShipFlight(activation);
    await c.reducers.activateAuthoredShipFlight(activation);
    await wait(
      () => flight(c, id)?.active === true,
      "Explicit flight activation",
    );
    assert.equal(flight(c, id).flightAdmitted, false);
    await enterTraversalReview(c, id);
    await wait(
      () => flight(c, id).visitId === location(c).visitId,
      "Accepted static review status",
    );
    await assert.rejects(
      c.reducers.enterAuthoredPilot({
        stationId: flight(c, id).stationId,
        expectedStationRevision: flight(c, id).stationRevision,
        operationId: randomUUID(),
      }),
    );
    const v = location(c),
      join = {
        expectedVisitId: v.visitId,
        expectedVisitRevision: v.revision,
        expectedAdmissionRevision: flight(c, id).admissionRevision,
        operationId: randomUUID(),
      };
    await c.reducers.beginAuthoredFlightReview(join);
    await c.reducers.beginAuthoredFlightReview(join);
    await wait(
      () =>
        flight(c, id).flightAdmitted &&
        [...c.db.ownAuthoredFlightFittings.iter()].length === 10,
      "Accepted flight and independent fitting projection",
    );
    const fittings = [...c.db.ownAuthoredFlightFittings.iter()];
    for (const key of [flight(c, id).stationId, ...fittings.map((f) => f.id)]) {
      assert(!ids.has(key));
      ids.add(key);
    }
    assert.equal(fittings.filter((f) => f.kind === "actuator").length, 9);
    await wait(
      () => [...c.db.visibleBodyMotion.iter()].length > 0,
      "Shared space discovery from accepted construction flight",
    );
    for (const [x, y] of [
      [-2, -1.5],
      [0, -1.5],
      [0, 7],
      [0, 9.375],
    ])
      await walkTraversalActor(c, x, y, send);
    const enter = {
      stationId: flight(c, id).stationId,
      expectedStationRevision: flight(c, id).stationRevision,
      operationId: randomUUID(),
    };
    await c.reducers.enterAuthoredPilot(enter);
    await c.reducers.enterAuthoredPilot(enter);
    await wait(
      () => flight(c, id).seatState === "seated",
      "Native pilot seating",
    );
    assert.equal(actor(c).localX, 0);
    assert.equal(actor(c).localY, 10.25);
    const start = { ...ship(c, id) };
    let positiveTelemetry = false;
    for (let n = 0; n < 12; n++) {
      await send(0, 0, 1, 0);
      await pause();
      positiveTelemetry ||= [...c.db.ownActuatorOutputs.iter()].some(
        (o) => o.shipId === id && o.throttle > 0,
      );
    }
    await send(0, 0, 0, 0);
    await wait(
      () => Math.hypot(ship(c, id).x - start.x, ship(c, id).y - start.y) > 0.05,
      "Accepted authored shared flight motion",
    );
    assert(
      positiveTelemetry,
      "Fresh actuator telemetry must show accepted thrust",
    );
    assert.deepEqual(
      ship(c, original.shipId),
      oldShip,
      "Original ship not refit/moved by authored review",
    );
    await c.reducers.leaveAuthoredPilot({});
    await wait(
      () => flight(c, id).seatState === "none",
      "Supported native pilot exit",
    );
    assert(Math.hypot(actor(c).localX, actor(c).localY - 9.375) < 0.01);
    await assert.rejects(send(0, 0, 1, 0));
    await pause(150);
    await send(0, 0, 0, 0);
    await wait(
      () =>
        [...c.db.ownActuatorOutputs.iter()]
          .filter((o) => o.shipId === id)
          .every((o) => o.throttle === 0),
      "Unseated input cannot drive thrust",
    );
    const current = location(c),
      leave = {
        expectedVisitId: current.visitId,
        expectedVisitRevision: current.revision,
        expectedAdmissionRevision: flight(c, id).admissionRevision,
        operationId: randomUUID(),
      };
    await c.reducers.returnAuthoredFlightReview(leave);
    await c.reducers.returnAuthoredFlightReview(leave);
    await wait(
      () => actor(c).shipId === original.shipId && !location(c),
      "Saved original ship return",
    );
    assert.equal(actor(c).id, original.id);
    assert.equal(actor(c).localX, original.localX);
    assert.equal(actor(c).localY, original.localY);
    requireTraversalInventoryUnchanged(c, inventory);
    assert.equal(
      [...c.db.ownWorldAdmission.iter()][0]?.shipId,
      original.shipId,
    );
    assert.equal([...c.db.ownAuthoredFlightFittings.iter()].length, 0);
    reports.push({
      instanceId: id,
      stationId: enter.stationId,
      deviceIds: fittings.map((f) => f.id),
      explicitActivation: true,
      staticReviewCannotPilot: true,
      sharedDiscovery: true,
      nativeSeatPose: [0, 10.25],
      acceptedMotionDistance: Math.hypot(
        ship(c, id).x - start.x,
        ship(c, id).y - start.y,
      ),
      freshTelemetry: true,
      unseatedThrustDenied: true,
      originalShipAndInventoryPreserved: true,
    });
  }
  assert.equal(ids.size, 22);
  return {
    actorId: original.id,
    originalShipId: original.shipId,
    independentFlightIdentities: ids.size,
    journeys: reports,
  };
}
