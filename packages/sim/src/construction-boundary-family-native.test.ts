import { expect, test } from "vitest";
import {
  emptyLayout,
  withRequiredShapeDependency,
  transformPoint,
  type Point,
} from "@sidereal/content/ship-layout";
import { CONSTRUCTION_BOUNDARY_FAMILY_PIN } from "@sidereal/content/construction-boundary-family";
import {
  PINNED_FLOOR_KIT,
  compileConstruction,
} from "./construction-transactions";
import { bindConstructionLayout } from "./construction-layout";
import {
  planPinnedBoundaryFamily,
  pinnedFamilyCollision,
} from "./construction-boundary-family";
import {
  compileDeckCollision,
  resolveDeckCollision,
  canOccupyDeck,
} from "./construction-collision";
import { planConstructionInstance } from "./construction-instance";
function layout(part: (typeof PINNED_FLOOR_KIT.parts)[number], turns = 0) {
  const d = emptyLayout("native-family", "deck");
  d.tiles.push({
    id: "floor",
    deckId: "deck",
    shape:
      part.footprint.length === 3
        ? "triangle"
        : part.footprint.length === 5
          ? "polygon"
          : part.id === "taper-4m"
            ? "trapezoid"
            : "rectangle",
    revision:
      part.footprint.length === 5 ? "lattice-shapes-2" : "lattice-shapes-1",
    material: "metal",
    vertices: part.footprint.map((p) => transformPoint([p[0], p[1]], turns)),
  });
  return withRequiredShapeDependency(d);
}
test("all12 pinned floor shapes and quarter-turns compile with native boundary cores; collisions preserve acute extents", () => {
  let extraPhysicalBlocks = 0;
  for (const part of PINNED_FLOOR_KIT.parts)
    for (let turns = 0; turns < 4; turns++) {
      const d = layout(part, turns),
        bound = bindConstructionLayout(d).document;
      bound.boundaryKit = { ...CONSTRUCTION_BOUNDARY_FAMILY_PIN };
      const compiled = compileConstruction(JSON.stringify(bound));
      expect(compiled.readiness.pressure).toBe(false);
      const plan = planPinnedBoundaryFamily(d, "deck"),
        obstacles = pinnedFamilyCollision(d, "deck");
      expect(plan.placements.length).toBe(part.footprint.length * 2);
      const options = {
        shipId: "test",
        perimeterHalfWidthM: 0,
        partitionHalfWidthM: 0,
      };
      const frame = resolveDeckCollision(
          compileDeckCollision(d, "deck", { ...options, obstacles }),
          [],
        ),
        nominal = resolveDeckCollision(
          compileDeckCollision(d, "deck", options),
          [],
        );
      for (const o of obstacles) {
        const position: Point = [
          o.vertices.reduce((n, p) => n + p[0], 0) / o.vertices.length,
          o.vertices.reduce((n, p) => n + p[1], 0) / o.vertices.length,
        ];
        const actor = { shipId: "test", deckId: "deck", position };
        if (canOccupyDeck(nominal, actor, 0.001)) {
          extraPhysicalBlocks++;
          expect(canOccupyDeck(frame, actor, 0.001)).toBe(false);
        }
      }
    }
  expect(extraPhysicalBlocks).toBeGreaterThan(50);
});
test("spawn uses exact core geometry and rejects a floor too small for the character instead of placing inside walls", () => {
  const part = PINNED_FLOOR_KIT.parts.find((p) => p.id === "triangle-1m")!,
    d = bindConstructionLayout(layout(part)).document;
  d.boundaryKit = { ...CONSTRUCTION_BOUNDARY_FAMILY_PIN };
  const snapshot = compileConstruction(JSON.stringify(d));
  let ids = 0;
  expect(() =>
    planConstructionInstance(
      snapshot,
      {
        blueprintRevisionId: "blueprint",
        expectedBlueprintSha256: snapshot.sha256,
        sourceDeckId: "deck",
        bodyRadiusM: 0.3,
        bodyHeightM: 1.8,
        perimeterHalfWidthM: 0,
        partitionHalfWidthM: 0,
        objectCollisionBindings: [],
      },
      () => {
        ids++;
        return "00000000-0000-4000-8000-000000000001";
      },
    ),
  ).toThrow(/No safe spawn/);
  expect(ids).toBe(0);
  const bad = JSON.parse(snapshot.canonical);
  bad.boundaryKit.sha256 = "0".repeat(64);
  expect(() => compileConstruction(JSON.stringify(bad))).toThrow(
    /Pinned boundary/,
  );
});

test("extended polygon catalog is an explicit dependency upgrade and preserves legacy drafts", () => {
  const old = emptyLayout("legacy", "deck"),
    before = JSON.stringify(old);
  expect(withRequiredShapeDependency(old)).toBe(old);
  expect(JSON.stringify(old)).toBe(before);
  const poly = layout(
    PINNED_FLOOR_KIT.parts.find((p) => p.id === "corner-clipped")!,
  );
  expect(poly.dependencies.find((d) => d.id === "floor-shapes")?.revision).toBe(
    "lattice-shapes-2",
  );
  const mismatch = structuredClone(poly);
  mismatch.dependencies[0].revision = "lattice-shapes-1";
  expect(() =>
    compileConstruction(
      JSON.stringify(bindConstructionLayout(mismatch).document),
    ),
  ).toThrow(/shape revision/);
  const future = structuredClone(poly);
  future.dependencies[0].revision = "future-unknown";
  expect(() =>
    compileConstruction(
      JSON.stringify(bindConstructionLayout(future).document),
    ),
  ).toThrow(/preserve/);
});
