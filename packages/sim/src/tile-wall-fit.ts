import type { Point } from "@sidereal/content/ship-layout";
import { cross, area2, positiveOverlap } from "./layout-geometry";
import type { TileWallReservation } from "./tile-wall-reservation";

export interface InteriorBodyReservation {
  /** Convex footprint in metres after the asset's permitted mirror/yaw/translation. */
  footprint: Point[];
  bottom: number;
  top: number;
}
/** Positive-volume intrusion, not a centre-point or snap-grid test. Exact face
 * contact is legal. Native proxies and operational sweeps must be supplied by a
 * separately qualified adapter; a visual bound never becomes authority here. */
export function bodyIntrudesIntoTileWall(
  wall: TileWallReservation,
  body: InteriorBodyReservation,
): boolean {
  const p = body.footprint;
  if (
    !Array.isArray(p) ||
    p.length < 3 ||
    p.length > 16 ||
    !p.every(
      (v) =>
        Array.isArray(v) &&
        v.length === 2 &&
        v.every((n) => Number.isFinite(n) && Math.abs(n) <= 256),
    ) ||
    !Number.isFinite(body.bottom) ||
    !Number.isFinite(body.top) ||
    Math.abs(body.bottom) > 256 ||
    Math.abs(body.top) > 256 ||
    body.top <= body.bottom
  )
    throw Error("Invalid bounded interior body reservation");
  const sign = Math.sign(area2(p));
  if (
    !sign ||
    !p.every((a, i) =>
      p.every(
        (v, j) =>
          j === i ||
          j === (i + 1) % p.length ||
          sign * cross(a, p[(i + 1) % p.length], v) > 0,
      ),
    )
  )
    throw Error(
      "Interior body reservation must be a nondegenerate convex footprint",
    );
  if (Math.max(wall.bottom, body.bottom) >= Math.min(wall.top, body.top))
    return false;
  return positiveOverlap(
    wall.corners.map((p) => [p[0], p[1]]),
    p,
  );
}
