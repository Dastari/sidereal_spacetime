import type { FurnishingOverride } from "@sidereal/content/wayfarer-furnishings";
import type { WayfarerGameplayObject } from "@sidereal/content/wayfarer-authored-gameplay";
import {
  furnishingWallSurfaces,
  wallFurnishingPlacement,
} from "@sidereal/sim/furnishing-wall-placement";
import type { ShipPrefabDocumentV1 } from "@sidereal/content/ship-prefab";
import { footprintFloorCoverage } from "@sidereal/sim/ship-furnishings";
import type { DeckCollisionFrame } from "@sidereal/sim/construction-collision";
import { effectiveWayfarerObjects } from "@sidereal/content/wayfarer-furnishings";
import { positiveOverlap } from "@sidereal/sim/layout-geometry";
export interface FurnishingRay {
  origin: [number, number, number];
  direction: [number, number, number];
}
export function furnishingPlanePoint(
  ray: FurnishingRay | undefined,
  height: number,
): [number, number] | undefined {
  if (!ray || Math.abs(ray.direction[2]) < 1e-8) return;
  const t = (height - ray.origin[2]) / ray.direction[2];
  if (t < 0 || !Number.isFinite(t)) return;
  return [
    ray.origin[0] + ray.direction[0] * t,
    ray.origin[1] + ray.direction[1] * t,
  ];
}
export function wallDragPose(
  doc: ShipPrefabDocumentV1,
  id: string,
  ray: FurnishingRay | undefined,
  snap: boolean,
) {
  if (!ray) return;
  let best: { t: number; pose: FurnishingOverride } | undefined;
  for (const wall of furnishingWallSurfaces(doc)) {
    const d =
      ray.direction[0] * wall.normal[0] + ray.direction[1] * wall.normal[1];
    // Only the face towards the camera. Orbit exposes the opposite face.
    if (d >= -1e-8) continue;
    const t =
      ((wall.a[0] - ray.origin[0]) * wall.normal[0] +
        (wall.a[1] - ray.origin[1]) * wall.normal[1]) /
      d;
    if (t < 0 || (best && t >= best.t)) continue;
    const x = ray.origin[0] + t * ray.direction[0],
      y = ray.origin[1] + t * ray.direction[1],
      z = ray.origin[2] + t * ray.direction[2];
    const dx = wall.b[0] - wall.a[0],
      dy = wall.b[1] - wall.a[1];
    const along =
      ((x - wall.a[0]) * dx + (y - wall.a[1]) * dy) / (dx * dx + dy * dy);
    if (along < 0 || along > 1 || z < wall.minZ || z > wall.maxZ) continue;
    const pose = wallFurnishingPlacement(doc, id, [x, y], snap, 0.75);
    if (pose) best = { t, pose };
  }
  return best?.pose;
}
/** Lightweight visual qualification; crew/access/revision checks remain server authority. */
export function floorPreviewIssue(
  source: WayfarerGameplayObject,
  pose: FurnishingOverride,
  frame: DeckCollisionFrame,
) {
  const moved = effectiveWayfarerObjects({ [source.object]: pose }).find(
    (o) => o.object === source.object,
  )!;
  const polygon = moved.footprint.map(([x, y]) => [-y, x] as [number, number]);
  const coverage = footprintFloorCoverage(polygon, frame.floors);
  if (coverage.area - coverage.supported > 1e-9)
    return "Keep the whole object on the deck.";
  for (const obstacle of frame.obstacles) {
    if (obstacle.id === `prefab-socket:${source.object}`) continue;
    if (positiveOverlap(polygon, obstacle.vertices))
      return "This position overlaps another object.";
  }
  for (const segment of frame.segments) {
    if (segment.id.includes(`prefab-socket:${source.object}`)) continue;
    const dx = segment.b[0] - segment.a[0],
      dy = segment.b[1] - segment.a[1],
      length = Math.hypot(dx, dy);
    if (!length) continue;
    const width = Math.max(segment.halfWidthM, 1e-7),
      nx = (-dy / length) * width,
      ny = (dx / length) * width;
    if (
      positiveOverlap(polygon, [
        [segment.a[0] + nx, segment.a[1] + ny],
        [segment.a[0] - nx, segment.a[1] - ny],
        [segment.b[0] - nx, segment.b[1] - ny],
        [segment.b[0] + nx, segment.b[1] + ny],
      ])
    )
      return "Keep the object clear of walls and doorways.";
  }
}
