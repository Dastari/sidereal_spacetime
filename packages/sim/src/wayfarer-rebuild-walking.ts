import source from "@sidereal/content/wayfarer-starter-r001.json";
import proof from "@sidereal/content/wayfarer-walking-proof.json";
import threshold from "@sidereal/content/wayfarer-threshold-proof.json";
import type { ConstructionDocument } from "@sidereal/content/construction";
import type { Point } from "@sidereal/content/ship-layout";
import { LAB_STORAGE_FIXTURES } from "@sidereal/content/storage-fixtures";
import { LAB_INTERACTIONS } from "@sidereal/content/interactions";
import type { SpawnObjectCollisionBinding } from "./construction-instance";
import type { DeckCollisionFrame } from "./construction-collision";
import { canOccupyDeck, sweepDeckCircle } from "./construction-collision";
import { stableStringify } from "./layout-geometry";

/** Explicit retained placement set for the semantic rebuild. Labels/categories are
 * not used to infer collision or to silently admit additional source objects. */
export const WAYFARER_REBUILD_RETAINED_OBJECT_IDS: readonly string[] =
  Object.freeze([
    "equipment-control-seat",
    "equipment-control-console",
    "equipment-locker--4.7--6",
    "equipment-locker--4.7--2",
    "equipment-locker--4.7-2",
    "equipment-locker-4.7--6",
    "equipment-locker-4.7--2",
    "equipment-locker-4.7-2",
    "superstructure--3--5",
    "superstructure--2--5",
    "superstructure--3--4",
    "superstructure--3--3",
    "superstructure--3--2",
    "superstructure--3--1",
    "superstructure--3-0",
    "superstructure--3-1",
    "superstructure--3-2",
    "superstructure--3-3",
    "superstructure--3-4",
    "superstructure-2--5",
    "superstructure-3--5",
    "superstructure-3--4",
    "superstructure-3--3",
    "superstructure-3--2",
    "superstructure-3--1",
    "superstructure-3-0",
    "superstructure-3-1",
    "superstructure-3-2",
    "superstructure-3-3",
    "superstructure-3-4",
    "superstructure--1--5",
    "superstructure-0--5",
    "superstructure-1--5",
    "room-engineering",
    "room-hydroponics-tray--2.4",
    "room-hydroponics-tray--1.5",
    "room-hydroponics-tray--0.6",
    "room-storage-container-2.15-0.25",
    "room-storage-container-2.15-1",
    "room-storage-container-3.5-0.25",
    "room-storage-container-3.5-1",
    "room-crew",
    "room-medbay",
    "room-lounge",
    "equipment-bridge-bank--1.3",
    "equipment-bridge-bank-1.3",
    "drives-main--3.6",
    "drives-main-3.6",
    "drives-main-0",
    "drives-maneuver--1--6.5",
    "drives-maneuver--1-6.5",
    "drives-maneuver-1--6.5",
    "drives-maneuver-1-6.5",
    "drives-retro--1",
    "drives-retro-1",
    "pilot-r004-hull-straight-07",
    "pilot-r004-canopy-side-08",
    "pilot-r004-hull-straight-09",
    "pilot-r004-canopy-side-left-10",
    "pilot-r004-hull-diagonal45-11",
    "pilot-r004-canopy-diagonal45-12",
    "pilot-r004-hull-diagonal45-13",
    "pilot-r004-canopy-diagonal45-14",
    "pilot-r004-bow-transom-15",
    "pilot-r004-canopy-nose-16",
    "pilot-r004-corner-buttress-17",
    "pilot-r004-corner-buttress-18",
    "pilot-r004-airlock-frame-22",
    "pilot-r004-pilot-roof-25",
    "pilot-context-vestibule-roof-0",
    "pilot-context-vestibule-roof-1",
    "pilot-context-vestibule-roof-2",
    "pilot-r005-outer-shoulder-transition-starboard",
    "pilot-r005-outer-shoulder-transition-port",
    "pilot-r005-outer-roof-collar-starboard",
    "pilot-r005-outer-roof-collar-port",
    "pilot-r005-outer-diagonal-cheek-starboard",
    "pilot-r005-outer-diagonal-cheek-port",
    "pilot-r005-outer-bow-bumper-center",
    "pilot-r004-rear-partition-23",
    "pilot-r004-rear-partition-24",
  ]);
const retained = new Set(WAYFARER_REBUILD_RETAINED_OBJECT_IDS);
const originals = new Map(source.layout.assembly.parts.map((p) => [p.id, p]));
function requireMatch(value: unknown, message: string): asserts value {
  if (!value) throw Error("Wayfarer rebuild retained walking: " + message);
}

/** Partial adapter, NOT a blueprint/flight qualifier. The caller must first verify
 * its exact new candidate hash and independently install new boundary/door collision.
 * Reuse is valid only for unchanged native transforms AND unchanged support union:
 * the old proof's empty obstacles include geometric floor separation evidence.
 * No old removed wall or roof collider is transplanted onto the new structure. */
export function planWayfarerRebuildRetainedWalking(
  document: ConstructionDocument,
  bodyRadiusM = 0.3,
  bodyHeightM = 1.8,
) {
  requireMatch(
    bodyRadiusM === 0.3 &&
      Number.isFinite(bodyHeightM) &&
      bodyHeightM > 0 &&
      bodyHeightM <= proof.standingSlabM[1] - proof.standingSlabM[0],
    "unsupported actor envelope",
  );
  const layout = document.layout;
  requireMatch(
    layout.decks.length === 1 &&
      layout.decks[0].id === proof.deckId &&
      layout.decks[0].elevation === 0 &&
      !layout.decks[0].holes.length &&
      layout.playableDeckId === proof.deckId,
    "unchanged supported deck required",
  );
  requireMatch(
    stableStringify(layout.tiles) === stableStringify(source.layout.tiles) &&
      stableStringify(document.floors) === stableStringify(source.floors) &&
      stableStringify(document.floorKit) === stableStringify(source.floorKit),
    "unchanged native floor support required",
  );
  const placements = layout.assembly?.parts ?? [];
  requireMatch(
    placements.length === retained.size &&
      new Set(placements.map((p) => p.id)).size === retained.size,
    "exact retained placement set required",
  );
  for (const p of placements)
    requireMatch(
      retained.has(p.id) &&
        stableStringify(p) === stableStringify(originals.get(p.id)),
      "unexpected or changed native placement: " + p.id,
    );
  const selected = proof.bindings.filter((b) => retained.has(b.sourceObjectId));
  requireMatch(
    selected.length === retained.size,
    "complete native collision evidence required",
  );
  const bindings: SpawnObjectCollisionBinding[] = selected.map((b) => {
    const useThreshold =
      b.sourceObjectId === threshold.sourcePlacedId &&
      bodyHeightM <= threshold.maximumBodyHeightM;
    return {
      sourceObjectId: b.sourceObjectId,
      definitionId: useThreshold
        ? "wayfarer-native-frame-lowstep-r001"
        : "wayfarer-walk-r001-" + b.assetId,
      deckIds: [proof.deckId],
      obstacles: (useThreshold ? threshold.sideObstacles : b.obstacles).map(
        (o) => ({
          vertices: o.vertices.map(([x, y]): Point => [x, y]),
        }),
      ),
    };
  });
  return {
    bindings,
    nativeProofSourceSha256: proof.documentSha256,
    floorElevationM: threshold.floorElevationM,
    thresholdLowStepSupported: bodyHeightM <= threshold.maximumBodyHeightM,
    removedSourceObjects: proof.bindings
      .filter((b) => !retained.has(b.sourceObjectId))
      .map((b) => ({
        sourceObjectId: b.sourceObjectId,
        classification: b.classification,
        removedObstacleCount: b.obstacles.length,
      })),
    requiredIndependentQualification: [
      "new boundaries and openings",
      "exact candidate identity",
      "instance mapping",
      "flight and pressure",
    ] as const,
  };
}

/** Checks source-coordinate access against the FULL proposed collision frame.
 * Retained cargo/interaction approach points must remain occupiable; this does not
 * grant inventory access. Seating removes only the exact seat collider, never a wall.
 * Invoke before UUID remapping. Instance authority still checks grants and revisions. */
export function checkWayfarerRebuildNativeAccess(
  document: ConstructionDocument,
  frame: DeckCollisionFrame,
) {
  const plan = planWayfarerRebuildRetainedWalking(document);
  requireMatch(
    frame.deckId === proof.deckId,
    "source deck collision frame required",
  );
  const expected = plan.bindings.flatMap((b) =>
    b.obstacles.map((o, i) => ({
      id: `${b.sourceObjectId}:${i}`,
      vertices: o.vertices,
    })),
  );
  for (const e of expected) {
    const actual = frame.obstacles.filter((o) => o.id === e.id);
    requireMatch(
      actual.length === 1 &&
        stableStringify(actual[0].vertices) === stableStringify(e.vertices),
      "missing or changed native collider: " + e.id,
    );
    for (let i = 0; i < e.vertices.length; i++) {
      const id = `obstacle:${JSON.stringify([e.id, i])}`;
      const edges = frame.segments.filter((s) => s.id === id);
      requireMatch(
        edges.length === 1 &&
          edges[0].halfWidthM === 0 &&
          stableStringify(edges[0].a) === stableStringify(e.vertices[i]) &&
          stableStringify(edges[0].b) ===
            stableStringify(e.vertices[(i + 1) % e.vertices.length]),
        "missing or changed native collider edge: " + id,
      );
    }
  }
  const location = (position: Point) => ({
    shipId: frame.shipId,
    deckId: frame.deckId,
    position,
  });
  const approaches = [
    { id: "equipment-control-seat", position: [0, 9.375] as Point },
    ...LAB_STORAGE_FIXTURES.map((f) => ({
      id: f.placementId,
      position: [f.approachX, f.approachY] as Point,
    })),
    ...LAB_INTERACTIONS.map((f) => ({
      id: f.placementId,
      position: [f.approachX, f.approachY] as Point,
    })),
  ];
  for (const a of approaches)
    requireMatch(
      canOccupyDeck(frame, location(a.position), 0.3),
      "blocked fixture approach: " + a.id,
    );
  const seatObstacles = frame.obstacles.filter((o) =>
    o.id.startsWith("equipment-control-seat:"),
  );
  requireMatch(
    seatObstacles.length === 1,
    "exact native seat collider required",
  );
  const seatEdges = new Set(
    seatObstacles.flatMap((o) =>
      o.vertices.map((_, i) => `obstacle:${JSON.stringify([o.id, i])}`),
    ),
  );
  requireMatch(
    frame.segments.filter((s) => seatEdges.has(s.id)).length === seatEdges.size,
    "complete native seat edges required",
  );
  const transition = {
    ...frame,
    obstacles: frame.obstacles.filter((o) => !seatObstacles.includes(o)),
    segments: frame.segments.filter((s) => !seatEdges.has(s.id)),
  };
  requireMatch(
    canOccupyDeck(transition, location([0, 10.25]), 0.3),
    "blocked pilot seat",
  );
  const seated = sweepDeckCircle(
    transition,
    location([0, 9.375]),
    [0, 0.875],
    0.3,
  );
  requireMatch(
    Math.hypot(seated.position[0], seated.position[1] - 10.25) < 1e-5,
    "blocked seating transition",
  );
  return {
    approaches,
    pilotSeatM: [0, 10.25, threshold.floorElevationM] as const,
  };
}
