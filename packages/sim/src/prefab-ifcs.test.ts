/**
 * Fly-by-wire IFCS for prefab ships (FLIGHT-IFCS, 2026-09-29). Owner: "the player's controls is a
 * 'this is my intention to get the ship facing here and going at this speed' and the IFCS computer
 * needs to talk to the engines, ask it what thrust and what thrust vectors it can deliver and then
 * work out what percentage of what engines to fire to come to a solution."
 *
 * These tests fly the compiled Wren definition through the same pilot guidance, allocator and
 * integrator the world uses, and check that every turn and push is earned by real actuators.
 */
import { describe, expect, it } from "vitest";
import { prefabById } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import type { ShipPrefabDocumentV1 } from "@sidereal/content/ship-prefab";
import { DT } from "./index";
import {
  compileFlightDefinition,
  type FlightCargoMass,
  type FlightCrewMass,
} from "./flight-definition";
import {
  actuatorWrench,
  allocateThrust,
  deriveEnvelope,
  pilotDesiredMotion,
  solveFlight,
  type Actuator,
  type MassProperties,
} from "./ifcs";
import {
  PREFAB_FLIGHT_PROFILE,
  prefabFlightInput,
  prefabFlightModel,
} from "./prefab-flight";
import { prefabActuatorSupply } from "./prefab-flight-supply";
import { compilePrefabShipSystems } from "./prefab-ship-systems";
import { WAYFARER_FLIGHT_SPEED } from "@sidereal/content/physical-definitions";

const catalog = defaultPrefabComponentCatalog();
const wren = prefabById("fed.s.wren")!;

function compile(
  doc: ShipPrefabDocumentV1,
  opts: {
    availability?: (sourceId: string) => number;
    cargo?: FlightCargoMass[];
    crew?: FlightCrewMass[];
    supply?: (sourceId: string) => number;
  } = {},
) {
  const model = prefabFlightModel(doc, catalog);
  const identity = (s: string) => `${doc.id}:${s}`;
  const actuatorSources = model.fittings
    .filter((f) => f.role === "actuator")
    .map((f) => f.sourceId);
  const result = compileFlightDefinition(
    prefabFlightInput(model, identity, {
      fittings: model.fittings.map((f) => ({
        id: `fit:${f.sourceId}`,
        placedObjectId: identity(f.sourceId),
        definitionId: f.definitionId,
        definitionRevision: f.definitionRevision,
        installed: true,
        powered: true,
        availability: opts.availability?.(f.sourceId) ?? 1,
      })),
      cargo: opts.cargo,
      crew: opts.crew,
      ...(opts.supply
        ? {
            supply: Object.fromEntries(
              actuatorSources.map((s) => [`fit:${s}`, opts.supply!(s)]),
            ),
          }
        : {}),
    }),
  );
  if (result.status !== "ready") throw Error(result.reason);
  return result;
}

type State = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  omega: number;
};
const REST: State = { x: 0, y: 0, vx: 0, vy: 0, heading: 0, omega: 0 };
function step(
  c: ReturnType<typeof compile>,
  s: State,
  throttle: number,
  turn: number,
  actuators: readonly Actuator[] = c.actuators,
) {
  return solveFlight(
    s,
    pilotDesiredMotion(
      s,
      { throttle, turn },
      WAYFARER_FLIGHT_SPEED.forward,
      WAYFARER_FLIGHT_SPEED.reverse,
      PREFAB_FLIGHT_PROFILE.maxAngularSpeed,
    ),
    c.mass,
    actuators,
    true,
    PREFAB_FLIGHT_PROFILE,
    deriveEnvelope(actuators, c.mass),
  );
}
const isRcs = (a: { placedObjectId: string }) =>
  /:mount-rcs[^#]*#/.test(a.placedObjectId);
/** Seconds of full turn input from rest until the nose has swung 90 degrees. */
function turn90(c: ReturnType<typeof compile>) {
  let s = REST;
  for (let n = 1; n < 30 / DT; n++) {
    s = step(c, s, 0, 1).motion;
    if (Math.abs(s.heading) >= Math.PI / 2) return n * DT;
  }
  return Infinity;
}
function zeroToCruise(c: ReturnType<typeof compile>) {
  let s = REST;
  for (let n = 1; n < 120 / DT; n++) {
    s = step(c, s, 1, 0).motion;
    if (Math.hypot(s.vx, s.vy) >= 0.95 * WAYFARER_FLIGHT_SPEED.forward)
      return n * DT;
  }
  return Infinity;
}
const withoutRcs = (doc: ShipPrefabDocumentV1): ShipPrefabDocumentV1 => ({
  ...doc,
  mounts: doc.mounts.filter((m) => !m.component.startsWith("rcs.")),
});

describe("Wren fly-by-wire IFCS", () => {
  const full = compile(wren);

  it("compiles quad RCS nozzles that never exhaust into the hull, acting at their exits", () => {
    const rcs = full.actuators.filter(isRcs);
    // Four clusters x three nozzles (outward and both ways along the face).
    expect(rcs).toHaveLength(12);
    for (const a of rcs) {
      const cluster = a.placedObjectId.split("#")[0];
      const side = /-s$/.test(cluster) ? 1 : -1; // starboard (+x) or port (-x) face
      // The exhaust points away from the hull: never toward the ship centre line.
      expect(a.exhaustX * side).toBeGreaterThanOrEqual(-1e-9);
      // The nozzle acts at its exit point, outboard of the face.
      expect(a.nozzleX).toBeCloseTo(a.x, 9);
      expect(a.nozzleY).toBeCloseTo(a.y, 9);
    }
  });

  it("turns through RCS torque: a full-stick turn from rest is realised by the RCS nozzles", () => {
    let s = REST;
    let rcsTorque = 0,
      totalTorque = 0;
    const byId = new Map(full.actuators.map((a) => [a.id, a]));
    for (let i = 0; i < 0.5 / DT; i++) {
      const r = step(full, s, 0, 1);
      for (const cmd of r.commands) {
        const a = byId.get(cmd.id)!;
        const t = actuatorWrench(a, full.mass).torque * cmd.throttle;
        totalTorque += t;
        if (isRcs(a)) rcsTorque += t;
      }
      s = r.motion;
    }
    expect(s.omega).toBeGreaterThan(0.3);
    expect(rcsTorque / totalTorque).toBeGreaterThan(0.85);
  });

  it("does not turn at all without actuator authority (no kinematic turn exists)", () => {
    const dead = full.actuators.map((a) => ({ ...a, availability: 0 }));
    let s = REST;
    for (let i = 0; i < 2 / DT; i++) s = step(full, s, 1, 1, dead).motion;
    expect(s.heading).toBe(0);
    expect(s.omega).toBe(0);
    expect(Math.hypot(s.vx, s.vy)).toBe(0);
  });

  it("without RCS it turns only on the main-drive differential the definition allows", () => {
    const bare = compile(withoutRcs(wren));
    const mainOnly = deriveEnvelope(
      full.actuators.filter((a) => !isRcs(a)),
      bare.mass,
    );
    expect(bare.envelope.angularPositive).toBeCloseTo(
      mainOnly.angularPositive,
      6,
    );
    expect(bare.envelope.angularPositive).toBeLessThan(
      0.1 * full.envelope.angularPositive,
    );
    expect(turn90(bare)).toBeGreaterThan(2 * turn90(full));
  });

  it("a destroyed RCS block reduces turn authority", () => {
    const damaged = compile(wren, {
      availability: (s) => (s.startsWith("mount-rcs-bow-p#") ? 0 : 1),
    });
    expect(
      Math.min(
        damaged.envelope.angularPositive,
        damaged.envelope.angularNegative,
      ),
    ).toBeLessThan(
      Math.min(full.envelope.angularPositive, full.envelope.angularNegative),
    );
    // Mass is unchanged: damage cuts thrust, not the part.
    expect(damaged.mass.massKg).toBe(full.mass.massKg);
    expect(turn90(damaged)).toBeGreaterThanOrEqual(turn90(full));
  });

  it("cargo mass slows acceleration and crew mass counts", () => {
    const laden = compile(wren, {
      cargo: [{ containerId: "crate", massKg: 6000, position: [0, 2] }],
    });
    expect(laden.mass.massKg).toBeCloseTo(full.mass.massKg + 6000, 6);
    expect(laden.envelope.forward).toBeLessThan(full.envelope.forward);
    expect(laden.envelope.forward).toBeCloseTo(
      (full.envelope.forward * full.mass.massKg) / laden.mass.massKg,
      3,
    );
    expect(zeroToCruise(laden)).toBeGreaterThan(zeroToCruise(full));
    const crewed = compile(wren, {
      crew: [
        { characterId: "pilot", massKg: 90, position: [0, 4] },
        { characterId: "mate", massKg: 90, position: [2, -3] },
      ],
    });
    expect(crewed.mass.massKg).toBeCloseTo(full.mass.massKg + 180, 6);
    expect(crewed.mass.inertiaKgM2).toBeGreaterThan(full.mass.inertiaKgM2);
  });

  it("is deterministic", () => {
    const run = () => {
      const c = compile(wren);
      let s = REST;
      const trace: number[] = [];
      for (let i = 0; i < 240; i++) {
        const r = step(c, s, i < 120 ? 1 : -1, i % 60 < 30 ? 1 : -0.5);
        s = r.motion;
        trace.push(s.x, s.y, s.heading, ...r.commands.map((x) => x.throttle));
      }
      return trace;
    };
    expect(run()).toEqual(run());
  });

  it("has no actuator-ID or row-order dependence", () => {
    const requests = [
      { fx: 0, fy: 90000, torque: 0 },
      { fx: 30000, fy: 0, torque: 0 },
      { fx: 0, fy: -60000, torque: 0 },
      { fx: 0, fy: 0, torque: 250000 },
      { fx: -20000, fy: 50000, torque: -150000 },
    ];
    // Physical columns are identified by placement, never by UUID.
    const renamed = full.actuators
      .map((a, i) => ({
        ...a,
        id: `${(0x9e3779b1 * (i + 7)) % 1_000_003}-${a.placedObjectId.length}`,
      }))
      .reverse();
    const key = (list: readonly (Actuator & { placedObjectId: string })[]) =>
      new Map(list.map((a) => [a.id, a.placedObjectId]));
    for (const request of requests) {
      const a = allocateThrust(full.actuators, full.mass, request);
      const b = allocateThrust(renamed, full.mass, request);
      for (const axis of ["fx", "fy", "torque"] as const)
        expect(b.achieved[axis]).toBeCloseTo(a.achieved[axis], 6);
      const byPlacementA = new Map(
        a.commands.map((c) => [key(full.actuators).get(c.id)!, c.throttle]),
      );
      const byPlacementB = new Map(
        b.commands.map((c) => [key(renamed).get(c.id)!, c.throttle]),
      );
      for (const [placement, throttle] of byPlacementA)
        expect(byPlacementB.get(placement)!).toBeCloseTo(throttle, 6);
    }
  });

  it("never co-fires opposing thrust: a drive and its reverser, or opposed nozzles, never burn together", () => {
    const mass: MassProperties = full.mass;
    for (const request of [
      { fx: 0, fy: 120000, torque: 0 },
      { fx: 0, fy: -90000, torque: 0 },
      { fx: 25000, fy: 0, torque: 0 },
      { fx: 0, fy: 0, torque: 300000 },
    ]) {
      const r = allocateThrust(full.actuators, mass, request);
      const firing = r.commands.filter((c) => c.throttle > 1e-9);
      const forces = firing.map((c) => {
        const a = full.actuators.find((x) => x.id === c.id)!;
        const w = actuatorWrench(a, mass);
        return { a, fx: w.fx * c.throttle, fy: w.fy * c.throttle };
      });
      // Opposing pairs cancel force: minimum-newton allocation spends exactly what the request needs
      // along each axis it asks for (no force is bought and then cancelled).
      const spent = forces.reduce((s, f) => s + Math.hypot(f.fx, f.fy), 0);
      const drives = new Set(
        firing
          .map((c) => full.actuators.find((x) => x.id === c.id)!.placedObjectId)
          .filter((p) => !isRcs({ placedObjectId: p })),
      );
      for (const p of drives)
        expect(drives.has(`${p}#reverser`), `${p} with its reverser`).toBe(
          false,
        );
      if (request.torque === 0)
        expect(spent).toBeLessThanOrEqual(
          Math.hypot(request.fx, request.fy) * 1.000001 + 1e-6,
        );
    }
  });
});

describe("actuator fuel and power supply", () => {
  const sources = (doc: ShipPrefabDocumentV1) =>
    prefabFlightModel(doc, catalog)
      .fittings.filter((f) => f.role === "actuator")
      .map((f) => f.sourceId);

  it("Wren r6 closes its ship-systems budget (control slots, coolant, magazine, heat)", () => {
    const issues = (
      compilePrefabShipSystems(wren, catalog.revision).report as unknown as {
        issues: { severity: string; code: string }[];
      }
    ).issues;
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
  });

  it("an intact tank and generator supply every Wren actuator", () => {
    const s = prefabActuatorSupply(
      wren,
      catalog.revision,
      sources(wren),
      () => 1,
    );
    expect(Object.values(s).every((v) => v === 1)).toBe(true);
  });

  it("no propellant means no thrust from propellant-burning drives and RCS", () => {
    const supply = prefabActuatorSupply(
      wren,
      catalog.revision,
      sources(wren),
      (mountId) => (mountId === "fuel" ? 0 : 1),
    );
    expect(Object.values(supply).every((v) => v === 0)).toBe(true);
    const c = compile(wren, { supply: (s) => supply[s] });
    expect(c.envelope.forward).toBe(0);
    expect(c.envelope.angularPositive).toBe(0);
    // The parts keep their mass.
    expect(c.mass.massKg).toBe(compile(wren).mass.massKg);
  });

  it("a propellant-free drive keeps thrusting without a tank; a destroyed generator stops it", () => {
    const lumen = prefabById("au.s.lumen")!;
    const noTank = prefabActuatorSupply(
      lumen,
      catalog.revision,
      sources(lumen),
      (m) =>
        lumen.mounts.find((x) => x.id === m)?.component.startsWith("fuel-tank")
          ? 0
          : 1,
    );
    const drives = Object.entries(noTank).filter(([s]) =>
      s.startsWith("mount-drive-"),
    );
    expect(drives.length).toBeGreaterThan(0);
    expect(drives.every(([, v]) => v === 1)).toBe(true);
    const noPower = prefabActuatorSupply(
      lumen,
      catalog.revision,
      sources(lumen),
      (m) => (m === "reactor" ? 0 : 1),
    );
    expect(
      Object.entries(noPower)
        .filter(([s]) => s.startsWith("mount-drive-"))
        .every(([, v]) => v === 0),
    ).toBe(true);
  });
});
