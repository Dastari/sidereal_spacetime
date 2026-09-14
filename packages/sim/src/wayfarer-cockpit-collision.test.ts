import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { WAYFARER_CONVERSION_PIN as PIN } from "@sidereal/content/wayfarer-conversion-candidate";
import {
  createWayfarerConversionCandidate,
  type WayfarerPinnedInputs,
} from "./wayfarer-conversion-candidate";
import { qualifyWayfarerCockpitPartitions } from "./wayfarer-cockpit-collision";
import {
  compileDeckCollision,
  resolveDeckCollision,
  sweepDeckCircle,
  canOccupyDeck,
} from "./construction-collision";
const candidate = () =>
  createWayfarerConversionCandidate(
    Object.fromEntries(
      Object.keys(PIN.sources).map((p) => [p, readFileSync(p, "utf8")]),
    ) as WayfarerPinnedInputs,
  );
function frame() {
  const c = candidate(),
    q = qualifyWayfarerCockpitPartitions(c);
  return resolveDeckCollision(
    compileDeckCollision(c.document.layout, PIN.deckId, {
      shipId: "test",
      perimeterHalfWidthM: 0.05,
      partitionHalfWidthM: 0.05,
      obstacles: q.bindings.flatMap((b) =>
        b.obstacles.map((o, i) => ({
          id: b.sourceObjectId + "-" + i,
          definitionId: b.definitionId,
          vertices: o.vertices,
        })),
      ),
    }),
    [],
  );
}
const location = (x: number, y: number) => ({
  shipId: "test",
  deckId: PIN.deckId,
  position: [x, y] as [number, number],
});
test("two real native partitions produce nonempty bounded obstacles and whole-footprint floor support proof", () => {
  const q = qualifyWayfarerCockpitPartitions(candidate());
  expect(q.bindings).toHaveLength(2);
  expect(q.bindings.every((b) => b.obstacles.length === 18)).toBe(true);
  expect(
    q.support.every(
      (s) => Math.abs(s.coveredAreaM2 - s.footprintAreaM2) < 1e-8,
    ),
  ).toBe(true);
  expect(q.remainingObjectBindings).toHaveLength(209);
  expect(q.pressureQualified).toBe(false);
});
test("native partition cover prevents crossing at standing radius without blocking its central opening", () => {
  const f = frame();
  expect(canOccupyDeck(f, location(-1.8, 8.8), 0.3)).toBe(false);
  const stopped = sweepDeckCircle(f, location(-1.8, 8), [0, 1.7], 0.3);
  expect(stopped.position[1]).toBeLessThan(8.4);
  expect(canOccupyDeck(f, location(0, 8.8), 0.3)).toBe(true);
  const clear = sweepDeckCircle(f, location(0, 8), [0, 1.7], 0.3);
  expect(clear.position[1]).toBeCloseTo(9.7);
});
test("changed native bytes, transform, damage, missing floor and deck hole fail qualification", () => {
  const mutations = [
    (c: ReturnType<typeof candidate>) => {
      c.placements.find(
        (p) => p.sourcePlacedId === "pilot-r004-rear-partition-23",
      )!.visual!.sha256 = "0".repeat(64);
    },
    (c: ReturnType<typeof candidate>) => {
      c.document.layout.assembly!.parts.find(
        (p) => p.id === "pilot-r004-rear-partition-23",
      )!.position[0] += 0.01;
    },
    (c: ReturnType<typeof candidate>) => {
      c.document.layout
        .assembly!.parts.find((p) => p.id === "pilot-r004-rear-partition-23")!
        .removedCells.push([0, 0, 0]);
    },
    (c: ReturnType<typeof candidate>) => {
      c.document.layout.tiles = [];
    },
    (c: ReturnType<typeof candidate>) => {
      c.document.layout.decks[0].holes.push({ id: "cut", seed: [0, 0] });
    },
  ];
  for (const mutate of mutations) {
    const c = candidate();
    mutate(c);
    expect(() => qualifyWayfarerCockpitPartitions(c)).toThrow("qualification");
  }
});
