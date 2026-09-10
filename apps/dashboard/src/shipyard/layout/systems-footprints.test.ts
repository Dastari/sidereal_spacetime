import { expect, it } from "vitest";
import { emptyLayout } from "@sidereal/content/ship-layout";
import type { PartCatalog } from "@sidereal/content/assembly";
import { systemsFootprints } from "./systems-footprints";

it("projects rotated mirrored equipment in metres and excludes other decks and structural walls", () => {
  const doc = emptyLayout("ship", "a");
  doc.decks[0].ceiling = 96;
  const catalog: PartCatalog = {
    schema: "sidereal.part-catalog.v1",
    assets: [
      {
        id: "reactor",
        label: "Fusion reactor",
        category: "equipment",
        nodes: [],
        bounds: { min: [0, 0, 0], max: [2, 1, 1] },
      },
      {
        id: "wall",
        label: "Wall",
        category: "wall",
        nodes: [],
        bounds: { min: [0, 0, 0], max: [2, 1, 1] },
      },
    ],
  };
  doc.assembly = {
    schema: "sidereal.layout-assembly.v1",
    source: null,
    revisions: {},
    parts: [
      {
        id: "placed",
        assetId: "reactor",
        position: [3, 4, 0],
        rotation: Math.PI / 2,
        flipped: true,
        removedCells: [],
      },
      {
        id: "upper",
        assetId: "reactor",
        position: [0, 0, 3],
        rotation: 0,
        flipped: false,
        removedCells: [],
      },
      {
        id: "wall",
        assetId: "wall",
        position: [0, 0, 0],
        rotation: 0,
        flipped: false,
        removedCells: [],
      },
    ],
  };
  const footprints = systemsFootprints(doc, catalog, "a");
  expect(footprints.map((f) => f.id)).toEqual(["placed"]);
  expect(footprints[0].center[0]).toBeCloseTo(80);
  expect(footprints[0].center[1]).toBeCloseTo(96);
  expect(footprints[0].name).toBe("Fusion reactor");
});
