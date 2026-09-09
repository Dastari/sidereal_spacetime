import walking from "../../content/src/wayfarer-walking-proof.json";
import type { ConstructionSnapshot } from "../../content/src/construction";
import { constructionHash } from "./construction-transactions";
import threshold from "../../content/src/wayfarer-threshold-proof.json";
import type { Point } from "../../content/src/ship-layout";
import type { SpawnObjectCollisionBinding } from "./construction-instance";
const FLOOR = threshold.floorElevationM;
/** Native top-triangle support at accepted actor XY. Called only for this exact
 * immutable qualified instance, never a general mesh-height or client position API. */
export function wayfarerThresholdElevation(
  x: number,
  y: number,
  bodyHeightM = 1.8,
) {
  if (
    ![x, y, bodyHeightM].every(Number.isFinite) ||
    bodyHeightM <= 0 ||
    bodyHeightM > threshold.maximumBodyHeightM
  )
    throw Error("Threshold: unsupported actor envelope");
  if (x < -0.625 || x > 0.625 || y < 8.62 || y > 9.01) return FLOOR;
  let height = FLOOR;
  for (const surface of threshold.supportSurfaces)
    for (const [a, b, c] of surface.topTrianglesM) {
      const det = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (det <= 1e-12) continue;
      const u = ((x - a[0]) * (c[1] - a[1]) - (y - a[1]) * (c[0] - a[0])) / det;
      const v = ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])) / det;
      if (u >= -1e-8 && v >= -1e-8 && u + v <= 1 + 1e-8)
        height = Math.max(height, a[2] + u * (b[2] - a[2]) + v * (c[2] - a[2]));
    }
  if (
    height - FLOOR > threshold.maximumStepM + 1e-8 ||
    height + bodyHeightM > threshold.minimumHeaderElevationM - 1e-5
  )
    throw Error("Threshold: unsupported rise or headroom");
  return height;
}
/** Validate intermediate supports too: a sprint-sized command must not skip a
 * small raised surface simply because both endpoint elevations are the floor. */
export function qualifyWayfarerThresholdMotion(
  from: Point,
  to: Point,
  bodyHeightM = 1.8,
) {
  if ([...from, ...to].some((v) => !Number.isFinite(v)))
    throw Error("Threshold: finite accepted positions required");
  const distance = Math.hypot(to[0] - from[0], to[1] - from[1]);
  if (distance > 1)
    throw Error("Threshold: bounded ordinary movement required");
  const steps = Math.max(1, Math.ceil(distance / 0.005));
  let previous = wayfarerThresholdElevation(...from, bodyHeightM),
    maximum = previous;
  for (let i = 1; i <= steps; i++) {
    const current = wayfarerThresholdElevation(
      from[0] + ((to[0] - from[0]) * i) / steps,
      from[1] + ((to[1] - from[1]) * i) / steps,
      bodyHeightM,
    );
    if (Math.abs(current - previous) > threshold.maximumStepM + 1e-8)
      throw Error("Threshold: rise/drop exceeds supported low step");
    previous = current;
    maximum = Math.max(maximum, current);
  }
  return {
    elevationM: previous,
    maximumTraversedElevationM: maximum,
    contactKind: previous > FLOOR + 1e-6 ? "native-low-step" : "native-floor",
  } as const;
}
/** Explicit replacement for one proven frame, retaining both full-height jamb
 * covers. Higher actors keep the previous conservative whole-frame collider. */
export function qualifiedWayfarerThresholdBinding(
  bodyHeightM: number,
  snapshot: ConstructionSnapshot,
): SpawnObjectCollisionBinding {
  if (
    !snapshot ||
    snapshot.sha256 !== walking.documentSha256 ||
    constructionHash(snapshot.canonical) !== walking.documentSha256
  )
    throw Error("Threshold: exact source proof required");
  if (
    !Number.isFinite(bodyHeightM) ||
    bodyHeightM <= 0 ||
    bodyHeightM > threshold.maximumBodyHeightM
  )
    throw Error("Threshold: unsupported actor envelope");
  return {
    sourceObjectId: threshold.sourcePlacedId,
    definitionId: "wayfarer-native-frame-lowstep-r001",
    deckIds: [threshold.deckId],
    obstacles: threshold.sideObstacles.map((o) => ({
      vertices: o.vertices.map(([x, y]): Point => [x, y]),
    })),
  };
}
