import { describe, expect, it } from "vitest";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
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
  referenceBowCasesR026,
  REFERENCE_BOW_CASE_BODIES_R026,
} from "./ship-visual-r002-bow-cases-r026";
import {
  sampleShipVisualLayers,
  visualCellKey,
  type VisualCell,
} from "./ship-visual-sampler";

describe("actual four broad private Wren bow casings", () => {
  it("retains every actual roof/core/optical cell and admits only the exact new backed bodies", () => {
    const doc = PREFAB_SHIPS.find((d) => d.id === "fed.s.wren")!;
    const catalog = defaultPrefabComponentCatalog();
    const integrated = shipVisualLayersR002(
      doc,
      "flight",
      catalog,
      "federation",
    );
    const selected = integrated.filter((l) =>
      l.id.startsWith("volume:hull:r026-broad-bow:"),
    );
    const prior = integrated.filter(
      (l) => !l.id.startsWith("volume:hull:r026-broad-bow:"),
    );
    const guards = referenceOpticalGuardBoxesR002(doc, "flight", catalog);
    const added = referenceBowCasesR026(
      doc,
      "flight",
      "federation",
      prior,
      guards,
    );
    expect(added).toEqual(selected);
    expect(added.length).toBeGreaterThan(0);
    expect(added.length).toBeLessThan(600);
    expect(() => validateShipVisualLayers([...prior, ...added])).not.toThrow();
    const before = sampleShipVisualLayers(prior);
    const after = sampleShipVisualLayers([...prior, ...added]);
    const descriptors = (c: VisualCell) => {
      const {
        normalFaces: _n,
        normalSideFaces: _s,
        facetFaces: _f,
        facetNeighbourFaces: _a,
        ...d
      } = c;
      return JSON.stringify(d);
    };
    const changed: string[] = [];
    for (const [k, c] of before)
      if (!after.has(k) || descriptors(c) !== descriptors(after.get(k)!))
        changed.push(k);
    expect(changed).toEqual([]);
    const newCells = [...after]
      .filter(([k]) => !before.has(k))
      .map(([, c]) => c);
    expect(newCells.length).toBeGreaterThan(2000);
    for (const c of newCells) {
      const body = REFERENCE_BOW_CASE_BODIES_R026.find(({ bounds: b }) =>
        [c.x, c.y, c.z].every((v, i) => v >= b[i] && v < b[i + 3]),
      );
      if (!body)
        throw Error(`New cell outside finite body: ${c.x},${c.y},${c.z}`);
      if (
        guards.bounds.some(({ bounds: g }) =>
          [c.x, c.y, c.z].every((v, i) => v < g[i + 3] && v + 1 > g[i]),
        )
      )
        throw Error(
          `New cell intersects complete optical guard: ${c.x},${c.y},${c.z}`,
        );
      if (c.normalChart !== undefined || c.normalHint !== undefined)
        throw Error(
          `New manufactured cell borrowed a sloped normal chart: ${c.x},${c.y},${c.z}`,
        );
    }
    // True open two-course wells above original surface, with new backing;
    // both substantial metal components share a positive backing volume.
    for (const { bounds: b } of REFERENCE_BOW_CASE_BODIES_R026) {
      const x = b[0] + 2,
        y = b[1] + 3;
      expect(after.get(visualCellKey(x, y, b[5] - 3))?.slot).toBe("dark");
      expect(before.has(visualCellKey(x, y, b[5] - 3))).toBe(false);
      for (const z of [b[5] - 2, b[5] - 1])
        expect(after.has(visualCellKey(x, y, z))).toBe(false);
      for (const [index, xx] of [b[0] + 3, b[3] - 5].entries()) {
        const yy = b[1] + 5 + index * 2;
        expect(after.get(visualCellKey(xx, yy, b[5] - 3))?.slot).toBe("metal");
        expect(after.get(visualCellKey(xx, yy, b[5] - 1))).toBeUndefined();
      }
    }
    const badGuards = {
      ...guards,
      bounds: guards.bounds.map((g, i) =>
        i
          ? g
          : {
              ...g,
              bounds: [143, 8, 40, 158, 28, 47] as ShipVisualLayer["bounds"],
            },
      ),
    };
    for (const g of [{ ...guards, unknownVariant: true }, badGuards])
      expect(
        referenceBowCasesR026(doc, "flight", "federation", prior, g),
      ).toEqual([]);
    expect(
      referenceBowCasesR026(
        { ...doc, revision: doc.revision + 1 },
        "flight",
        "federation",
        prior,
        guards,
      ),
    ).toEqual([]);
    expect(
      referenceBowCasesR026(doc, "deck", "federation", prior, guards),
    ).toEqual([]);
    expect(
      referenceBowCasesR026(doc, "flight", "riftjack", prior, guards),
    ).toEqual([]);
    const obstruction: ShipVisualLayer = {
      id: "changed-owner",
      role: "plate",
      slot: "primary",
      support: "volume:hull",
      surfaceRole: "roof",
      bounds: [144, 8, 42, 145, 9, 43],
    };
    expect(
      referenceBowCasesR026(
        doc,
        "flight",
        "federation",
        [...prior, obstruction],
        guards,
      ),
    ).toEqual([]);
    expect(
      referenceBowCasesR026(
        doc,
        "flight",
        "federation",
        [
          ...prior,
          {
            ...obstruction,
            id: "missing-core",
            role: "void",
            bounds: [144, 8, 41, 145, 9, 42],
          },
        ],
        guards,
      ),
    ).toEqual([]);
  }, 15_000);
});
