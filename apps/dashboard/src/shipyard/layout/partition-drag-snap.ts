import type { Partition, Point } from "@sidereal/content/ship-layout";

/** Snap the wall's destination, retaining where it was grabbed. Snapping a
 * pointer delta alone leaves half-grid walls permanently between grid lines. */
export function partitionDragDelta(
  wall: Pick<Partition, "a">,
  start: Point,
  end: Point,
  selectedGrid: number,
  structuralGrid = 1,
): Point {
  const grid = Math.max(selectedGrid, structuralGrid);
  if (!Number.isFinite(grid) || grid < 1)
    throw Error("Choose a valid wall snap grid.");
  if (start.every((value, i) => value === end[i])) return [0, 0];
  return wall.a.map(
    (value, i) => Math.round((value + end[i] - start[i]) / grid) * grid - value,
  ) as Point;
}
