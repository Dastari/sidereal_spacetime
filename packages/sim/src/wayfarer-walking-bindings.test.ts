import { readFileSync } from "node:fs";
import { test, expect } from "vitest";
import proof from "../../content/src/wayfarer-walking-proof.json";
import { WAYFARER_CONVERSION_PIN as PIN } from "../../content/src/wayfarer-conversion-candidate";
import {
  createWayfarerConversionCandidate,
  type WayfarerPinnedInputs,
} from "./wayfarer-conversion-candidate";
import {
  qualifiedWayfarerWalkingBindings,
  qualifiedWayfarerInstanceObstacles,
} from "./wayfarer-walking-bindings";
import { planConstructionInstance } from "./construction-instance";
const candidate = () =>
  createWayfarerConversionCandidate(
    Object.fromEntries(
      Object.keys(PIN.sources).map((p) => [p, readFileSync(p, "utf8")]),
    ) as WayfarerPinnedInputs,
  );
test("every source object has a qualified obstacle or explicit geometric separation; full candidate can allocate two independent supported instances", () => {
  const c = candidate(),
    bindings = qualifiedWayfarerWalkingBindings(c.snapshot, 0.3, 1.8);
  expect(bindings).toHaveLength(211);
  let n = 0;
  const uuid = () =>
    `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}`;
  const request = {
    blueprintRevisionId: "qualified-review-r001",
    expectedBlueprintSha256: c.snapshot.sha256,
    sourceDeckId: PIN.deckId,
    bodyRadiusM: 0.3,
    bodyHeightM: 1.8,
    perimeterHalfWidthM: 0.05,
    partitionHalfWidthM: 0.05,
    objectCollisionBindings: bindings,
  };
  const a = planConstructionInstance(c.snapshot, request, uuid),
    b = planConstructionInstance(c.snapshot, request, uuid);
  expect(a.mappings.objects).toHaveLength(211);
  expect(a.mappings.floors).toHaveLength(51);
  expect(a.allocatedIds.some((id) => b.allocatedIds.includes(id))).toBe(false);
  expect(a.spawn.walkingElevationM).toBe(0.1875);
  expect(a.readiness.pressure).toBe(false);
  const instance = {
    id: a.instanceId,
    blueprintSha256: a.blueprintSha256,
    documentJson: JSON.stringify(a.document),
    idMapJson: JSON.stringify(a.mappings),
  };
  expect(
    qualifiedWayfarerInstanceObstacles(instance, a.spawn.deckId),
  ).toHaveLength(98);
  const altered = structuredClone(a.document);
  altered.layout.assembly!.parts[0].position[0] += 0.1;
  expect(() =>
    qualifiedWayfarerInstanceObstacles(
      { ...instance, documentJson: JSON.stringify(altered) },
      a.spawn.deckId,
    ),
  ).toThrow();
  expect(() =>
    qualifiedWayfarerInstanceObstacles(
      {
        ...instance,
        idMapJson: JSON.stringify({ ...a.mappings, objects: [] }),
      },
      a.spawn.deckId,
    ),
  ).toThrow();
});
test("nonblocking classifications are exclusively height or supported-floor separation, never asset labels", () => {
  for (const b of proof.bindings) {
    if (!b.obstacles.length)
      expect([
        "outside-standing-height-slab",
        "outside-supported-floor-union",
      ]).toContain(b.classification);
    else expect(b.classification).toBe("conservative-standing-obstacle");
  }
});
test("source drift, forged hash and unsupported actor envelopes cannot reuse the qualified bindings", () => {
  const c = candidate();
  expect(() =>
    qualifiedWayfarerWalkingBindings(
      { ...c.snapshot, canonical: c.snapshot.canonical + " " },
      0.3,
      1.8,
    ),
  ).toThrow("source");
  expect(() =>
    qualifiedWayfarerWalkingBindings(
      { ...c.snapshot, sha256: "0".repeat(64) },
      0.3,
      1.8,
    ),
  ).toThrow("source");
  for (const [r, h] of [
    [0.31, 1.8],
    [0.2, 1.8],
    [0.3, 2.26],
    [0.3, NaN],
  ])
    expect(() => qualifiedWayfarerWalkingBindings(c.snapshot, r, h)).toThrow(
      "envelope",
    );
});
