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
} from "./prefab-flight";

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
        (a) => !a.definitionId.endsWith("#nozzle"),
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
});

describe("prefab flight balance (proposed, catalog revision 2)", () => {
  const components = new Map(
    buildShipComponentCatalog().components.map((c) => [c.id, c]),
  );
  const byId = (id: string) => PREFAB_SHIPS.find((p) => p.id === id)!;

  for (const id of ["fed.s.wren", "rj.s.jackal"])
    it(`${id} (S starter) reaches 4-5 m/s^2 forward with power, heat and fuel closing`, () => {
      const prefab = byId(id);
      const stats = prefabStats(prefab, catalog);
      expect(stats.accelerationMs2).toBeGreaterThanOrEqual(4);
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

  it("Wren turns and strafes on its RCS and carries propellant for its drives", () => {
    const prefab = byId("fed.s.wren");
    const envelope = compiled(prefab).envelope;
    expect(envelope.angularPositive).toBeGreaterThanOrEqual(0.25);
    expect(envelope.angularNegative).toBeGreaterThanOrEqual(0.25);
    expect(envelope.left).toBeGreaterThanOrEqual(0.8);
    let capacityL = 0;
    let mainBurnLps = 0;
    for (const m of prefab.mounts) {
      const c = components.get(m.component)!;
      capacityL += c.fluids.fuelCapacityL;
      if (c.propulsion?.role === "main") mainBurnLps += c.fluids.fuelActiveLps;
    }
    // At least 30 minutes of continuous full main burn.
    expect(capacityL / mainBurnLps).toBeGreaterThanOrEqual(30 * 60);
    // Four small drives (r4: thrust blocks), no medium nacelles on the 12 m hull.
    expect(
      prefab.mounts
        .filter((m) => components.get(m.component)?.propulsion?.role === "main")
        .map((m) => components.get(m.component)!.sizeClass),
    ).toEqual(["SM", "SM", "SM", "SM"]);
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
