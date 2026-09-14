import { expect, it } from "vitest";
import {
  emptyLayout,
  stampTile,
  transformPoint,
  type Point,
} from "@sidereal/content/ship-layout";
import { compileLayout } from "@sidereal/sim/layout-compiler";
import { complexVisualPerimeters } from "./layout-complex-visual-plan";
import { planLayoutInsetVisuals } from "./layout-inset-visual-plan";

function fixture(q = 0, mirror = false) {
  const doc = emptyLayout("complex-review", "deck");
  doc.decks[0].ceiling = 102;
  doc.decks[0].roof = true;
  doc.structure = {
    schema: "sidereal.layout-structure.v2",
    wallConvention: "inset250-v1",
    grid: 16,
    hull: {
      id: "review",
      name: "review",
      revision: "1",
      width: 1024,
      length: 1024,
      height: 112,
      origin: [-512, -512, 0],
    },
    tileStyles: {},
    wallFaces: {},
    armor: [],
    navigationReservations: [],
    deckProfiles: [
      {
        deckId: "deck",
        floorThickness: 6,
        clearHeight: 96,
        roofThickness: 4,
        serviceVoid: 6,
        pitch: 112,
      },
    ],
    boundaryTreatments: [],
  };
  doc.tiles = [
    stampTile("square", "deck", "rectangle", [0, 0]),
    stampTile("left", "deck", "trapezoid", [0, 64]),
    stampTile("right", "deck", "trapezoid", [64, 64], 3),
  ];
  doc.tiles = doc.tiles.map((t) => ({
    ...t,
    vertices: t.vertices.map((p) => transformPoint(p, q, mirror) as Point),
  }));
  return doc;
}
it("fills the three-tile legacy floorplan and its concave joins with exact native requests", () => {
  for (let q = 0; q < 4; q++)
    for (const mirror of [false, true]) {
      const doc = fixture(q, mirror),
        compiled = compileLayout(doc);
      expect(
        compiled.diagnostics.filter((d) => d.severity === "error"),
      ).toEqual([]);
      const direct = complexVisualPerimeters(compiled.walls, "deck", 0);
      expect(direct.issues).toEqual([]);
      expect(
        direct.placements.some(
          (p) =>
            p.yawRadians !== undefined &&
            Math.abs(p.yawRadians % (Math.PI / 2)) > 0.01,
        ),
      ).toBe(true);
      const plan = planLayoutInsetVisuals({
        document: doc,
        compiled,
        deckId: "deck",
      });
      expect(plan.issues).toEqual([]);
      expect(
        plan.requests.filter((p) => p.key.startsWith("legacy-trapezoid")),
      ).toHaveLength(2);
      expect(
        plan.requests.filter((p) => p.key.startsWith("complex-")),
      ).toHaveLength(direct.placements.length);
      for (const p of direct.placements)
        expect(
          plan.requests.some(
            (r) =>
              r.key.endsWith("/" + p.profileId + "-q4") &&
              JSON.stringify(r.originM) ===
                JSON.stringify(p.originUnits.map((v) => v / 32)) &&
              r.yawRadians === p.yawRadians,
          ),
        ).toBe(true);
    }
});
it("never uses the additive opaque kit to bypass an unsupported treatment", () => {
  const doc = fixture(),
    compiled = compileLayout(doc);
  const walls = structuredClone(compiled.walls);
  walls[0].treatment!.intent = "open";
  expect(complexVisualPerimeters(walls, "deck", 0).placements).toEqual([]);
  expect(
    complexVisualPerimeters(walls, "deck", 0).issues.length,
  ).toBeGreaterThan(0);
});
