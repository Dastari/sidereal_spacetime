import type { ZoneAnchor, ZoneVector } from "@sidereal/content/zones";
import { compileZonePath, PATH_LIMITS } from "@sidereal/sim/zone-path";
export function penAnchor(
  start: ZoneVector,
  end: ZoneVector,
  curved: boolean,
): ZoneAnchor {
  const out = { x: end.x - start.x, y: end.y - start.y };
  return curved
    ? { ...start, out, in: { x: -out.x, y: -out.y }, mode: "mirrored" }
    : { ...start };
}
export function appendAnchor(
  points: ZoneAnchor[],
  point: ZoneAnchor,
  tolerance: number,
): ZoneAnchor[] {
  if (points.some((p) => Math.hypot(p.x - point.x, p.y - point.y) <= tolerance))
    return points;
  if (points.length >= PATH_LIMITS.anchors)
    throw Error(
      "A boundary supports at most 64 points. Close it or edit an existing point.",
    );
  return [...points, point];
}
export function drawnBoundary(points: ZoneAnchor[]) {
  // Compilation checks budgets/coordinates; full map validation checks intersections.
  compileZonePath(points);
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  const x = (Math.min(...xs) + Math.max(...xs)) / 2,
    y = (Math.min(...ys) + Math.max(...ys)) / 2;
  return {
    x,
    y,
    width: Math.max(1, Math.max(...xs) - Math.min(...xs)),
    length: Math.max(1, Math.max(...ys) - Math.min(...ys)),
    vertices: points.map((p) => ({ ...p, x: p.x - x, y: p.y - y })),
  };
}
export function drawingPath(
  points: ZoneAnchor[],
  project: (p: ZoneVector) => ZoneVector,
  close = false,
) {
  if (!points.length) return "";
  const first = project(points[0]);
  let result = `M ${first.x} ${first.y}`;
  for (let i = 1; i < points.length + (close ? 1 : 0); i++) {
    const a = points[i - 1],
      b = points[i % points.length],
      p = project(b);
    if (a.out || b.in) {
      const c = project({ x: a.x + (a.out?.x ?? 0), y: a.y + (a.out?.y ?? 0) }),
        d = project({ x: b.x + (b.in?.x ?? 0), y: b.y + (b.in?.y ?? 0) });
      result += ` C ${c.x} ${c.y} ${d.x} ${d.y} ${p.x} ${p.y}`;
    } else result += ` L ${p.x} ${p.y}`;
  }
  return result + (close ? " Z" : "");
}
