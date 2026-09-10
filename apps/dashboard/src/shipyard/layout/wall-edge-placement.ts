import type { Point } from "@sidereal/content/ship-layout";
interface Edge {
  deckId: string;
  a: Point;
  b: Point;
  tileIds: string[];
}
const on = (p: Point, a: Point, b: Point) =>
  (p[0] - a[0]) * (b[1] - a[1]) === (p[1] - a[1]) * (b[0] - a[0]) &&
  p.every((v, i) => v >= Math.min(a[i], b[i]) && v <= Math.max(a[i], b[i]));
/** Partitions reserve existing shared structural edges, never tile centres. */
export function wallEdgeSpan(
  edges: readonly Edge[],
  deckId: string,
  a: Point,
  b: Point,
): boolean {
  if (a[0] === b[0] && a[1] === b[1]) return false;
  const length = (p: Point, q: Point) =>
    Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]);
  const matches = edges.filter(
    (e) =>
      e.deckId === deckId &&
      e.tileIds.length === 2 &&
      on(e.a, a, b) &&
      on(e.b, a, b),
  );
  return matches.reduce((sum, e) => sum + length(e.a, e.b), 0) === length(a, b);
}
