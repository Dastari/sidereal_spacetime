import proof from "../../content/src/wayfarer-cockpit-partition-proof.json";
import { WAYFARER_CONVERSION_PIN as PIN } from "../../content/src/wayfarer-conversion-candidate";
import type { Point } from "../../content/src/ship-layout";
import type { WayfarerConversionCandidate } from "./wayfarer-conversion-candidate";
import type { SpawnObjectCollisionBinding } from "./construction-instance";
import { cross, area2 } from "./layout-geometry";

function requireProof(ok: unknown, reason: string): asserts ok {
  if (!ok) throw Error("Wayfarer cockpit qualification: " + reason);
}
/** Convex polygon clipping proves whole projected cover is on the nonoverlapping
 * nominal floor union, including seams. This is support containment, not load rating. */
function intersection(subject: Point[], clip: Point[]): Point[] {
  let output = subject;
  for (let i = 0; i < clip.length; i++) {
    const a = clip[i],
      b = clip[(i + 1) % clip.length],
      input = output;
    output = [];
    if (!input.length) break;
    for (let j = 0; j < input.length; j++) {
      const p = input[j],
        q = input[(j + 1) % input.length],
        dp = cross(a, b, p),
        dq = cross(a, b, q);
      if (dp >= 0) output.push(p);
      if (dp >= 0 !== dq >= 0) {
        const t = dp / (dp - dq);
        output.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
  }
  return output;
}
export function qualifyWayfarerCockpitPartitions(
  candidate: WayfarerConversionCandidate,
) {
  const bindings: SpawnObjectCollisionBinding[] = [];
  const support: {
    placedId: string;
    coveredAreaM2: number;
    footprintAreaM2: number;
    walkingDatumM: number;
  }[] = [];
  const deck = candidate.document.layout.decks.find((d) => d.id === PIN.deckId);
  requireProof(
    deck && deck.elevation === 0 && deck.holes.length === 0,
    "exact original deck without holes required",
  );
  const floors = candidate.document.layout.tiles
    .filter((t) => t.deckId === PIN.deckId)
    .map((t) => t.vertices.map(([x, y]): Point => [x / 32, y / 32]));
  const placements = [
    ["pilot-r004-rear-partition-23", -2.625],
    ["pilot-r004-rear-partition-24", 1],
  ] as const;
  for (const [id, x] of placements) {
    const p = candidate.placements.find((p) => p.sourcePlacedId === id);
    const visual = candidate.document.layout.assembly?.parts.find(
      (p) => p.id === id,
    );
    requireProof(p && visual, "missing exact source partition " + id);
    requireProof(
      p.visual?.sha256 === proof.sha256 && p.assetId === proof.assetId,
      "native revision mismatch",
    );
    requireProof(
      visual.assetId === proof.assetId &&
        JSON.stringify(visual.position) ===
          JSON.stringify([x, 8.625, 0.1875]) &&
        visual.rotation === 0 &&
        !visual.flipped &&
        visual.removedCells.length === 0,
      "placement/damage requires requalification",
    );
    const footprint = proof.footprintM.map(([a, b]): Point => [
      x + a,
      8.625 + b,
    ]);
    const total = Math.abs(area2(footprint)) / 2;
    const covered = floors.reduce(
      (sum, floor) => sum + Math.abs(area2(intersection(footprint, floor))) / 2,
      0,
    );
    requireProof(
      Math.abs(total - covered) < 1e-8,
      "partition cover lacks complete nominal floor support",
    );
    // Fan triangulation retains the exact 20-vertex native convex cover while
    // obeying the existing <=16-vertex per obstacle and <=32-obstacle limits.
    const obstacles = footprint
      .slice(1, -1)
      .map((p, i) => ({ vertices: [footprint[0], p, footprint[i + 2]] }));
    bindings.push({
      sourceObjectId: id,
      definitionId: "wayfarer-native-rear-partition-r004-cover-1",
      deckIds: [PIN.deckId],
      obstacles,
    });
    support.push({
      placedId: id,
      coveredAreaM2: covered,
      footprintAreaM2: total,
      walkingDatumM: 0.1875,
    });
  }
  return {
    bindings,
    support,
    proofSha256: proof.sha256,
    remainingObjectBindings: candidate.document.layout
      .assembly!.parts.filter(
        (p) => !bindings.some((b) => b.sourceObjectId === p.id),
      )
      .map((p) => p.id),
    pressureQualified: false as const,
    loadRatingQualified: false as const,
    fullSpawnReady: false as const,
  };
}
