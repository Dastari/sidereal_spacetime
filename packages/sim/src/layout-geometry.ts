import type { FloorTile, Point } from "@sidereal/content/ship-layout";
export const compareText = (a: string, b: string) =>
  a < b ? -1 : a > b ? 1 : 0;
export const comparePoint = (a: Point, b: Point) => a[0] - b[0] || a[1] - b[1];
export const pointKey = (p: Point) => `${p[0]},${p[1]}`;
export const samePoint = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];
/** Coordinates bounded to ±8192: all products and sums stay exactly below 2^53. */
export const cross = (a: Point, b: Point, c: Point) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
export const onSegment = (p: Point, a: Point, b: Point) =>
  cross(a, b, p) === 0 &&
  p[0] >= Math.min(a[0], b[0]) &&
  p[0] <= Math.max(a[0], b[0]) &&
  p[1] >= Math.min(a[1], b[1]) &&
  p[1] <= Math.max(a[1], b[1]);
export const area2 = (p: Point[]) =>
  p.reduce((s, a, i) => {
    const b = p[(i + 1) % p.length];
    return s + a[0] * b[1] - b[0] * a[1];
  }, 0);
export function canonicalPolygon(points: Point[]): Point[] {
  const p = points.map((p) => [p[0] || 0, p[1] || 0] as Point);
  if (area2(p) < 0) p.reverse();
  let start = 0;
  for (let i = 1; i < p.length; i++)
    if (comparePoint(p[i], p[start]) < 0) start = i;
  return [...p.slice(start), ...p.slice(0, start)];
}
export function inside(p: Point, poly: Point[], boundary = true): boolean {
  let result = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j],
      b = poly[i];
    if (onSegment(p, a, b)) return boundary;
    if (a[1] > p[1] !== b[1] > p[1]) {
      // Cross multiplication avoids fractional intersection coordinates.
      const c = cross(a, b, p);
      if ((b[1] > a[1] && c > 0) || (b[1] < a[1] && c < 0)) result = !result;
    }
  }
  return result;
}
export function positiveOverlap(a: Point[], b: Point[]): boolean {
  // Exact separating-axis test for admitted convex polygons; face contact is legal.
  for (const poly of [a, b])
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i],
        q = poly[(i + 1) % poly.length],
        nx = p[1] - q[1],
        ny = q[0] - p[0];
      const ap = a.map((p) => p[0] * nx + p[1] * ny),
        bp = b.map((p) => p[0] * nx + p[1] * ny);
      if (
        Math.max(...ap) <= Math.min(...bp) ||
        Math.max(...bp) <= Math.min(...ap)
      )
        return false;
    }
  return true;
}
export function segmentKey(a: Point, b: Point) {
  return comparePoint(a, b) < 0
    ? `${pointKey(a)}:${pointKey(b)}`
    : `${pointKey(b)}:${pointKey(a)}`;
}
function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}
export function lineKey(a: Point, b: Point): string {
  let dx = b[0] - a[0],
    dy = b[1] - a[1];
  const g = gcd(Math.abs(dx), Math.abs(dy));
  dx /= g;
  dy /= g;
  if (dx < 0 || (dx === 0 && dy < 0)) {
    dx = -dx;
    dy = -dy;
  }
  return `${dx},${dy},${dx * a[1] - dy * a[0]}`;
}
export function properCross(a: Point, b: Point, c: Point, d: Point) {
  return (
    cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0
  );
}
/** Sorted canonical JSON, not an authentication fingerprint. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value))
    return "[" + value.map(stableStringify).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => compareText(a, b))
        .map(([k, v]) => JSON.stringify(k) + ":" + stableStringify(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export function cacheFingerprint(value: unknown): string {
  let h = 2166136261;
  for (const c of stableStringify(value))
    h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Exact segment support: convex clipping intervals represented as rational pairs. */
export function segmentSupported(
  a: Point,
  b: Point,
  tiles: FloorTile[],
): boolean {
  type Ratio = [number, number];
  const cmp = (a: Ratio, b: Ratio) =>
    BigInt(a[0]) * BigInt(b[1]) - BigInt(b[0]) * BigInt(a[1]);
  const intervals: { lo: Ratio; hi: Ratio }[] = [];
  for (const t of tiles) {
    let lo: Ratio = [0, 1],
      hi: Ratio = [1, 1],
      valid = true;
    for (let i = 0; i < t.vertices.length; i++) {
      const p = t.vertices[i],
        q = t.vertices[(i + 1) % t.vertices.length],
        ca = cross(p, q, a),
        cb = cross(p, q, b),
        delta = cb - ca;
      if (delta === 0) {
        if (ca < 0) {
          valid = false;
          break;
        }
        continue;
      }
      const r: Ratio = delta > 0 ? [-ca, delta] : [ca, -delta];
      if (delta > 0 && cmp(r, lo) > 0) lo = r;
      if (delta < 0 && cmp(r, hi) < 0) hi = r;
      if (cmp(lo, hi) > 0) {
        valid = false;
        break;
      }
    }
    if (valid) intervals.push({ lo, hi });
  }
  intervals.sort((a, b) => Number(cmp(a.lo, b.lo)));
  let end: Ratio = [0, 1];
  for (const i of intervals) {
    if (cmp(i.lo, end) > 0) return false;
    if (cmp(i.hi, end) > 0) end = i.hi;
    if (cmp(end, [1, 1]) >= 0) return true;
  }
  return false;
}
