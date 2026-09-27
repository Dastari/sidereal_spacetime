import data from "@sidereal/content/ship-tileset-complex-perimeter-spec.v1.json";
import type { Point } from "@sidereal/content/ship-layout";
import { area2, cross, properCross } from "./layout-geometry";

interface Profile {
  id: string;
  kind: string;
  reservationPolygonM: Point[];
  incoming?: Point;
  outgoing?: Point;
  incomingCutUnits?: number;
  outgoingCutUnits?: number;
  direction?: Point;
  stepCount?: number;
}
export interface ComplexPerimeterPlacement {
  profileId: string;
  originUnits: Point;
  quarterTurns: number;
  yawRadians?: number;
}
const profiles: Profile[] = data.profiles.map((p) => ({
  ...p,
  reservationPolygonM: p.reservationPolygonM.map(([x, y]): Point => [x, y]),
  incoming: p.incoming ? [p.incoming[0], p.incoming[1]] : undefined,
  outgoing: p.outgoing ? [p.outgoing[0], p.outgoing[1]] : undefined,
  direction: p.direction ? [p.direction[0], p.direction[1]] : undefined,
}));
const rotate = ([x, y]: Point, q: number): Point =>
  [
    [x, y],
    [-y, x],
    [-x, -y],
    [y, -x],
  ][q] as Point;
const same = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));
const direction = (a: Point, b: Point): Point => {
  const x = b[0] - a[0],
    y = b[1] - a[1],
    g = gcd(Math.abs(x), Math.abs(y));
  return [x / g, y / g];
};
const between = (p: Point, a: Point, b: Point) =>
  Math.abs(cross(a, b, p)) < 1e-7 &&
  p.every(
    (v, i) =>
      v >= Math.min(a[i], b[i]) - 1e-7 && v <= Math.max(a[i], b[i]) + 1e-7,
  );
function triangles(polygon: Point[]): Point[][] {
  const p = [...polygon],
    out: Point[][] = [];
  while (p.length > 3) {
    let found = false;
    for (let i = 0; i < p.length; i++) {
      const a = p[(i + p.length - 1) % p.length],
        b = p[i],
        c = p[(i + 1) % p.length];
      if (cross(a, b, c) <= 1e-9) continue;
      if (
        p.some(
          (v) =>
            v !== a &&
            v !== b &&
            v !== c &&
            cross(a, b, v) >= -1e-9 &&
            cross(b, c, v) >= -1e-9 &&
            cross(c, a, v) >= -1e-9,
        )
      )
        continue;
      out.push([a, b, c]);
      p.splice(i, 1);
      found = true;
      break;
    }
    if (!found)
      throw new Error("Cannot triangulate complex perimeter reservation");
  }
  out.push(p);
  return out;
}
function overlap(a: Point[], b: Point[]): number {
  let out = a;
  for (let i = 0; i < b.length; i++) {
    const u = b[i],
      v = b[(i + 1) % b.length],
      old = out;
    out = [];
    for (let j = 0; j < old.length; j++) {
      const p = old[j],
        q = old[(j + 1) % old.length],
        dp = cross(u, v, p),
        dq = cross(u, v, q);
      if (dp >= 0) out.push(p);
      if (dp < 0 !== dq < 0) {
        const t = dp / (dp - dq);
        out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
    }
  }
  return out.length > 2 ? Math.abs(area2(out)) / 2 : 0;
}
/** Exact native visual assembly only. It creates no collision, pressure or authority grant. */
export function planComplexPerimeter(
  points: Point[],
  quarterHeight: 1 | 2 | 3 | 4,
) {
  const placements: ComplexPerimeterPlacement[] = [],
    polygons: Point[][] = [],
    issues: string[] = [];
  const fail = (message: string) => ({
    ok: false as const,
    placements: [],
    polygons: [],
    issues: [message],
  });
  if (
    ![1, 2, 3, 4].includes(quarterHeight) ||
    points.length < 3 ||
    points.length > 512 ||
    points.some(
      (p) =>
        p.length !== 2 ||
        p.some((v) => !Number.isInteger(v) || Math.abs(v) > 8192),
    )
  )
    return fail("Invalid complex perimeter coordinates or height");
  let p = points.map((v) => [...v] as Point);
  if (p.some((v, i) => same(v, p[(i + 1) % p.length])))
    return fail("Complex perimeter has a zero-length edge");
  // Merging compiler provenance splits does not alter the structural footprint.
  let changed = true;
  while (changed && p.length > 3) {
    changed = false;
    for (let i = 0; i < p.length; i++) {
      const a = p[(i + p.length - 1) % p.length],
        b = p[i],
        c = p[(i + 1) % p.length];
      if (cross(a, b, c) === 0 && between(b, a, c)) {
        p.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  if (area2(p) <= 0)
    return fail("Complex perimeter requires a counterclockwise exterior loop");
  for (let i = 0; i < p.length; i++)
    for (let j = i + 1; j < p.length; j++) {
      if (j === i + 1 || (i === 0 && j === p.length - 1)) continue;
      const a = p[i],
        b = p[(i + 1) % p.length],
        c = p[j],
        d = p[(j + 1) % p.length];
      if (
        properCross(a, b, c, d) ||
        between(a, c, d) ||
        between(b, c, d) ||
        between(c, a, b) ||
        between(d, a, b)
      )
        return fail("Complex perimeter self-intersects or touches itself");
    }
  const cuts: { incoming: number; outgoing: number }[] = [];
  const add = (
    profile: Profile,
    originUnits: Point,
    quarterTurns: number,
    yawRadians?: number,
  ) => {
    placements.push({
      profileId: profile.id,
      originUnits,
      quarterTurns,
      ...(yawRadians === undefined ? {} : { yawRadians }),
    });
    const a = yawRadians ?? (quarterTurns * Math.PI) / 2,
      c = Math.cos(a),
      s = Math.sin(a);
    polygons.push(
      profile.reservationPolygonM.map(([x, y]) => [
        originUnits[0] + 32 * (x * c - y * s),
        originUnits[1] + 32 * (x * s + y * c),
      ]),
    );
  };
  for (let i = 0; i < p.length; i++) {
    const u = direction(p[(i + p.length - 1) % p.length], p[i]),
      v = direction(p[i], p[(i + 1) % p.length]);
    let found = false;
    for (let q = 0; q < 4; q++) {
      const profile = profiles.find(
        (s) =>
          s.kind === "corner" &&
          same(rotate(s.incoming!, q), u) &&
          same(rotate(s.outgoing!, q), v),
      );
      if (!profile) continue;
      add(profile, p[i], q);
      cuts.push({
        incoming: profile.incomingCutUnits!,
        outgoing: profile.outgoingCutUnits!,
      });
      found = true;
      break;
    }
    if (!found)
      return fail(
        "This boundary direction has no native complex corner profile",
      );
  }
  for (let i = 0; i < p.length; i++) {
    const next = (i + 1) % p.length,
      u = direction(p[i], p[next]),
      dx = p[next][0] - p[i][0],
      dy = p[next][1] - p[i][1];
    let remaining =
        gcd(Math.abs(dx), Math.abs(dy)) -
        cuts[i].outgoing -
        cuts[next].incoming,
      offset = cuts[i].outgoing;
    if (remaining < 0)
      return fail(
        "A boundary edge is too short for its inward 250 mm corner joins",
      );
    const spans = profiles
      .filter(
        (s) =>
          s.kind === "span" &&
          s.direction![0] ** 2 + s.direction![1] ** 2 === u[0] ** 2 + u[1] ** 2,
      )
      .sort((a, b) => b.stepCount! - a.stepCount!);
    for (const span of spans)
      while (remaining >= span.stepCount!) {
        if (placements.length >= 4096)
          return fail("Complex perimeter exceeds the native piece budget");
        add(
          span,
          [p[i][0] + offset * u[0], p[i][1] + offset * u[1]],
          0,
          Math.atan2(u[1], u[0]),
        );
        remaining -= span.stepCount!;
        offset += span.stepCount!;
      }
    if (remaining !== 0)
      return fail("Native spans cannot fill this boundary exactly");
  }
  try {
    const floor = triangles(p),
      covers = polygons.map(triangles),
      boxes = polygons.map((poly) => [
        Math.min(...poly.map((v) => v[0])),
        Math.max(...poly.map((v) => v[0])),
        Math.min(...poly.map((v) => v[1])),
        Math.max(...poly.map((v) => v[1])),
      ]);
    for (let i = 0; i < polygons.length; i++) {
      const expected = area2(polygons[i]) / 2;
      const supported = covers[i].reduce(
        (sum, a) => sum + floor.reduce((s, b) => s + overlap(a, b), 0),
        0,
      );
      if (expected <= 0 || Math.abs(supported - expected) > 1e-5)
        return fail(
          "An inward native join would leave this floorplan; widen its narrow section",
        );
      for (let j = 0; j < i; j++) {
        const a = boxes[i],
          b = boxes[j];
        if (
          a[0] >= b[1] - 1e-7 ||
          a[1] <= b[0] + 1e-7 ||
          a[2] >= b[3] - 1e-7 ||
          a[3] <= b[2] + 1e-7
        )
          continue;
        const amount = covers[i].reduce(
          (sum, x) => sum + covers[j].reduce((s, y) => s + overlap(x, y), 0),
          0,
        );
        if (amount > 1e-5)
          return fail(
            "Inward native wall joins overlap; widen this narrow section",
          );
      }
    }
  } catch {
    return fail("Unable to validate this complex perimeter reservation");
  }
  return { ok: true as const, placements, polygons, issues };
}
