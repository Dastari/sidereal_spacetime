import type { LayoutWall } from "@sidereal/sim/layout-compiler";
import { onSegment, samePoint } from "@sidereal/sim/layout-geometry";
import type { Point } from "@sidereal/content/ship-layout";
import type { LayoutDoorwayPlan } from "./layout-doorway-plan";

/** Presentation-only subtraction of the full native jamb/leaf reservation.
 * Retains authored openings/collision untouched; wall end caps remain on their
 * own side of the shared contact plane and never overlap the doorway frame. */
export function doorwayWallSpans(
  walls: readonly LayoutWall[],
  plan: LayoutDoorwayPlan,
): LayoutWall[] {
  return walls.flatMap((wall) => {
    const excluded = plan.wallExclusions.filter(
      (span) =>
        span.deckId === wall.deckId &&
        span.partitionId === wall.anchorId &&
        wall.source === "partition",
    );
    if (!excluded.length) return [wall];
    const dx = wall.b[0] - wall.a[0],
      dy = wall.b[1] - wall.a[1];
    const distance = (p: Point) =>
      (p[0] - wall.a[0]) * dx + (p[1] - wall.a[1]) * dy;
    const points = [
      wall.a,
      wall.b,
      ...excluded
        .flatMap((span) => [span.a, span.b])
        .filter((point) => onSegment(point, wall.a, wall.b)),
    ].sort((a, b) => distance(a) - distance(b));
    const spans: LayoutWall[] = [];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i];
      if (samePoint(a, b)) continue;
      const middle: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (excluded.some((span) => onSegment(middle, span.a, span.b))) continue;
      spans.push({
        ...wall,
        a,
        b,
        key: `${wall.key}:doorframe:${a.join(",")}:${b.join(",")}`,
      });
    }
    return spans;
  });
}
