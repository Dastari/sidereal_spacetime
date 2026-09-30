import { describe, expect, it } from "vitest";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import type { ShipVisualLayer } from "@sidereal/content/ship-visual";
import {
  sampleShipVisualLayers,
  removeShipVisualCells,
  visualCellKey,
  visualVolumeSha256,
  compileShipVisual,
} from "./ship-visual-compiler";

const FED_WREN = PREFAB_SHIPS[0];
describe("presentation-only structural sampling", () => {
  const core: ShipVisualLayer = {
    id: "core",
    role: "core",
    slot: "dark",
    bounds: [-2, 0, 0, 2, 2, 2],
  };
  it("samples placed global integer cells and explicit ordered carving", () => {
    const cells = sampleShipVisualLayers([
      core,
      { ...core, id: "void", role: "void", bounds: [0, 0, 0, 1, 1, 1] },
    ]);
    expect(cells.size).toBe(15);
    expect(cells.has("-2,0,0")).toBe(true);
    expect(cells.has("0,0,0")).toBe(false);
    expect(() =>
      sampleShipVisualLayers([{ ...core, bounds: [0.5, 0, 0, 2, 2, 2] }]),
    ).toThrow();
  });
  it("prunes decoration detached by fixture damage and restores exact phase from base", () => {
    const layers = [
      core,
      {
        ...core,
        id: "plate",
        role: "plate" as const,
        slot: "primary" as const,
        bounds: [2, 0, 0, 4, 2, 2] as ShipVisualLayer["bounds"],
      },
    ];
    const base = sampleShipVisualLayers(layers),
      removed = new Set<string>();
    for (let y = 0; y < 2; y++)
      for (let z = 0; z < 2; z++) removed.add(visualCellKey(2, y, z));
    const damaged = removeShipVisualCells(base, removed);
    expect([...damaged.values()].some((c) => c.x === 3)).toBe(false);
    expect(visualVolumeSha256(sampleShipVisualLayers(layers))).toBe(
      visualVolumeSha256(base),
    );
  });
  it("pins presentation shading independently of unchanged sampled occupancy", () => {
    const plain = sampleShipVisualLayers([core]);
    const shaded = sampleShipVisualLayers([
      { ...core, normalHint: [Math.SQRT1_2, Math.SQRT1_2, 0] },
    ]);
    expect([...shaded.keys()]).toEqual([...plain.keys()]);
    expect(visualVolumeSha256(shaded)).not.toBe(visualVolumeSha256(plain));
    expect(() =>
      sampleShipVisualLayers([{ ...core, normalHint: [2, 0, 0] }]),
    ).toThrow("presentation normal");
  });
  it("compiles Wren without mutating its authority inputs", () => {
    const before = JSON.stringify(FED_WREN),
      catalog = defaultPrefabComponentCatalog();
    const a = compileShipVisual(FED_WREN, catalog, "deck", "federation");
    const b = compileShipVisual(FED_WREN, catalog, "deck", "federation");
    expect(a.cells.size).toBeGreaterThan(10000);
    expect(visualVolumeSha256(a.cells)).toBe(visualVolumeSha256(b.cells));
    expect(JSON.stringify(FED_WREN)).toBe(before);
    const r = compileShipVisual(FED_WREN, catalog, "deck", "riftjack");
    expect(visualVolumeSha256(r.cells)).not.toBe(visualVolumeSha256(a.cells));
  });
});
