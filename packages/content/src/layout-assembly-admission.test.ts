import { it, expect } from "vitest";
import { emptyLayout } from "./ship-layout";
import type { PartCatalog } from "./assembly";
import {
  layoutVisualParts,
  editVisualPart,
  assemblyMismatches,
  importShipAssembly,
} from "./layout-assembly";
const catalog: PartCatalog = {
  schema: "sidereal.part-catalog.v1",
  assets: ["visual", "proxy"].map((id) => ({
    id,
    label: id,
    category: "equipment",
    nodes: [],
    bounds: { min: [0, 0, 0], max: [1, 1, 1] },
  })),
};
function fitting() {
  const d = emptyLayout("fit-review", "main");
  d.fittings = [
    {
      id: "fit",
      deckId: "main",
      definitionId: "visual",
      revision: "retained-part-library-v1",
      position: [32, 32],
      quarterTurns: 0,
      reflected: false,
      footprint: [32, 32],
      clearance: 0,
      kind: "equipment",
      container: null,
    },
  ];
  return d;
}
it("does not silently round a finer yaw, sub-lattice move, or vertical change into a legacy fitting", () => {
  const d = fitting(),
    before = JSON.stringify(d),
    p = layoutVisualParts(d, catalog)[0];
  expect(() =>
    editVisualPart(d, { ...p, rotation: Math.PI / 36 }, catalog),
  ).toThrow("finer rotation");
  expect(() =>
    editVisualPart(d, { ...p, position: [1 + 1 / 64, 1, 0] }, catalog),
  ).toThrow("1/32");
  expect(() =>
    editVisualPart(d, { ...p, position: [1, 1, 0.25] }, catalog),
  ).toThrow("stay on its deck");
  expect(JSON.stringify(d)).toBe(before);
  expect(
    editVisualPart(d, { ...p, rotation: -Math.PI / 2 }, catalog).fittings[0]
      .quarterTurns,
  ).toBe(3);
});
it("keeps a placement blocked when its secondary fitting proxy pin is missing or stale", () => {
  const d = importShipAssembly(
    {
      schema: "sidereal.assembly-draft.v1",
      id: "source",
      name: "Source",
      parts: [
        {
          id: "part",
          assetId: "visual",
          position: [0, 0, 0],
          rotation: 0,
          flipped: false,
          removedCells: [],
          fittingProxy: { assetId: "proxy", offset: [0, 0, 0] },
        },
      ],
    },
    catalog,
    "review",
    "main",
  );
  expect(assemblyMismatches(d, catalog)).toEqual([]);
  expect(
    assemblyMismatches(d, {
      ...catalog,
      assets: catalog.assets.filter((a) => a.id !== "proxy"),
    }),
  ).toEqual(["part"]);
  d.assembly!.revisions.proxy = "stale";
  expect(assemblyMismatches(d, catalog)).toEqual(["part"]);
});
