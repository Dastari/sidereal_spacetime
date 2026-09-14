import { expect, test } from "vitest";
import source from "../../content/src/wayfarer-starter-r001.json";
import rebuild from "../../content/src/wayfarer-rebuild-r002.json";
import visuals from "../../content/src/construction-wayfarer-rebuild-visuals.json";
import proof from "../../content/src/wayfarer-walking-proof.json";
import threshold from "../../content/src/wayfarer-threshold-proof.json";
import type { ConstructionDocument } from "../../content/src/construction";
import {
  WAYFARER_REBUILD_RETAINED_OBJECT_IDS,
  planWayfarerRebuildRetainedWalking,
  checkWayfarerRebuildNativeAccess,
} from "./wayfarer-rebuild-walking";
import {
  compileDeckCollision,
  resolveDeckCollision,
} from "./construction-collision";
import { qualifyWayfarerThresholdMotion } from "./wayfarer-threshold";
import {
  planWayfarerRebuildNative,
  type WayfarerAdditionalNativePart,
} from "./wayfarer-rebuild-native-plan";
function candidate() {
  const document = structuredClone(source) as unknown as ConstructionDocument;
  document.layout.assembly!.parts = document.layout.assembly!.parts.filter(
    (p) => WAYFARER_REBUILD_RETAINED_OBJECT_IDS.includes(p.id),
  );
  document.layout.id = "wayfarer-semantic-rebuild";
  document.layout.decks[0].ceiling = 102;
  return document;
}
function frame(document = candidate()) {
  const { bindings } = planWayfarerRebuildRetainedWalking(document);
  return resolveDeckCollision(
    compileDeckCollision(document.layout, proof.deckId, {
      shipId: "candidate",
      perimeterHalfWidthM: 0,
      partitionHalfWidthM: 0,
      obstacles: bindings.flatMap((b) =>
        b.obstacles.map((o, i) => ({
          id: `${b.sourceObjectId}:${i}`,
          definitionId: b.definitionId,
          vertices: o.vertices,
        })),
      ),
    }),
    [],
  );
}
test("retains every exact cockpit, fitting, cargo and exterior obstacle while discarding superseded structural walls", () => {
  const p = planWayfarerRebuildRetainedWalking(candidate());
  expect(p.bindings).toHaveLength(81);
  expect(p.removedSourceObjects).toHaveLength(130);
  expect(
    p.removedSourceObjects.filter((o) => o.removedObstacleCount),
  ).toHaveLength(58);
  expect(
    p.removedSourceObjects
      .filter((o) => o.removedObstacleCount)
      .every((o) => o.sourceObjectId.startsWith("wall-")),
  ).toBe(true);
  for (const b of p.bindings) {
    const old = proof.bindings.find(
      (o) => o.sourceObjectId === b.sourceObjectId,
    )!;
    if (b.sourceObjectId === threshold.sourcePlacedId) {
      expect(b.obstacles).toEqual(
        threshold.sideObstacles.map((o) => ({ vertices: o.vertices })),
      );
    } else
      expect(b.obstacles).toEqual(
        old.obstacles.map((o) => ({ vertices: o.vertices })),
      );
    expect(b.deckIds).toEqual([proof.deckId]);
  }
  expect(p.thresholdLowStepSupported).toBe(true);
  const step = qualifyWayfarerThresholdMotion([0, 8.5], [0, 9.375]);
  expect(step.maximumTraversedElevationM).toBeGreaterThan(0.1875);
  expect(step.elevationM).toBe(0.1875);
});
test("native geometry supports cargo and equipment approach positions and the dedicated pilot transition", () => {
  const c = candidate();
  expect(checkWayfarerRebuildNativeAccess(c, frame(c)).approaches).toHaveLength(
    9,
  );
});
test("the proposed semantic rebuild keeps every original fixture approach with its complete new native wall reservations", () => {
  const document = structuredClone(rebuild) as unknown as ConstructionDocument;
  const spacer = visuals.parts.find(
    (p) => p.key === "wayfarer-rebuild-r001/internal-span-0.125-q4",
  );
  const native = planWayfarerRebuildNative(
    document.layout,
    spacer as WayfarerAdditionalNativePart,
  );
  expect(native.ok, native.issues.join("; ")).toBe(true);
  const { bindings } = planWayfarerRebuildRetainedWalking(document);
  const combined = resolveDeckCollision(
    compileDeckCollision(document.layout, proof.deckId, {
      shipId: "semantic-rebuild",
      perimeterHalfWidthM: 0,
      partitionHalfWidthM: 0,
      obstacles: [
        ...native.obstacles.map((o, i) => ({
          ...o,
          id: `test-native-wall:${i}`,
        })),
        ...bindings.flatMap((b) =>
          b.obstacles.map((o, i) => ({
            id: `${b.sourceObjectId}:${i}`,
            definitionId: b.definitionId,
            vertices: o.vertices,
          })),
        ),
      ],
    }),
    [],
  );
  expect(
    checkWayfarerRebuildNativeAccess(document, combined).approaches,
  ).toHaveLength(9);
});
test("a new wall cannot be hidden by the pilot seat exception or bypass blocked cargo access", () => {
  const c = candidate(),
    f = frame(c);
  for (const [a, b] of [
    [
      [-0.4, 9.8],
      [0.4, 9.8],
    ],
    [
      [-2.5, 2.0625],
      [-2, 2.0625],
    ],
  ] as const) {
    expect(() =>
      checkWayfarerRebuildNativeAccess(c, {
        ...f,
        segments: [
          ...f.segments,
          { id: "new-wall", a: [...a], b: [...b], halfWidthM: 0.125 },
        ],
      }),
    ).toThrow(/blocked/);
  }
  expect(() =>
    checkWayfarerRebuildNativeAccess(c, { ...f, obstacles: [] }),
  ).toThrow("collider");
});
test("transformed, damaged, missing, duplicated, or extra objects never reuse the original proof", () => {
  for (const mutate of [
    (c: ConstructionDocument) => {
      c.layout.assembly!.parts[0].position[0] += 0.03125;
    },
    (c: ConstructionDocument) => {
      c.layout.assembly!.parts[0].rotation += Math.PI / 2;
    },
    (c: ConstructionDocument) => {
      c.layout.assembly!.parts[0].flipped = true;
    },
    (c: ConstructionDocument) => {
      c.layout.assembly!.parts[0].removedCells.push([0, 0, 0]);
    },
    (c: ConstructionDocument) => {
      c.layout.assembly!.parts[0].assetId = "wrong-asset";
    },
    (c: ConstructionDocument) => {
      c.layout.assembly!.parts.pop();
    },
    (c: ConstructionDocument) => {
      c.layout.assembly!.parts[1] = c.layout.assembly!.parts[0];
    },
    (c: ConstructionDocument) => {
      c.layout.assembly!.parts.push(
        structuredClone(
          (source as unknown as ConstructionDocument).layout.assembly!.parts[0],
        ),
      );
    },
  ]) {
    const c = candidate();
    mutate(c);
    expect(() => planWayfarerRebuildRetainedWalking(c)).toThrow(/placement/);
  }
});
test("support union changes cannot turn geometrically separated old objects into invisible obstacles", () => {
  for (const mutate of [
    (c: ConstructionDocument) => {
      c.layout.tiles.pop();
    },
    (c: ConstructionDocument) => {
      c.layout.tiles[0].vertices[0][0]++;
    },
    (c: ConstructionDocument) => {
      c.layout.decks[0].elevation = 1;
    },
    (c: ConstructionDocument) => {
      c.floors.pop();
    },
  ]) {
    const c = candidate();
    mutate(c);
    expect(() => planWayfarerRebuildRetainedWalking(c)).toThrow(/support/);
  }
});
test("unsupported actor envelopes fail; taller supported actors retain the conservative whole frame", () => {
  for (const [r, h] of [
    [0.29, 1.8],
    [0.31, 1.8],
    [0.3, 0],
    [0.3, NaN],
    [0.3, 2.26],
  ])
    expect(() => planWayfarerRebuildRetainedWalking(candidate(), r, h)).toThrow(
      "envelope",
    );
  const tall = planWayfarerRebuildRetainedWalking(candidate(), 0.3, 2.25);
  expect(tall.thresholdLowStepSupported).toBe(false);
  expect(
    tall.bindings.find((b) => b.sourceObjectId === threshold.sourcePlacedId)!
      .obstacles,
  ).toEqual(
    proof.bindings
      .find((b) => b.sourceObjectId === threshold.sourcePlacedId)!
      .obstacles.map((o) => ({ vertices: o.vertices })),
  );
});
