import { readFileSync } from "node:fs";
import { test, expect } from "vitest";
import { WAYFARER_CONVERSION_PIN as PIN } from "@sidereal/content/wayfarer-conversion-candidate";
import {
  createWayfarerConversionCandidate,
  type WayfarerPinnedInputs,
} from "./wayfarer-conversion-candidate";
import { qualifiedWayfarerWalkingBindings } from "./wayfarer-walking-bindings";
import {
  qualifiedWayfarerThresholdBinding,
  qualifyWayfarerThresholdMotion,
  wayfarerThresholdElevation,
} from "./wayfarer-threshold";
import {
  compileDeckCollision,
  resolveDeckCollision,
  sweepDeckCircle,
  canOccupyDeck,
} from "./construction-collision";
const loc = (x: number, y: number) => ({
  shipId: "threshold",
  deckId: PIN.deckId,
  position: [x, y] as [number, number],
});
function frame() {
  const c = createWayfarerConversionCandidate(
      Object.fromEntries(
        Object.keys(PIN.sources).map((p) => [p, readFileSync(p, "utf8")]),
      ) as WayfarerPinnedInputs,
    ),
    binding = qualifiedWayfarerThresholdBinding(1.8, c.snapshot),
    bindings = qualifiedWayfarerWalkingBindings(c.snapshot, 0.3, 1.8).map(
      (b) => (b.sourceObjectId === binding.sourceObjectId ? binding : b),
    );
  return resolveDeckCollision(
    compileDeckCollision(c.document.layout, PIN.deckId, {
      shipId: "threshold",
      perimeterHalfWidthM: 0,
      partitionHalfWidthM: 0,
      obstacles: bindings.flatMap((b) =>
        b.obstacles.map((o, i) => ({
          id: b.sourceObjectId + i,
          definitionId: b.definitionId,
          vertices: o.vertices,
        })),
      ),
    }),
    [],
  );
}
test("actual native threshold and marker tops produce their measured elevations while clear floor stays unchanged", () => {
  expect(wayfarerThresholdElevation(0, 8.8)).toBeCloseTo(0.21875);
  expect(wayfarerThresholdElevation(0, 8.99)).toBeCloseTo(0.2375);
  expect(wayfarerThresholdElevation(0, 8.5)).toBe(0.1875);
  expect(wayfarerThresholdElevation(0, 9.1)).toBe(0.1875);
});
test("ordinary forward/reverse step and stopped/reconnected support remain deterministic", () => {
  const a = qualifyWayfarerThresholdMotion([0, 8.6], [0, 9.1]),
    b = qualifyWayfarerThresholdMotion([0, 9.1], [0, 8.6]);
  expect(a.maximumTraversedElevationM).toBeCloseTo(0.2375);
  expect(b.maximumTraversedElevationM).toBeCloseTo(0.2375);
  expect(a.elevationM).toBe(0.1875);
  const stopped = qualifyWayfarerThresholdMotion([0, 8.8], [0, 8.8]);
  expect(stopped.elevationM).toBe(0.21875);
  expect(stopped).toEqual(qualifyWayfarerThresholdMotion([0, 8.8], [0, 8.8]));
});
test("qualified frame allows the central path but keeps jambs/partitions and the actual seat blocked", () => {
  const f = frame();
  expect(
    sweepDeckCircle(f, loc(0, 8.3), [0, 0.9], 0.3).position[1],
  ).toBeCloseTo(9.2);
  expect(
    sweepDeckCircle(f, loc(0, 9.2), [0, -0.9], 0.3).position[1],
  ).toBeCloseTo(8.3);
  expect(canOccupyDeck(f, loc(0.5, 8.8), 0.3)).toBe(false);
  expect(canOccupyDeck(f, loc(-1.8, 8.8), 0.3)).toBe(false);
  expect(canOccupyDeck(f, loc(0, 10.25), 0.3)).toBe(false);
  expect(canOccupyDeck(f, loc(0, 9.35), 0.3)).toBe(true);
});
test("unsupported taller bodies, nonfinite poses and oversized movement cannot bypass the qualification", () => {
  const c = createWayfarerConversionCandidate(
    Object.fromEntries(
      Object.keys(PIN.sources).map((p) => [p, readFileSync(p, "utf8")]),
    ) as WayfarerPinnedInputs,
  );
  expect(() => qualifiedWayfarerThresholdBinding(2.2, c.snapshot)).toThrow(
    "envelope",
  );
  expect(() => wayfarerThresholdElevation(0, 8.8, 2.2)).toThrow("envelope");
  expect(() => qualifyWayfarerThresholdMotion([0, 8], [0, 10])).toThrow(
    "bounded",
  );
  expect(() => qualifyWayfarerThresholdMotion([NaN, 8], [0, 9])).toThrow(
    "finite",
  );
});

test("missing/altered proof cannot authorize an opening; marker support survives idle/reconnect and both direction reversals", () => {
  const c = createWayfarerConversionCandidate(
    Object.fromEntries(
      Object.keys(PIN.sources).map((p) => [p, readFileSync(p, "utf8")]),
    ) as WayfarerPinnedInputs,
  );
  expect(() =>
    qualifiedWayfarerThresholdBinding(1.8, {
      ...c.snapshot,
      canonical: c.snapshot.canonical + " ",
    }),
  ).toThrow("proof");
  expect(() =>
    qualifiedWayfarerThresholdBinding(1.8, { ...c.snapshot, sha256: "" }),
  ).toThrow("proof");
  const marker = qualifyWayfarerThresholdMotion([0, 8.99], [0, 8.99]);
  expect(marker.elevationM).toBeCloseTo(0.2375);
  expect(marker.contactKind).toBe("native-low-step");
  const persisted = JSON.parse(JSON.stringify({ x: 0, y: 8.99 }));
  expect(wayfarerThresholdElevation(persisted.x, persisted.y)).toBeCloseTo(
    marker.elevationM,
  );
  expect(
    qualifyWayfarerThresholdMotion([0, 8.99], [0, 8.8]).elevationM,
  ).toBeCloseTo(0.21875);
  expect(qualifyWayfarerThresholdMotion([0, 8.99], [0, 9.1]).elevationM).toBe(
    0.1875,
  );
});
