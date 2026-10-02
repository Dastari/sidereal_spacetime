import { describe, expect, it } from "vitest";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import type { ShipVisualLayer } from "@sidereal/content/ship-visual";
import {
  referenceCockpitApertureR002,
  shipVisualLayersR002,
} from "./ship-visual-layers-r002";
import { referenceBowTransitionR002 } from "./ship-visual-r002-bow-transition";
import { sampleShipVisualLayers, visualCellKey } from "./ship-visual-sampler";

const doc = PREFAB_SHIPS.find((d) => d.id === "fed.s.wren")!;
const catalog = defaultPrefabComponentCatalog();

describe("finite actual Wren outer pressure-case transition", () => {
  for (const view of ["deck", "flight"] as const)
    it(`${view} clips the admitted RAW outer course and keeps all original inner/optical duties`, () => {
      const integrated = shipVisualLayersR002(doc, view, catalog, "federation");
      const prior = integrated.filter((l) => !l.id.includes(":r24-source:"));
      const panes = referenceCockpitApertureR002(
        doc,
        view,
        catalog,
        "federation",
      );
      const added = referenceBowTransitionR002(
        doc,
        view,
        catalog,
        "federation",
        prior,
        panes,
      );
      const before = sampleShipVisualLayers(prior);
      const after = sampleShipVisualLayers([...prior, ...added]);
      const newlyClipped = added.filter(
        (l) =>
          !before.get(
            visualCellKey(
              ...(l.bounds.slice(0, 3) as [number, number, number]),
            ),
          )?.facet,
      );
      expect(newlyClipped).toHaveLength(view === "deck" ? 136 : 193);
      expect(after.size).toBe(before.size);
      for (const l of newlyClipped) {
        const [x, y, z] = l.bounds;
        const old = before.get(visualCellKey(x, y, z))!;
        expect(old.role).toBe("core");
        expect(l.role).toBe(old.role);
        expect(l.slot).toBe(old.slot);
        expect(l.facet!.a[0] * (x + 0.5) + l.facet!.a[1] * (y + 0.5)).toBe(
          l.facet!.d,
        );
        for (const [dx, dy] of [
          [-1, 0],
          [0, -l.facet!.a[1]],
        ])
          for (const n of [1, 2]) {
            const k = visualCellKey(x + dx * n, y + dy * n, z);
            expect(before.get(k)?.role).toBe("core");
            expect({ ...after.get(k), facetNeighbourFaces: undefined }).toEqual(
              { ...before.get(k), facetNeighbourFaces: undefined },
            );
            if (before.get(k)?.facetNeighbourFaces !== undefined)
              expect(after.get(k)?.facetNeighbourFaces).toBe(
                before.get(k)?.facetNeighbourFaces,
              );
          }
      }
      for (const [key, c] of before) {
        if (
          c.slot === "glass" ||
          c.role === "floor" ||
          c.role === "doorframe" ||
          c.slot === "emit_a" ||
          c.slot === "emit_b"
        )
          expect(after.get(key)).toEqual(c);
        if (c.facet) {
          const n = after.get(key)!;
          expect(n.facet!.a).toEqual(c.facet.a);
          expect(n.facet!.d).toBe(c.facet.d);
          expect(n.facetFaces).toBe(c.facetFaces);
          expect(n.facetNeighbourFaces).toBe(c.facetNeighbourFaces);
        }
      }
      // The actual unbacked end witness remains raw; no blanket CORE exception.
      expect(after.get("174,15,25")?.facet).toBeUndefined();
      if (view === "flight") {
        expect(newlyClipped.filter((l) => l.bounds[2] >= 32)).toHaveLength(48);
        expect(after.get("162,3,39")).toBeUndefined();
      }
      const witness = newlyClipped[0];
      const renamed: ShipVisualLayer = {
        ...witness,
        id: "unexpected-source-owner",
        facet: undefined,
      };
      expect(
        referenceBowTransitionR002(
          doc,
          view,
          catalog,
          "federation",
          [...prior, renamed],
          panes,
        ),
      ).toEqual([]);
      const [x, y, z] = witness.bounds;
      const missingBacking: ShipVisualLayer = {
        id: "lost-inner-course",
        role: "void",
        slot: "dark",
        bounds: [x - 2, y, z, x - 1, y + 1, z + 1],
      };
      expect(
        referenceBowTransitionR002(
          doc,
          view,
          catalog,
          "federation",
          [...prior, missingBacking],
          panes,
        ),
      ).toEqual([]);
      const optical: ShipVisualLayer = {
        id: "new-optical-neighbor",
        role: "core",
        slot: "glass",
        support: "volume:hull",
        bounds: [x + 1, y, z, x + 2, y + 1, z + 1],
      };
      expect(
        referenceBowTransitionR002(
          doc,
          view,
          catalog,
          "federation",
          [...prior, optical],
          panes,
        ),
      ).toEqual([]);
    }, 20_000);
});
