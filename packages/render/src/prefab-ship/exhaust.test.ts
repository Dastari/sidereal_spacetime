import { describe, expect, it } from "vitest";
import { prefabById } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { compilePrefabFlight } from "@sidereal/sim/prefab-handling";
import {
  exhaustShape,
  jetsFromLayout,
  prefabExhaustJets,
  prefabNozzleLayout,
} from "./exhaust";

const catalog = defaultPrefabComponentCatalog();
const wren = prefabById("fed.s.wren")!;

describe("prefab exhaust", () => {
  it("places every jet at the server-compiled nozzle with its exhaust direction", () => {
    const compiled = compilePrefabFlight(wren, catalog);
    const rows = compiled.actuators.map((a) => ({ ...a, throttle: 0.5 }));
    const jets = prefabExhaustJets(wren, catalog, rows);
    expect(jets).toHaveLength(compiled.actuators.length);
    expect(jets.filter((j) => j.kind === "rcs")).toHaveLength(12);
    expect(jets.filter((j) => j.kind === "main")).toHaveLength(3);
    expect(jets.filter((j) => j.kind === "reverser")).toHaveLength(3);
    // The client-side layout (for exteriors without owner telemetry) matches the compile.
    const layout = new Map(
      prefabNozzleLayout(wren, catalog).map((n) => [n.id, n]),
    );
    for (const j of jets) {
      const n = layout.get(j.id)!;
      expect(n.nozzleX).toBeCloseTo(j.nozzleX, 9);
      expect(n.nozzleY).toBeCloseTo(j.nozzleY, 9);
      expect(n.exhaustX).toBeCloseTo(j.exhaustX, 9);
      expect(n.exhaustY).toBeCloseTo(j.exhaustY, 9);
    }
    // Main drives exhaust aft.
    for (const j of jets.filter((x) => x.kind === "main"))
      expect(j.exhaustY).toBeCloseTo(-1, 9);
  });

  it("follows the achieved throttle only", () => {
    const layout = prefabNozzleLayout(wren, catalog);
    const jets = jetsFromLayout(layout, new Map([["mount-main-c", 1]]));
    expect(jets.filter((j) => j.throttle > 0).map((j) => j.id)).toEqual([
      "mount-main-c",
    ]);
    for (const kind of ["main", "reverser", "rcs"] as const)
      expect(exhaustShape(kind, 1).length).toBeGreaterThan(
        exhaustShape(kind, 0.2).length,
      );
  });
});
