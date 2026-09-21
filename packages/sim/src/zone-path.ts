import type { ZoneAnchor, ZoneVector } from "@sidereal/content/zones";
export const PATH_LIMITS = { anchors: 64, edges: 512, depth: 16 };
const add = (a: ZoneVector, b?: ZoneVector): ZoneVector => ({
  x: a.x + (b?.x ?? 0),
  y: a.y + (b?.y ?? 0),
});
const sub = (a: ZoneVector, b: ZoneVector): ZoneVector => ({
  x: a.x - b.x,
  y: a.y - b.y,
});
const mix = (a: ZoneVector, b: ZoneVector, t: number): ZoneVector => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
export function cubicAt(a: ZoneAnchor, b: ZoneAnchor, t: number) {
  const p = mix(a, add(a, a.out), t),
    q = mix(add(a, a.out), add(b, b.in), t),
    r = mix(add(b, b.in), b, t);
  return mix(mix(p, q, t), mix(q, r, t), t);
}
/** Exact shape-preserving split, including the closing segment. Mutates only the draft. */
export function splitZoneEdge(points: ZoneAnchor[], index: number, t = 0.5) {
  if (points.length >= PATH_LIMITS.anchors)
    throw Error("Path anchor budget exceeded");
  if (!(t > 0 && t < 1) || index < 0 || index >= points.length)
    throw Error("Invalid path split");
  const a = points[index],
    b = points[(index + 1) % points.length];
  if (!a.out && !b.in) {
    points.splice(index + 1, 0, mix(a, b, t));
    return;
  }
  const p = mix(a, add(a, a.out), t),
    q = mix(add(a, a.out), add(b, b.in), t),
    r = mix(add(b, b.in), b, t);
  const s = mix(p, q, t),
    u = mix(q, r, t),
    v = mix(s, u, t);
  a.out = sub(p, a);
  b.in = sub(r, b);
  points.splice(index + 1, 0, {
    ...v,
    in: sub(s, v),
    out: sub(u, v),
    mode: "aligned",
  });
}
export function curveZoneEdge(points: ZoneAnchor[], index: number) {
  const a = points[index],
    b = points[(index + 1) % points.length];
  if (!a.out && !b.in) {
    a.out = sub(mix(a, b, 1 / 3), a);
    b.in = sub(mix(a, b, 2 / 3), b);
  }
}
export function setZoneHandle(
  a: ZoneAnchor,
  side: "in" | "out",
  value: ZoneVector,
  independent = false,
) {
  a[side] = value;
  if (independent) a.mode = "corner";
  const other = side === "in" ? "out" : "in",
    length = Math.hypot(value.x, value.y);
  if (a.mode === "mirrored") a[other] = { x: -value.x, y: -value.y };
  else if (a.mode === "aligned" && length > 0) {
    const ratio =
      Math.hypot(a[other]?.x ?? value.x, a[other]?.y ?? value.y) / length;
    a[other] = { x: -value.x * ratio, y: -value.y * ratio };
  }
}
function distance(p: ZoneVector, a: ZoneVector, b: ZoneVector) {
  const d = sub(b, a),
    l = d.x * d.x + d.y * d.y;
  const t = l
    ? Math.max(0, Math.min(1, ((p.x - a.x) * d.x + (p.y - a.y) * d.y) / l))
    : 0;
  return Math.hypot(p.x - a.x - d.x * t, p.y - a.y - d.y * t);
}
/** Version 1 compiler. Absolute error <= max(1 cm, control extent / 16384). */
export function compileZonePath(points: readonly ZoneAnchor[]): ZoneVector[] {
  if (
    !Array.isArray(points) ||
    points.length < 3 ||
    points.length > PATH_LIMITS.anchors
  )
    throw Error("Path needs 3–64 anchors");
  let extent = 1;
  for (const p of points) {
    if (
      !p ||
      !Number.isFinite(p.x) ||
      !Number.isFinite(p.y) ||
      Math.abs(p.x) > 1e9 ||
      Math.abs(p.y) > 1e9
    )
      throw Error("Invalid path anchor");
    if (
      p.mode !== undefined &&
      !["corner", "aligned", "mirrored"].includes(p.mode)
    )
      throw Error("Invalid handle mode");
    for (const h of [p.in, p.out])
      if (
        h &&
        (!Number.isFinite(h.x) ||
          !Number.isFinite(h.y) ||
          Math.abs(h.x) > 1e9 ||
          Math.abs(h.y) > 1e9)
      )
        throw Error("Invalid curve handle");
    extent = Math.max(
      extent,
      Math.abs(p.x),
      Math.abs(p.y),
      Math.abs(add(p, p.in).x),
      Math.abs(add(p, p.in).y),
      Math.abs(add(p, p.out).x),
      Math.abs(add(p, p.out).y),
    );
  }
  const tolerance = Math.max(0.01, extent / 16384),
    result: ZoneVector[] = [{ x: points[0].x, y: points[0].y }];
  const emit = (p: ZoneVector) => {
    if (result.length > PATH_LIMITS.edges)
      throw Error("Curve exceeds 512 compiled edges; simplify the path");
    result.push({ x: p.x, y: p.y });
  };
  const flatten = (
    a: ZoneVector,
    b: ZoneVector,
    c: ZoneVector,
    d: ZoneVector,
    depth: number,
  ) => {
    if (Math.max(distance(b, a, d), distance(c, a, d)) <= tolerance) {
      emit(d);
      return;
    }
    if (depth >= PATH_LIMITS.depth)
      throw Error("Curve precision budget exceeded");
    const ab = mix(a, b, 0.5),
      bc = mix(b, c, 0.5),
      cd = mix(c, d, 0.5),
      abc = mix(ab, bc, 0.5),
      bcd = mix(bc, cd, 0.5),
      mid = mix(abc, bcd, 0.5);
    flatten(a, ab, abc, mid, depth + 1);
    flatten(mid, bcd, cd, d, depth + 1);
  };
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length];
    if (a.out || b.in) flatten(a, add(a, a.out), add(b, b.in), b, 0);
    else emit({ x: b.x, y: b.y });
  });
  result.pop();
  return result;
}
