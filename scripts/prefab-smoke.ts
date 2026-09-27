/** Prefab ship smoke (isolated copied module only; see scripts/prefab_smoke_module.py).
 *
 *   python3 scripts/dev.py smoke --smoke-name prefab --fresh-smoke --prefab
 *
 * A dev identity enters the lab, the smoke-only reducer assigns a developer prefab through
 * the real installPrefabShip, and the pilot walks to the derived station, takes the seat and
 * flies with compiled-from-components flight. Asserts game access, flight admission, mass
 * against prefabStats, actuator count against the prefab flight model, and motion.
 */
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { nextSequence, walkNative } from "./native-starter-smoke";
import { prefabById } from "../packages/content/src/prefabs/index";
import { prefabStats } from "../packages/content/src/ship-prefab";
import { defaultPrefabComponentCatalog } from "../packages/content/src/ship-prefab-catalog";
import { prefabFlightModel } from "../packages/sim/src/prefab-flight";
import { prefabPilotPose } from "../packages/sim/src/construction-pilot";
import { prefabWalkRoute } from "../packages/sim/src/prefab-construction";

const host = process.env.SIDEREAL_SMOKE_URL,
  database = process.env.SIDEREAL_SMOKE_DATABASE,
  bindings = process.env.SIDEREAL_IFCS_TEST_BINDINGS;
if (!host || !database?.endsWith("-smoke") || !bindings || !resolve(bindings).startsWith(resolve(".runtime/smoke-runs") + "/"))
  throw Error("Reserved isolated prefab module bindings required");
const { DbConnection, tables } = await import(pathToFileURL(bindings).href);
const PREFAB = process.env.SIDEREAL_PREFAB_SMOKE_ID ?? "fed.s.wren";

async function wait(fn: () => boolean, label: string, ms = 15000) {
  const end = Date.now() + ms;
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
const actor = () => [...c.db.ownCharacters.iter()][0] as any;
const flightOf = (shipId: string) => [...c.db.ownAuthoredFlights.iter()].find((f: any) => f.shipId === shipId) as any;
const physicsOf = (shipId: string) => [...c.db.ownAuthoredFlightPhysics.iter()].find((p: any) => p.shipId === shipId) as any;
const shipOf = (shipId: string) => [...c.db.ownShips.iter()].find((s: any) => s.id === shipId) as any;

try {
  await wait(() => ready, "subscription");
  await c.reducers.enterLab({ name: "Prefab Smoke" });
  await c.reducers.claimInputControl({});
  await wait(() => !!actor(), "lab character");
  const before = actor().shipId;
  await c.reducers.assignPrefabSmokeShip({ prefabId: PREFAB });
  await wait(() => actor()?.shipId && actor().shipId !== before, "boarded prefab ship");
  const shipId = actor().shipId as string;
  await wait(() => [...c.db.ownGameShipAccess.iter()].some((a: any) => a.shipId === shipId), "prefab game access row", 5000).catch(() => {
    const dump = (name: string, t: any) => console.log(name, JSON.stringify([...t.iter()], (_, v) => (typeof v === "bigint" ? v.toString() : v)));
    dump("actor", c.db.ownCharacters);
    dump("ships", c.db.ownShips);
    dump("access", c.db.ownGameShipAccess);
    dump("location", c.db.ownConstructionLocation);
    dump("admission", c.db.ownWorldAdmission);
    dump("flights", c.db.ownAuthoredFlights);
  });
  const access = [...c.db.ownGameShipAccess.iter()].find((a: any) => a.shipId === shipId) as any;
  assert(access && access.instanceId === shipId, "game ship access projected for the prefab ship");
  const instanceRow = [...c.db.ownConstructionLocation.iter()][0] as any;
  assert(instanceRow?.instanceId === shipId, "character located aboard the prefab instance");
  await wait(() => physicsOf(shipId)?.status === "ready", "prefab physical definition ready");
  const prefab = prefabById(PREFAB)!;
  const catalog = defaultPrefabComponentCatalog();
  const stats = prefabStats(prefab, catalog);
  const model = prefabFlightModel(prefab, catalog);
  const physics = physicsOf(shipId);
  // Crew body mass rides along (one smoke character on board).
  assert(Math.abs(physics.massKg - stats.massKg) < 200, `compiled mass ${physics.massKg} ~ prefab stats ${stats.massKg}`);
  const actuators = [...c.db.ownAuthoredFlightActuators.iter()].filter((a: any) => a.shipId === shipId);
  assert.equal(actuators.length, model.fittings.filter((f) => f.role === "actuator").length, "one actuator per engine/RCS nozzle");
  const flight = flightOf(shipId);
  assert(flight?.active && flight.flightAdmitted, "prefab flight active and admitted");

  // Walk from the spawn to the derived pilot approach (through door passages), then sit.
  const pose = prefabPilotPose(model.station!);
  const spawn = { x: actor().localX, y: actor().localY };
  for (const [x, y] of prefabWalkRoute(prefab, catalog, [spawn.x, spawn.y], pose.approach)) await walkNative(c, x, y);
  // The lab character still owns its original Wayfarer; select the prefab ship's flight row.
  const seatFlight = flightOf(shipId);
  await c.reducers.enterAuthoredPilot({
    stationId: seatFlight.stationId,
    expectedStationRevision: seatFlight.stationRevision,
    operationId: crypto.randomUUID(),
  });
  await wait(() => flightOf(shipId)?.seatState === "seated", "prefab pilot entry");
  assert(Math.hypot(actor().localX - pose.position[0], actor().localY - pose.position[1]) < 1e-3, "seated at the derived station");

  // Fly: forward burn changes velocity; release and turn produce rotation.
  const s0 = shipOf(shipId);
  for (let n = 0; n < 20; n++) {
    await c.reducers.setIntent({ sequence: nextSequence(c), throttle: 1, turn: 0, dx: 0, dy: 0, sprint: false });
    await pause(60);
  }
  const s1 = shipOf(shipId);
  const speed = Math.hypot(s1.vx, s1.vy);
  assert(speed > 0.3, `prefab ship accelerated (speed ${speed.toFixed(3)} m/s)`);
  for (let n = 0; n < 15; n++) {
    await c.reducers.setIntent({ sequence: nextSequence(c), throttle: 0, turn: 1, dx: 0, dy: 0, sprint: false });
    await pause(60);
  }
  assert(Math.abs(shipOf(shipId).heading - s0.heading) > 1e-3, "prefab ship turned");
  console.log(JSON.stringify({ prefab: PREFAB, shipId, massKg: physics.massKg, actuators: actuators.length, speed, heading: shipOf(shipId).heading }));
  console.log("prefab smoke passed");
} finally {
  c.disconnect();
}
