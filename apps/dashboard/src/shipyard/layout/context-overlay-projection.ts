import type { Point } from "@sidereal/content/ship-layout";

type Homogeneous = [number, number, number];
const NEAR = 0.00001;
function homogeneous(
  matrix: readonly number[],
  [x, north]: Point,
): Homogeneous {
  const y = -north;
  return [
    matrix[0] * x + matrix[4] * y + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[13],
    matrix[3] * x + matrix[7] * y + matrix[15],
  ];
}
function valid(matrix: readonly number[], width: number, height: number) {
  return (
    matrix.length === 16 &&
    [...matrix, width, height].every(Number.isFinite) &&
    width > 0 &&
    height > 0
  );
}
function interpolate(a: readonly number[], b: readonly number[], t: number) {
  return a.map((n, axis) => n + (b[axis] - n) * t);
}
function clipPolygon<T extends number[]>(
  points: T[],
  distance: (point: T) => number,
): T[] {
  return points.flatMap((a, index) => {
    const b = points[(index + 1) % points.length],
      da = distance(a),
      db = distance(b);
    const out: T[] = da >= 0 ? [a] : [];
    if (da >= 0 !== db >= 0) out.push(interpolate(a, b, da / (da - db)) as T);
    return out;
  });
}

/** Screen-sized geometry only: no perspective CSS transform or oversized raster layer. */
export function projectContextPolygon(
  matrix: readonly number[],
  polygon: readonly Point[],
  width: number,
  height: number,
): Point[] {
  if (!valid(matrix, width, height)) return [];
  let points = clipPolygon(
    polygon.map((point) => homogeneous(matrix, point)),
    (point) => point[2] - NEAR,
  ).map(([x, y, w]) => [x / w, y / w] as Point);
  for (const distance of [
    (p: Point) => p[0],
    (p: Point) => width - p[0],
    (p: Point) => p[1],
    (p: Point) => height - p[1],
  ])
    points = clipPolygon(points, distance);
  return points.length >= 3 && points.every((p) => p.every(Number.isFinite))
    ? points
    : [];
}

export function projectContextPoint(
  matrix: readonly number[],
  point: Point,
  width: number,
  height: number,
): Point | null {
  if (!valid(matrix, width, height)) return null;
  const [x, y, w] = homogeneous(matrix, point);
  if (w < NEAR) return null;
  const result: Point = [x / w, y / w];
  return result.every(Number.isFinite) &&
    result[0] >= 0 &&
    result[0] <= width &&
    result[1] >= 0 &&
    result[1] <= height
    ? result
    : null;
}

export function projectContextSegment(
  matrix: readonly number[],
  a: Point,
  b: Point,
  width: number,
  height: number,
): Point[] {
  if (!valid(matrix, width, height)) return [];
  let start = homogeneous(matrix, a),
    end = homogeneous(matrix, b);
  if (start[2] < NEAR && end[2] < NEAR) return [];
  if (start[2] < NEAR)
    start = interpolate(
      start,
      end,
      (NEAR - start[2]) / (end[2] - start[2]),
    ) as Homogeneous;
  if (end[2] < NEAR)
    end = interpolate(
      end,
      start,
      (NEAR - end[2]) / (start[2] - end[2]),
    ) as Homogeneous;
  let p: Point = [start[0] / start[2], start[1] / start[2]],
    q: Point = [end[0] / end[2], end[1] / end[2]];
  for (const distance of [
    (point: Point) => point[0],
    (point: Point) => width - point[0],
    (point: Point) => point[1],
    (point: Point) => height - point[1],
  ]) {
    const dp = distance(p),
      dq = distance(q);
    if (dp < 0 && dq < 0) return [];
    if (dp < 0) p = interpolate(p, q, dp / (dp - dq)) as Point;
    else if (dq < 0) q = interpolate(q, p, dq / (dq - dp)) as Point;
  }
  return [...p, ...q].every(Number.isFinite) ? [p, q] : [];
}
