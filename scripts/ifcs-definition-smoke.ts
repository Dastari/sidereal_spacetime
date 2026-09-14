/** Fixed server event injection exists only in the isolated copied module.
 * Actual production damage consumption, compiler, resolver and physics run. */
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { enterNativePilot, nextSequence } from "./native-starter-smoke";
import { toCenterOfMassMotion } from "../packages/sim/src/flight-frame";
const host = process.env.SIDEREAL_SMOKE_URL,
  database = process.env.SIDEREAL_SMOKE_DATABASE,
  bindings = process.env.SIDEREAL_IFCS_TEST_BINDINGS;
if (
  !host ||
  !database?.endsWith("-smoke") ||
  !bindings ||
  !resolve(bindings).startsWith(resolve(".runtime/smoke-runs") + "/")
)
  throw Error("Reserved isolated IFCS module bindings required");
const { DbConnection, tables } = await import(pathToFileURL(bindings).href);
async function wait(fn: () => boolean, label: string) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw Error("Timeout: " + label);
}
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
let ready = false;
const c = DbConnection.builder()
  .withUri(host)
  .withDatabaseName(database)
  .onConnect((c: any) =>
    c
      .subscriptionBuilder()
      .onApplied(() => {
        ready = true;
      })
      .subscribe([
        tables.ownCharacters,
        tables.ownShips,
        tables.ownStations,
        tables.ownGameShipAccess,
        tables.ownConstructionLocation,
        tables.ownWorldAdmission,
        tables.ownAuthoredFlights,
        tables.ownAuthoredFlightFittings,
        tables.ownAuthoredFlightPhysics,
        tables.ownAuthoredFlightActuators,
        tables.ownActuatorOutputs,
      ]),
  )
  .build();
const first = (table: any): any => [...table.iter()][0];
const ship = () => first(c.db.ownShips),
  physical = () => first(c.db.ownAuthoredFlightPhysics),
  flight = () => first(c.db.ownAuthoredFlights);
async function command(throttle: number) {
  await c.reducers.setIntent({
    sequence: nextSequence(c),
    throttle,
    turn: 0,
    dx: 0,
    dy: 0,
    sprint: false,
  });
}
async function burn() {
  const oldTick = ship().tick;
  await command(1);
  await wait(() => ship().tick > oldTick, "first powered sample");
  const p = physical(),
    before = toCenterOfMassMotion(ship(), p),
    tick = ship().tick;
  for (let n = 0; n < 12; n++) {
    await command(1);
    await pause(65);
  }
  const after = toCenterOfMassMotion(ship(), p),
    seconds = Number(ship().tick - tick) * 0.05;
  assert(seconds > 0, "accepted simulation time advances");
  return Math.hypot(after.vx - before.vx, after.vy - before.vy) / seconds;
}
async function stop() {
  for (let n = 0; n < 140; n++) {
    await command(0);
    await pause(50);
    const m = toCenterOfMassMotion(ship(), physical());
    if (Math.hypot(m.vx, m.vy) < 0.0001 && Math.abs(m.omega) < 1e-5) return;
  }
  throw Error("Braking did not settle");
}
try {
  await wait(() => ready, "subscription");
  await c.reducers.enterLab({ name: "IFCS server-event pilot" });
  await c.reducers.claimInputControl({});
  await wait(
    () => c.db.ownShips.count() === 1n && physical()?.status === "ready",
    "physical admission",
  );
  await enterNativePilot(c, true);
  await wait(
    () => physical().status === "ready",
    "seated physical compilation",
  );
  const mass = physical().massKg,
    initialEnvelope = JSON.parse(physical().envelopeJson),
    initialAcceleration = await burn();
  await stop();
  const fitting = [...c.db.ownAuthoredFlightFittings.iter()].find(
    (f: any) => f.sourceDeviceId === "drives-main--3.6",
  ) as any;
  const beforeRevision = physical().revision;
  await c.reducers.requestIfcsSmokeEvent({
    shipId: ship().id,
    fittingId: fitting.id,
    kind: "damage",
  });
  await wait(
    () => physical().status === "ready" && physical().revision > beforeRevision,
    "production server damage consumed and compiled",
  );
  const damagedEnvelope = JSON.parse(physical().envelopeJson),
    damagedAcceleration = await burn();
  assert.equal(physical().massKg, mass, "damage retains all physical mass");
  assert(
    damagedEnvelope.forward < initialEnvelope.forward,
    "damage lowers derived force capacity",
  );
  assert(
    damagedAcceleration < initialAcceleration * 0.95,
    `damaged nozzle yields less actual acceleration (${initialAcceleration} -> ${damagedAcceleration}; envelope ${initialEnvelope.forward} -> ${damagedEnvelope.forward})`,
  );
  const binding = flight();
  await c.reducers.changeShipFlightFitting({
    shipId: ship().id,
    fittingId: fitting.id,
    action: "detach",
    expectedRevision: binding.revision,
    expectedFittingRevision: 2n,
    operationId: crypto.randomUUID(),
  });
  await wait(
    () =>
      physical().status === "ready" &&
      JSON.parse(physical().envelopeJson).forward < damagedEnvelope.forward,
    "validated detachment reduces force further",
  );
  assert.equal(physical().massKg, mass, "detachment retains hardware mass");
  const other = [...c.db.ownAuthoredFlightFittings.iter()].find(
    (f: any) => f.sourceDeviceId === "drives-main-3.6",
  ) as any;
  await c.reducers.requestIfcsSmokeEvent({
    shipId: ship().id,
    fittingId: other.id,
    kind: "invalid-definition",
  });
  await wait(
    () =>
      physical().status === "rejected" &&
      physical().reason.length > 0 &&
      c.db.ownAuthoredFlightActuators.count() === 0n,
    "invalid physical definition visible and rejected",
  );
  await pause(150);
  const before = toCenterOfMassMotion(ship(), physical());
  await pause(350);
  const after = toCenterOfMassMotion(ship(), physical());
  assert(
    Math.abs(before.vx - after.vx) < 1e-9 &&
      Math.abs(before.vy - after.vy) < 1e-9 &&
      Math.abs(before.omega - after.omega) < 1e-12,
    "invalid definition retains last valid inertia for uncontrolled coasting",
  );
  assert(
    [...c.db.ownActuatorOutputs.iter()].every((o: any) => o.throttle === 0),
  );
  console.log(
    JSON.stringify(
      {
        database,
        mass,
        initialForwardAccelerationLimit: initialEnvelope.forward,
        damagedForwardAccelerationLimit: damagedEnvelope.forward,
        initialMeasuredAcceleration: initialAcceleration,
        damagedMeasuredAcceleration: damagedAcceleration,
        serverOnlyDamageProducer: true,
        validatedDetachmentRetainsMass: true,
        invalidDefinitionReason: physical().reason,
        invalidDefinitionCoastsWithoutFixture: true,
      },
      null,
      2,
    ),
  );
} finally {
  c.disconnect();
}
