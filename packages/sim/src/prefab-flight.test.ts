import { describe, expect, it } from "vitest";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { prefabStats } from "@sidereal/content/ship-prefab";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { compileFlightDefinition } from "./flight-definition";
import { prefabFlightInput, prefabFlightModel } from "./prefab-flight";

const catalog = defaultPrefabComponentCatalog();

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
      const compiled = compileFlightDefinition(prefabFlightInput(model, identity, { fittings }));
      if (compiled.status !== "ready") throw Error(compiled.reason);
      const stats = prefabStats(prefab, catalog);
      expect(compiled.mass.massKg).toBeCloseTo(stats.massKg, -1);
      const aft = compiled.actuators.filter((a) => Math.abs(a.rotation) < 1e-9);
      expect(aft.reduce((s, a) => s + a.maxThrustN, 0)).toBeCloseTo(stats.thrustN, 3);
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
