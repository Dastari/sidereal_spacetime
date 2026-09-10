/** Snap horizontal source metres only. Height is an independently selected datum. */
export function snapLayoutPoint(
  point: readonly [number, number, number],
  spacing: number,
): [number, number, number] {
  if (
    !Number.isFinite(spacing) ||
    spacing < 1 / 32 ||
    !point.every(Number.isFinite)
  )
    throw Error("Invalid layout grid point");
  return [
    Math.round(point[0] / spacing) * spacing,
    Math.round(point[1] / spacing) * spacing,
    point[2],
  ];
}
