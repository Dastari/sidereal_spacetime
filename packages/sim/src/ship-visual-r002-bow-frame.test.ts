import { describe, expect, it } from "vitest";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import type { ShipVisualLayer } from "@sidereal/content/ship-visual";
import { referenceBowFrameR002 } from "./ship-visual-r002-bow-frame";
import { sampleShipVisualLayers, visualCellKey } from "./ship-visual-sampler";

const doc = PREFAB_SHIPS.find((d) => d.id === "fed.s.wren")!;
const catalog = defaultPrefabComponentCatalog();
const cube = (
  x: number,
  y: number,
  z: number,
  slot: ShipVisualLayer["slot"] = "primary",
  role: ShipVisualLayer["role"] = "core",
): ShipVisualLayer => ({
  id: `fixture:${x}:${y}:${z}`,
  role,
  slot,
  support: "volume:hull",
  bounds: [x, y, z, x + 1, y + 1, z + 1],
});

describe("joined Wren bow-frame replacement", () => {
  it("mirrors the north cross-section at the reflected lattice CORNERS", () => {
    const layers = [cube(167, 103, 12), cube(166, 103, 12), cube(166, 102, 12)];
    const replacements = referenceBowFrameR002(
      doc,
      "deck",
      catalog,
      "federation",
      layers,
    );
    expect(replacements).toHaveLength(1);
    expect(replacements[0].facet).toEqual({
      id: "volume:hull:joined-bow-frame:north",
      a: [1, 1, 0],
      d: 271,
    });
    // Reflect Y=112-y, including corners; reflecting voxel indices alone would
    // incorrectly use 270 and put the centre outside its supporting solid.
    expect(167.5 + 103.5).toBe(replacements[0].facet!.d);
  });
  it("keeps floor, unbacked ends and unrelated owners untouched while joining supported outer cubes", () => {
    const layers = [
      cube(167, 8, 12),
      cube(166, 8, 12),
      cube(166, 9, 12),
      cube(167, 8, 3, "secondary", "floor"),
      cube(162, 3, 22),
      { ...cube(167, 8, 28), support: "other-family" },
    ];
    const replacements = referenceBowFrameR002(
      doc,
      "deck",
      catalog,
      "federation",
      layers,
    );
    expect(replacements).toHaveLength(1);
    const before = sampleShipVisualLayers(layers),
      after = sampleShipVisualLayers([...layers, ...replacements]);
    expect([...after.keys()]).toEqual([...before.keys()]);
    const changed = visualCellKey(167, 8, 12);
    for (const [key, c] of before)
      if (key !== changed)
        expect({ ...after.get(key), facetNeighbourFaces: undefined }).toEqual({
          ...c,
          facetNeighbourFaces: undefined,
        });
    const c = after.get(changed)!;
    expect(c.facet).toEqual({
      id: "volume:hull:joined-bow-frame:south",
      a: [1, -1, 0],
      d: 159,
    });
    expect([c.role, c.slot, c.family]).toEqual([
      "core",
      "primary",
      "volume:hull",
    ]);
  });

  it("retains raw glass and its original optical thickness beside the new casing", () => {
    const layers = [
      cube(167, 8, 22, "glass"),
      cube(166, 8, 22, "glass"),
      cube(167, 8, 12),
      cube(166, 8, 12),
      cube(166, 9, 12),
    ];
    const replacements = referenceBowFrameR002(
      doc,
      "flight",
      catalog,
      "federation",
      layers,
    );
    expect(replacements).toHaveLength(1);
    const frame = replacements[0];
    expect(replacements.every((l) => l.slot !== "glass")).toBe(true);
    // The signed plane passes through existing lattice corners and the centre,
    // and clips just the outward half; two original glass courses remain owned.
    const a = frame.facet!.a,
      d = frame.facet!.d;
    const centre = frame.bounds.slice(0, 3).map((v) => v + 0.5);
    expect(a.reduce((v, q, i) => v + q * centre[i], 0)).toBe(d);
    const before = sampleShipVisualLayers(layers),
      after = sampleShipVisualLayers([...layers, ...replacements]);
    for (const key of ["166,8,22", "167,8,22"])
      expect({ ...after.get(key), facetNeighbourFaces: undefined }).toEqual({
        ...before.get(key),
        facetNeighbourFaces: undefined,
      });
  });

  it("keeps the complete prior source on wrong prefab/profile or absent optical backing", () => {
    const layers = [cube(167, 8, 22, "glass"), cube(167, 8, 12)];
    expect(
      referenceBowFrameR002(doc, "deck", catalog, "federation", layers),
    ).toEqual([]);
    expect(
      referenceBowFrameR002(
        { ...doc, id: "unqualified" },
        "deck",
        catalog,
        "federation",
        layers,
      ),
    ).toEqual([]);
    expect(
      referenceBowFrameR002(doc, "deck", catalog, "riftjack", layers),
    ).toEqual([]);
  });
});
