/** Real websocket clients and production reducers against an already published,
 * isolated smoke database. No client-authored flight transforms or damage. */
import assert from "node:assert/strict";
import { DbConnection, tables } from "../packages/net/src/generated";
import {
  enterNativePilot,
  nextSequence,
  walkNative,
} from "./native-starter-smoke";
import { toCenterOfMassMotion } from "../packages/sim/src/flight-frame";
const host = process.env.SIDEREAL_SMOKE_URL,
  database = process.env.SIDEREAL_SMOKE_DATABASE;
if (!host || !database?.endsWith("-smoke"))
  throw Error(
    "IFCS passenger smoke requires explicit isolated smoke environment",
  );
async function wait(fn: () => boolean, label: string) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw Error("Timeout: " + label);
}
async function client(name: string) {
  let ready = false;
  const c = DbConnection.builder()
    .withUri(host!)
    .withDatabaseName(database!)
    .onConnect((c) => {
      c.subscriptionBuilder()
        .onApplied(() => {
          ready = true;
        })
        .subscribe([
          tables.ownCharacters,
          tables.ownShips,
          tables.ownStations,
          tables.ownGameShipAccess,
          tables.ownConstructionLocation,
          tables.ownAuthoredFlights,
          tables.ownAuthoredFlightFittings,
          tables.ownAuthoredFlightPowerFittings,
          tables.ownAuthoredFlightPhysics,
          tables.ownAuthoredFlightActuators,
          tables.ownActuatorOutputs,
          tables.ownWorldAdmission,
          tables.visibleShipMotion,
          tables.ownPassengerGrants,
          tables.ownPassengerVisit,
          tables.currentPassengerInterior,
          tables.currentInteriorCrew,
          tables.ownInventoryItems,
          tables.ownInventoryContainers,
          tables.ownInventoryState,
          tables.ownGroundItems,
        ]);
    })
    .build();
  await wait(() => ready, "subscription");
  await c.reducers.enterLab({ name });
  await c.reducers.claimInputControl({});
  await wait(
    () =>
      c.db.ownShips.count() === 1n &&
      c.db.ownConstructionLocation.count() === 1n,
    "native admission",
  );
  return c;
}
const actor = (c: DbConnection) => [...c.db.ownCharacters.iter()][0]!;
const flight = (c: DbConnection) =>
  [...c.db.ownAuthoredFlights.iter()].find(
    (f) => f.shipId === actor(c).shipId,
  )!;
const physics = (c: DbConnection, id: string) =>
  [...c.db.ownAuthoredFlightPhysics.iter()].find((p) => p.shipId === id)!;
const ids = (c: DbConnection) => ({
  items: [...c.db.ownInventoryItems.iter()].map((x) => x.id).sort(),
  containers: [...c.db.ownInventoryContainers.iter()].map((x) => x.id).sort(),
});
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function intent(
  c: DbConnection,
  throttle: number,
  turn: number,
  dx = 0,
  dy = 0,
) {
  await c.reducers.setIntent({
    sequence: nextSequence(c),
    throttle,
    turn,
    dx,
    dy,
    sprint: false,
  });
}
const a = await client("IFCS captain"),
  b = await client("IFCS passenger");
try {
  const shipId = actor(a).shipId,
    sourceShipId = actor(b).shipId,
    passengerId = actor(b).id,
    inventory = ids(b);
  await wait(
    () => physics(a, shipId)?.status === "ready",
    "initial physical definition",
  );
  // Move actual versioned cargo from a dropped ground root into carried storage
  // while both accepted actor poses and the authored ship frame stay still.
  const cargo = [...a.db.ownInventoryItems.iter()][0]!;
  assert(cargo, "starter carries real inventory mass");
  const spawn = { x: actor(a).localX, y: actor(a).localY };
  const inventoryRevision = () =>
    [...a.db.ownInventoryState.iter()][0]!.revision;
  await a.reducers.dropInventoryItem({
    itemId: cargo.id,
    expectedRevision: inventoryRevision(),
    operationId: crypto.randomUUID(),
  });
  await wait(
    () => [...a.db.ownGroundItems.iter()].some((i) => i.id === cargo.id),
    "cargo dropped through validated transaction",
  );
  await walkNative(a, spawn.x + 0.9, spawn.y);
  await wait(
    () => physics(a, shipId).status === "ready",
    "crew placement before cargo transfer",
  );
  const beforeCargo = { ...physics(a, shipId) },
    frameBefore = { ...[...a.db.ownShips.iter()][0]! },
    poseBefore = { ...actor(a) },
    passengerPoseBefore = { ...actor(b) };
  await a.reducers.transferInventoryItem({
    itemId: cargo.id,
    containerId: "",
    expectedRevision: inventoryRevision(),
    operationId: crypto.randomUUID(),
  });
  await wait(
    () =>
      physics(a, shipId).status === "ready" &&
      physics(a, shipId).revision > beforeCargo.revision,
    "cargo transfer physical compilation",
  );
  assert(
    Math.abs(physics(a, shipId).centerX - beforeCargo.centerX) > 1e-7,
    "moving real cargo shifts COM",
  );
  assert(
    Math.abs(physics(a, shipId).massKg - beforeCargo.massKg) < 1e-8,
    "cargo mass is conserved exactly once",
  );
  const afterFrame = [...a.db.ownShips.iter()][0]!;
  assert.deepEqual(
    [afterFrame.x, afterFrame.y, afterFrame.heading],
    [frameBefore.x, frameBefore.y, frameBefore.heading],
    "cargo transfer does not translate the authored frame",
  );
  assert.deepEqual(actor(a), poseBefore);
  assert.deepEqual(actor(b), passengerPoseBefore);
  await walkNative(a, spawn.x, spawn.y);
  await wait(() => physics(a, shipId).status === "ready", "cargo test settled");
  const initialMass = physics(a, shipId).massKg;
  assert.equal(b.db.currentPassengerInterior.count(), 0n);
  const access = [...a.db.ownGameShipAccess.iter()][0]!;
  await a.reducers.grantShipPassenger({
    shipId,
    granteeId: passengerId,
    expectedInstanceRevision: access.revision,
    expectedFlightRevision: flight(a).revision,
    durationSeconds: 180,
    operationId: crypto.randomUUID(),
  });
  await wait(
    () => b.db.ownPassengerGrants.count() === 1n,
    "explicit recipient invitation",
  );
  const grant = [...b.db.ownPassengerGrants.iter()][0]!,
    l = [...b.db.ownConstructionLocation.iter()][0]!,
    m = [...b.db.ownWorldAdmission.iter()][0]!;
  await b.reducers.boardShipPassenger({
    grantId: grant.id,
    expectedGrantRevision: grant.revision,
    expectedVisitId: l.visitId,
    expectedLocationRevision: l.revision,
    expectedAdmissionRevision: m.revision,
    operationId: crypto.randomUUID(),
  });
  await wait(
    () =>
      actor(b).shipId === shipId &&
      b.db.currentPassengerInterior.count() === 1n &&
      physics(a, shipId).status === "ready" &&
      physics(a, shipId).massKg > initialMass,
    "passenger mass and admission",
  );
  const boardedMass = physics(a, shipId).massKg;
  assert.equal(b.db.ownShips.count(), 1n);
  assert.equal([...b.db.ownShips.iter()][0]!.id, sourceShipId);
  assert.equal(
    [...b.db.ownAuthoredFlightFittings.iter()].filter(
      (f) => f.shipId === shipId,
    ).length,
    0,
  );
  assert.equal(
    [...b.db.ownActuatorOutputs.iter()].filter((f) => f.shipId === shipId)
      .length,
    0,
  );
  assert.equal(a.db.currentInteriorCrew.count(), 2n);
  assert.equal(b.db.currentInteriorCrew.count(), 2n);
  await assert.rejects(
    b.reducers.enterAuthoredPilot({
      stationId: flight(a).stationId,
      expectedStationRevision: flight(a).stationRevision,
      operationId: crypto.randomUUID(),
    }),
  );
  const engine = [...a.db.ownAuthoredFlightFittings.iter()].find(
    (f) => f.sourceDeviceId === "drives-main--3.6",
  )!;
  assert(engine, "actual placed side engine");
  await a.reducers.changeShipFlightFitting({
    shipId,
    fittingId: engine.id,
    action: "remove",
    expectedRevision: flight(a).revision,
    expectedFittingRevision: 1n,
    operationId: crypto.randomUUID(),
  });
  await wait(
    () =>
      physics(a, shipId).status === "ready" &&
      physics(a, shipId).massKg < boardedMass &&
      ![...a.db.ownAuthoredFlightActuators.iter()].some(
        (d) => d.id === engine.id,
      ),
    "removed engine compiled out",
  );
  const removedMass = boardedMass - physics(a, shipId).massKg;
  await enterNativePilot(a, true);
  const beforeWalk = { x: actor(b).localX, y: actor(b).localY },
    centerBefore = physics(a, shipId).centerX;
  for (let n = 0; n < 14; n++) {
    await intent(a, 0, 1);
    await intent(b, 0, 0, 0.2, 0);
    await pause(65);
  }
  await intent(b, 0, 0);
  await wait(
    () => Math.abs([...a.db.ownShips.iter()][0]!.omega) > 0.01,
    "asymmetric ship turns",
  );
  assert(
    Math.hypot(actor(b).localX - beforeWalk.x, actor(b).localY - beforeWalk.y) >
      0.1,
    "passenger walks during turn",
  );
  await wait(
    () => physics(a, shipId).status === "ready",
    "walking crew recompiled",
  );
  assert.notEqual(physics(a, shipId).centerX, centerBefore);
  assert.deepEqual(
    ids(b),
    inventory,
    "boarding/walking preserve item/container identities",
  );
  const active = [...a.db.ownAuthoredFlightPowerFittings.iter()].filter(
    (f) => f.kind === "actuator" && f.id !== engine.id,
  );
  async function power(connected: boolean) {
    for (const e of active) {
      const revision = flight(a).revision;
      await a.reducers.setConstructionEnginePower({
        shipId,
        enginePlacedObjectId: e.placedObjectId,
        connected,
        expectedRevision: revision,
        operationId: crypto.randomUUID(),
      });
      await wait(() => flight(a).revision > revision, "power revision");
    }
  }
  await power(false);
  await wait(
    () =>
      physics(a, shipId).status === "ready" &&
      Object.values(JSON.parse(physics(a, shipId).envelopeJson)).every(
        (v) => v === 0,
      ),
    "zero powered envelope after removal",
  );
  await intent(a, 1, 1);
  await pause(150);
  const c0 = toCenterOfMassMotion(
    [...a.db.ownShips.iter()][0]!,
    physics(a, shipId),
  );
  for (let n = 0; n < 4; n++) {
    await intent(a, 1, 1);
    await pause(65);
  }
  const c1 = toCenterOfMassMotion(
    [...a.db.ownShips.iter()][0]!,
    physics(a, shipId),
  );
  assert(
    Math.abs(c0.vx - c1.vx) < 1e-9 &&
      Math.abs(c0.vy - c1.vy) < 1e-9 &&
      Math.abs(c0.omega - c1.omega) < 1e-12,
    "no powered engine means coasting despite fresh pilot input",
  );
  assert([...a.db.ownActuatorOutputs.iter()].every((o) => o.throttle === 0));
  await power(true);
  const computer = [...a.db.ownAuthoredFlightPowerFittings.iter()].find(
    (f) => f.kind === "computer",
  )!;
  async function computerPower(connected: boolean) {
    const revision = flight(a).revision;
    await a.reducers.setConstructionComputerPower({
      shipId,
      computerPlacedObjectId: computer.placedObjectId,
      connected,
      expectedRevision: revision,
      operationId: crypto.randomUUID(),
    });
    await wait(
      () =>
        flight(a).revision > revision && physics(a, shipId).status === "ready",
      "computer circuit compiled",
    );
  }
  await intent(a, 1, 0);
  await wait(
    () => [...a.db.ownActuatorOutputs.iter()].some((o) => o.throttle > 0),
    "powered computer commands thrust",
  );
  await computerPower(false);
  await wait(
    () => [...a.db.ownActuatorOutputs.iter()].every((o) => o.throttle === 0),
    "unpowered computer cuts all actuation",
  );
  await assert.rejects(
    () => intent(a, 1, 1),
    "unpowered computer rejects fresh pilot intent",
  );
  const off0 = toCenterOfMassMotion(
    [...a.db.ownShips.iter()][0]!,
    physics(a, shipId),
  );
  await pause(250);
  const off1 = toCenterOfMassMotion(
    [...a.db.ownShips.iter()][0]!,
    physics(a, shipId),
  );
  assert(
    Math.abs(off0.vx - off1.vx) < 1e-9 &&
      Math.abs(off0.vy - off1.vy) < 1e-9 &&
      Math.abs(off0.omega - off1.omega) < 1e-12,
    "unpowered computer coasts",
  );
  await computerPower(true);
  await intent(a, 1, 0);
  await wait(
    () => [...a.db.ownActuatorOutputs.iter()].some((o) => o.throttle > 0),
    "restored computer accepts fresh pilot intent",
  );
  await intent(a, 0, 0);
  await a.reducers.revokeShipPassenger({
    grantId: grant.id,
    expectedRevision: grant.revision,
    operationId: crypto.randomUUID(),
  });
  await wait(
    () =>
      actor(b).shipId === sourceShipId &&
      b.db.currentPassengerInterior.count() === 0n,
    "revocation and supported return",
  );
  assert.deepEqual(ids(b), inventory);
  console.log(
    JSON.stringify(
      {
        database,
        shipId,
        passengerId,
        initialMass,
        boardedMass,
        removedMass,
        cargoMovesCOMWithoutFrameTranslation: true,
        passengerWalkingDuringAsymmetricTurn: true,
        ownerOnlyPilotChecks: true,
        boundedPowerAfterRemoval: true,
        noPoweredEngineCoasts: true,
        unpoweredComputerCutsActuation: true,
        unpoweredComputerRejectsIntentAndCoasts: true,
        restoredComputerRequiresFreshIntent: true,
        revocationReturnsWithoutInventoryLoss: true,
      },
      null,
      2,
    ),
  );
} finally {
  a.disconnect();
  b.disconnect();
}
