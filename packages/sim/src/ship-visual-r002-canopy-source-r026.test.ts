import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { referenceRoomLayoutR025 } from "@sidereal/content/ship-reference-room-layout-r025";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import {
  validateShipVisualLayers,
  type ShipVisualLayer,
} from "@sidereal/content/ship-visual";
import {
  referenceOpticalGuardBoxesR002,
  shipVisualLayersR002,
} from "./ship-visual-layers-r002";
import {
  originalCanopySourceCellsR026,
  compactOriginalCanopyCellsR026,
  referenceOriginalCanopySourceR026,
  type OriginalCanopyCellR026,
} from "./ship-visual-r002-canopy-source-r026";
import {
  sampleShipVisualLayers,
  visualCellKey,
  type VisualCell,
} from "./ship-visual-sampler";
const signature = (cells: Iterable<OriginalCanopyCellR026>) =>
  createHash("sha256")
    .update(
      JSON.stringify(
        [...cells]
          .sort((a, b) => a.x - b.x || a.y - b.y || a.z - b.z)
          .map((c) => [
            c.x,
            c.y,
            c.z,
            c.role,
            c.slot,
            c.occurrence,
            c.primitive,
          ]),
      ),
    )
    .digest("hex");
const provenance = (layer: ShipVisualLayer) => {
  const rest = layer.id
    .slice("volume:hull:r026-original-canopy:".length)
    .split(":");
  return {
    occurrence: Number(rest[0]),
    primitive: rest.slice(1, -1).join(":"),
  };
};
function checkExactOwnership(
  layers: ShipVisualLayer[],
  source: ReadonlyMap<string, OriginalCanopyCellR026>,
) {
  const seen = new Set<string>();
  for (const l of layers)
    for (let z = l.bounds[2]; z < l.bounds[5]; z++)
      for (let y = l.bounds[1]; y < l.bounds[4]; y++)
        for (let x = l.bounds[0]; x < l.bounds[3]; x++) {
          const k = visualCellKey(x, y, z),
            c = source.get(k),
            p = provenance(l);
          if (
            !c ||
            seen.has(k) ||
            l.role !== c.role ||
            l.slot !== c.slot ||
            p.occurrence !== c.occurrence ||
            p.primitive !== c.primitive
          )
            throw Error(`Wrong compacted source owner ${k}`);
          seen.add(k);
        }
  return seen;
}
describe("finite original-source Crest canopy", () => {
  it("matches the independently sampled full original primitive membership and preserves every compacted owner", () => {
    const source = originalCanopySourceCellsR026();
    // Independent original-source packet membership, not a helper-generated fixture.
    expect(source.size).toBe(83696);
    expect(signature(source.values())).toBe(
      "1a562315cfbcf7e24e556efccdb9ddc8deeb539819ab4dc94bb178a9e34fcd3f",
    );
    const layers = compactOriginalCanopyCellsR026(source);
    expect(layers.length).toBeLessThan(4000);
    expect(checkExactOwnership(layers, source).size).toBe(source.size);
    expect(sampleShipVisualLayers(layers).size).toBe(source.size);
  });
  it("never fills a concavity or merges touching cells from different original owners", () => {
    const source = new Map<string, OriginalCanopyCellR026>();
    for (const [x, y, z, primitive, occurrence] of [
      [0, 0, 0, "a", 0],
      [1, 0, 0, "a", 0],
      [0, 1, 0, "a", 0],
      [0, 0, 1, "a", 0],
      [0, 2, 0, "b", 0],
      [0, 3, 0, "b", 1],
    ] as const)
      source.set(visualCellKey(x, y, z), {
        x,
        y,
        z,
        role: "frame",
        slot: "secondary",
        primitive,
        occurrence,
      });
    const layers = compactOriginalCanopyCellsR026(source),
      actual = sampleShipVisualLayers(layers);
    expect(checkExactOwnership(layers, source).size).toBe(6);
    expect(actual.size).toBe(6);
    expect(actual.has("1,1,0")).toBe(false);
    expect(actual.has("1,0,1")).toBe(false);
  });
  it("retains the entire actual old ship and adds only the independently certified outward original-source cells", () => {
    const doc = referenceRoomLayoutR025(
        PREFAB_SHIPS.find((p) => p.id === "fed.m.crest")!,
      ),
      catalog = defaultPrefabComponentCatalog();
    const integrated = shipVisualLayersR002(
      doc,
      "flight",
      catalog,
      "federation",
    );
    const selected = integrated.filter((l) =>
      l.id.startsWith("volume:hull:r026-original-canopy:"),
    );
    const prior = integrated.filter(
        (l) => !l.id.startsWith("volume:hull:r026-original-canopy:"),
      ),
      guards = referenceOpticalGuardBoxesR002(doc, "flight", catalog);
    const added = referenceOriginalCanopySourceR026(
      doc,
      "flight",
      catalog,
      "federation",
      prior,
      guards,
    );
    expect(added).toEqual(selected);
    expect(added.length).toBeGreaterThan(0);
    expect(added.length).toBeLessThan(4000);
    validateShipVisualLayers([...prior, ...added]);
    const before = sampleShipVisualLayers(prior),
      after = sampleShipVisualLayers([...prior, ...added]),
      source = originalCanopySourceCellsR026();
    const descriptors = (c: VisualCell) => {
      const {
        normalFaces: _n,
        normalSideFaces: _s,
        facetFaces: _f,
        facetNeighbourFaces: _a,
        ...persistent
      } = c;
      return JSON.stringify(persistent);
    };
    const changed = [];
    for (const [key, c] of before)
      if (!after.has(key) || descriptors(c) !== descriptors(after.get(key)!))
        changed.push(key);
    expect(changed).toEqual([]);
    const newKeys = checkExactOwnership(added, source),
      newSource = [...newKeys].map((k) => source.get(k)!);
    expect(newKeys.size).toBe(83056);
    expect(after.size - before.size).toBe(83056);
    expect([...newKeys].filter((k) => before.has(k))).toEqual([]);
    expect(signature(newSource)).toBe(
      "a434d5560a95bfde7eb1050f1ee2077306e77b4495ecd924a6d20ae1aa6af3bb",
    );
    const omitted = [...source].filter(
      ([k, c]) => !before.has(k) && !newKeys.has(k),
    );
    expect(omitted.length).toBe(42);
    for (const [key, c] of omitted) {
      expect(c.z).toBeGreaterThanOrEqual(40);
      expect(after.has(key)).toBe(false);
    }
    for (const g of [
      { ...guards, unknownVariant: true },
      {
        ...guards,
        bounds: [
          ...guards.bounds,
          {
            piece: "unknown",
            kind: "source" as const,
            bounds: [0, 0, 0, 1, 1, 1] as ShipVisualLayer["bounds"],
          },
        ],
      },
    ])
      expect(
        referenceOriginalCanopySourceR026(
          doc,
          "flight",
          catalog,
          "federation",
          prior,
          g,
        ),
      ).toEqual([]);
    expect(
      referenceOriginalCanopySourceR026(
        doc,
        "deck",
        catalog,
        "federation",
        prior,
        guards,
      ),
    ).toEqual([]);
    expect(
      referenceOriginalCanopySourceR026(
        { ...doc, revision: doc.revision + 1 },
        "flight",
        catalog,
        "federation",
        prior,
        guards,
      ),
    ).toEqual([]);
    expect(
      referenceOriginalCanopySourceR026(
        doc,
        "flight",
        { ...catalog, list: () => [] },
        "federation",
        prior,
        guards,
      ),
    ).toEqual([]);
  }, 25000);
});
