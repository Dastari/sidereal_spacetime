import { expect, test } from "vitest";
import { planNativeRoofs } from "./construction-roofs";
import { CONSTRUCTION_ROOF_INTERFACES as kit } from "@sidereal/content/construction-roof";
import { emptyLayout, type Point } from "@sidereal/content/ship-layout";
import type { ConstructionDocument } from "@sidereal/content/construction";

function fixture(): Pick<ConstructionDocument, "layout" | "floors"> {
  const layout = emptyLayout("roof-fixture", "deck");
  const deck = layout.decks[0];
  deck.roof = true;
  return {
    layout,
    floors: [
      {
        id: "floor",
        deckId: deck.id,
        partId: "square-2m",
        origin: [0, 0, deck.elevation],
        quarterTurns: 0,
        reflected: false,
      },
    ],
  };
}
test("all twelve native roof footprints retain exact paired floor placement and rotations", () => {
  for (const p of kit.parts)
    for (const quarterTurns of [0, 1, 2, 3] as const) {
      const f = fixture();
      f.floors[0].partId = p.id;
      f.floors[0].quarterTurns = quarterTurns;
      f.floors[0].origin = [128, -64, 0];
      const result = planNativeRoofs(f, f.layout.decks[0].id);
      expect(result).toEqual([
        {
          key: "roof:floor",
          floorId: "floor",
          partId: p.id,
          origin: [128, -64, 96],
          quarterTurns,
        },
      ]);
    }
});
test("roof-off decks remain uncovered and explicit invalid transforms fail", () => {
  const f = fixture(),
    id = f.layout.decks[0].id;
  f.layout.decks[0].roof = false;
  expect(planNativeRoofs(f, id)).toEqual([]);
  f.layout.decks[0].roof = true;
  f.floors[0].reflected = true;
  expect(() => planNativeRoofs(f, id)).toThrow(/transform/);
  f.floors[0].reflected = false;
  f.layout.decks[0].ceiling = 100;
  expect(() => planNativeRoofs(f, id)).toThrow(/datum/);
});
test("upper deck must clear actual roof envelope where its floors overlap", () => {
  const f = fixture(),
    id = f.layout.decks[0].id;
  f.layout.decks.push({
    ...f.layout.decks[0],
    id: "upper",
    order: 1,
    elevation: 101,
  });
  f.layout.tiles = [
    {
      id: "upper-tile",
      deckId: "upper",
      shape: "rectangle",
      revision: "lattice-shapes-1",
      material: "metal",
      vertices: [
        [0, 0],
        [64, 0],
        [64, 64],
        [0, 64],
      ],
    },
  ];
  expect(() => planNativeRoofs(f, id)).toThrow(/intersects/);
  f.layout.decks[1].elevation = 102;
  expect(planNativeRoofs(f, id)).toHaveLength(1);
  f.layout.decks[1].elevation = 100;
  f.layout.tiles[0].vertices = f.layout.tiles[0].vertices.map(
    (p) => [p[0] + 64, p[1]] as Point,
  );
  expect(planNativeRoofs(f, id)).toHaveLength(1);
});
