import { describe, expect, it } from "vitest";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { prefabStats } from "@sidereal/content/ship-prefab";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { buildShipComponentCatalog } from "@sidereal/content/ship-components-source";
import type { ShipPrefabDocumentV1 } from "@sidereal/content/ship-prefab";
import { compileFlightDefinition } from "./flight-definition";
import {
  PREFAB_FLIGHT_PROFILE,
  prefabFlightInput,
  prefabFlightModel,
  prefabInteriorDefinitionId,
} from "./prefab-flight";
import { WAYFARER_ACCESS_SOURCE } from "@sidereal/content/wayfarer-access-profile";
import { prefabWalkFrame } from "./prefab-construction";

const catalog = defaultPrefabComponentCatalog();

function compiled(prefab: ShipPrefabDocumentV1) {
  const model = prefabFlightModel(prefab, catalog);
  const identity = (s: string) => `${prefab.id}:${s}`;
  const result = compileFlightDefinition(
    prefabFlightInput(model, identity, {
      fittings: model.fittings.map((f) => ({
        id: `fit:${f.sourceId}`,
        placedObjectId: identity(f.sourceId),
        definitionId: f.definitionId,
        definitionRevision: f.definitionRevision,
        installed: true,
        powered: true,
        availability: 1,
      })),
    }),
  );
  if (result.status !== "ready") throw Error(result.reason);
  return result;
}

describe("prefab flight compile", () => {
  for (const prefab of PREFAB_SHIPS)
    it(`${prefab.id} compiles to a ready IFCS definition from component stats`, () => {
      const model = prefabFlightModel(prefab, catalog);
      const identity = (s: string) => `${prefab.id}:${s}`;
      const fittings = model.fittings.map((f) => ({
        id: `fit:${f.sourceId}`,
        placedObjectId: identity(f.sourceId),
        definitionId: f.definitionId,
        definitionRevision: f.definitionRevision,
        installed: true,
        powered: true,
        availability: 1,
      }));
      const compiled = compileFlightDefinition(
        prefabFlightInput(model, identity, { fittings }),
      );
      if (compiled.status !== "ready") throw Error(compiled.reason);
      const stats = prefabStats(prefab, catalog);
      expect(compiled.mass.massKg).toBeCloseTo(stats.massKg, -1);
      const main = compiled.actuators.filter(
        (a) =>
          !a.definitionId.endsWith("#nozzle") &&
          !a.definitionId.endsWith("#quad-nozzle") &&
          !a.definitionId.endsWith("#reverser"),
      );
      expect(main.every((a) => Math.abs(a.rotation) < 1e-9)).toBe(true);
      expect(main.reduce((s, a) => s + a.maxThrustN, 0)).toBeCloseTo(
        stats.thrustN,
        3,
      );
      // RCS clusters give braking and lateral authority.
      if (prefab.mounts.some((m) => m.component.startsWith("rcs.")))
        expect(compiled.envelope.reverse).toBeGreaterThan(0);
      expect(compiled.computers.length).toBeGreaterThan(0);
      expect(model.station).not.toBeNull();
      // Pilot station sits fore of the centre of mass on the ship centre line (bridge at the bow).
      expect(model.station![1]).toBeGreaterThan(compiled.mass.centerY);
      expect(compiled.envelope).toBeTruthy();
    });

  it("is deterministic", () => {
    const a = JSON.stringify(prefabFlightModel(PREFAB_SHIPS[1], catalog));
    const b = JSON.stringify(prefabFlightModel(PREFAB_SHIPS[1], catalog));
    expect(a).toBe(b);
  });

  it("uses actual native floor area and its surface centroid for the access refit", () => {
    const doc = WAYFARER_ACCESS_SOURCE;
    const frame = prefabWalkFrame(doc, catalog);
    let area = 0,
      xMoment = 0,
      yMoment = 0;
    for (const polygon of frame.floors) {
      const patchArea =
        Math.abs(
          polygon.reduce((sum, p, i) => {
            const q = polygon[(i + 1) % polygon.length];
            return sum + p[0] * q[1] - q[0] * p[1];
          }, 0),
        ) / 2;
      area += patchArea;
      xMoment +=
        (patchArea * polygon.reduce((s, p) => s + p[0], 0)) / polygon.length;
      yMoment +=
        (patchArea * polygon.reduce((s, p) => s + p[1], 0)) / polygon.length;
    }
    expect(area).toBe(231);
    const model = prefabFlightModel(doc, catalog);
    const interior = model.catalog.definitions.find(
      (d) => d.id === prefabInteriorDefinitionId(doc.id),
    )!;
    // Floor231m²×40kg plus the sixteen retained side-wall segments×60kg.
    expect(interior.massKg).toBe(10200);
    const part = model.parts.find((p) => p.sourceId === "interior")!;
    expect(part.position[0]).toBeCloseTo(xMoment / area, 9);
    expect(part.position[1]).toBeCloseTo(yMoment / area, 9);
    expect(compiled(doc).mass.massKg).toBe(59820);
  });
});

describe("prefab flight balance (proposed, catalog revision 4)", () => {
  const components = new Map(
    buildShipComponentCatalog().components.map((c) => [c.id, c]),
  );
  const byId = (id: string) => PREFAB_SHIPS.find((p) => p.id === id)!;

  for (const id of ["fed.s.wren", "rj.s.jackal"])
    it(`${id} (S starter) reaches 3.5-5 m/s^2 on its main drives with power, heat and fuel closing`, () => {
      const prefab = byId(id);
      const stats = prefabStats(prefab, catalog);
      // Main drives alone (catalogue stat); the IFCS envelope below adds the RCS aft nozzles.
      expect(stats.accelerationMs2).toBeGreaterThanOrEqual(3.5);
      expect(stats.accelerationMs2).toBeLessThanOrEqual(5);
      expect(stats.powerBalanceW).toBeGreaterThanOrEqual(0);
      expect(stats.heatBalanceW).toBeLessThanOrEqual(0);
      const envelope = compiled(prefab).envelope;
      // The IFCS cap must not clip the envelope the engines provide.
      expect(envelope.forward).toBeGreaterThanOrEqual(4);
      expect(PREFAB_FLIGHT_PROFILE.maxAcceleration).toBeGreaterThanOrEqual(
        envelope.forward,
      );
    });

  it("Wren turns and strafes on its corner RCS quads and carries propellant for its drives", () => {
    const prefab = byId("fed.s.wren");
    const envelope = compiled(prefab).envelope;
    expect(envelope.angularPositive).toBeGreaterThanOrEqual(1.5);
    expect(envelope.angularNegative).toBeGreaterThanOrEqual(1.5);
    expect(envelope.left).toBeGreaterThanOrEqual(1.5);
    expect(envelope.right).toBeGreaterThanOrEqual(1.5);
    expect(envelope.forward).toBeGreaterThanOrEqual(6);
    let capacityL = 0;
    let mainBurnLps = 0;
    for (const m of prefab.mounts) {
      const c = components.get(m.component)!;
      capacityL += c.fluids.fuelCapacityL;
      if (c.propulsion?.role === "main") mainBurnLps += c.fluids.fuelActiveLps;
    }
    // At least 30 minutes of continuous full main burn.
    expect(capacityL / mainBurnLps).toBeGreaterThanOrEqual(30 * 60);
    // Three small thrust blocks (r6; r4-r5 flew four), no medium nacelles on the 12 m hull, and an
    // RCS quad at each nose and stern corner.
    expect(
      prefab.mounts
        .filter((m) => components.get(m.component)?.propulsion?.role === "main")
        .map((m) => components.get(m.component)!.sizeClass),
    ).toEqual(["SM", "SM", "SM"]);
    expect(
      prefab.mounts
        .filter((m) => m.component.startsWith("rcs."))
        .map((m) => m.id)
        .sort(),
    ).toEqual(["rcs-bow-p", "rcs-bow-s", "rcs-stern-p", "rcs-stern-s"]);
  });

  it("M and L hulls stay slower and heavier than the S starters", () => {
    const wren = prefabStats(byId("fed.s.wren"), catalog);
    for (const prefab of PREFAB_SHIPS.filter((p) => p.sizeClass !== "S")) {
      const stats = prefabStats(prefab, catalog);
      expect(stats.accelerationMs2, prefab.id).toBeLessThan(3.2);
      expect(stats.massKg, prefab.id).toBeGreaterThan(wren.massKg);
    }
  });
});
