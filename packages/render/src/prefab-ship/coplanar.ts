/**
 * Z-fighting detector for prefab ship presentation (pure; no Babylon objects).
 *
 * Two triangles z-fight when they face the same way, lie in the same plane (within a depth
 * tolerance far below what a 24-bit depth buffer resolves at game camera distances) and overlap
 * in that plane. Triangles meeting along an edge, or back-to-back faces, do not count.
 *
 * Input is labelled triangle soup already transformed into one common frame (metres). The
 * result aggregates overlaps per source pair, so a whole duplicated object reports once.
 */

export interface TriangleSource {
  /** Stable label (mesh name, instance index, placement id). */
  source: string;
  /** xyz triples in the common frame. */
  positions: ArrayLike<number>;
  indices: ArrayLike<number>;
  /** Only triangles in `[first, first + count)` of `indices` (default: all). */
  first?: number;
  count?: number;
  /** Material identity. Overlaps between identical materials shade identically and are skipped. */
  material?: string;
}

export interface CoplanarOverlap {
  a: string;
  b: string;
  /** Summed overlap area (m²) over every overlapping triangle pair of the two sources. */
  area: number;
  /** Overlapping triangle pairs. */
  pairs: number;
  /** A point inside one overlap (common frame), for locating the problem. */
  at: [number, number, number];
  normal: [number, number, number];
}

export interface CoplanarOptions {
  /** Max plane separation (m) that still counts as coplanar. Default 0.5 mm. */
  planeTolerance?: number;
  /** Ignore overlaps smaller than this per triangle pair (m²). Default 1 cm². */
  minArea?: number;
  /** Include overlaps between triangles of the same source. Default true. */
  sameSource?: boolean;
  /** Only report overlaps that are exposed: the space just in front of them is not inside
   * other geometry (ray parity against every source). Default true. */
  exposedOnly?: boolean;
}

interface Tri {
  src: number;
  /** Offset of the triangle's first index in its source's index array. */
  firstIndex: number;
  p: [number, number, number][];
  n: [number, number, number];
  d: number;
  lo: [number, number, number];
  hi: [number, number, number];
}

const dot = (a: readonly number[], b: readonly number[]) =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function triangles(sources: readonly TriangleSource[]): Tri[] {
  const out: Tri[] = [];
  sources.forEach((s, src) => {
    const P = s.positions;
    const I = s.indices;
    const end = s.count === undefined ? I.length : (s.first ?? 0) + s.count;
    for (let t = s.first ?? 0; t + 2 < end; t += 3) {
      const p = [I[t], I[t + 1], I[t + 2]].map(
        (i) =>
          [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]] as [number, number, number],
      );
      const e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
      const e2 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
      const c: [number, number, number] = [
        e1[1] * e2[2] - e1[2] * e2[1],
        e1[2] * e2[0] - e1[0] * e2[2],
        e1[0] * e2[1] - e1[1] * e2[0],
      ];
      const len = Math.hypot(c[0], c[1], c[2]);
      if (len < 2e-8) continue; // degenerate
      const n: [number, number, number] = [c[0] / len, c[1] / len, c[2] / len];
      const lo: [number, number, number] = [0, 1, 2].map((k) =>
        Math.min(p[0][k], p[1][k], p[2][k]),
      ) as [number, number, number];
      const hi: [number, number, number] = [0, 1, 2].map((k) =>
        Math.max(p[0][k], p[1][k], p[2][k]),
      ) as [number, number, number];
      out.push({ src, firstIndex: t, p, n, d: dot(n, p[0]), lo, hi });
    }
  });
  return out;
}

type P2 = [number, number];
const cross2 = (o: P2, a: P2, b: P2) =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
function area2(poly: P2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

/** Sutherland-Hodgman: clip `subject` by the convex counter-clockwise polygon `clip`. */
function clipConvex(subject: P2[], clip: P2[]): P2[] {
  let out = subject;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j];
      const q = input[(j + 1) % input.length];
      const pin = cross2(a, b, p) >= 0;
      const qin = cross2(a, b, q) >= 0;
      if (pin) out.push(p);
      if (pin !== qin) {
        const dp = cross2(a, b, p);
        const dq = cross2(a, b, q);
        const t = dp / (dp - dq);
        out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
  }
  return out;
}

/** Overlap area (m²) of two coplanar same-facing triangles and a point inside it. */
function overlap(
  a: Tri,
  b: Tri,
): { area: number; at: [number, number, number] } {
  const n = a.n;
  // Plane basis (u, v, n) right-handed so both triangles project counter-clockwise.
  const ref = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = [
    ref[1] * n[2] - ref[2] * n[1],
    ref[2] * n[0] - ref[0] * n[2],
    ref[0] * n[1] - ref[1] * n[0],
  ];
  const ul = Math.hypot(u[0], u[1], u[2]);
  u[0] /= ul;
  u[1] /= ul;
  u[2] /= ul;
  const v = [
    n[1] * u[2] - n[2] * u[1],
    n[2] * u[0] - n[0] * u[2],
    n[0] * u[1] - n[1] * u[0],
  ];
  const proj = (t: Tri): P2[] => {
    const q = t.p.map((p) => [dot(p, u), dot(p, v)] as P2);
    return area2(q) < 0 ? q.reverse() : q;
  };
  const poly = clipConvex(proj(a), proj(b));
  if (poly.length < 3) return { area: 0, at: [0, 0, 0] };
  const area = Math.abs(area2(poly));
  const cu = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const cv = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  return {
    area,
    at: [0, 1, 2].map((k) => cu * u[k] + cv * v[k] + a.d * n[k]) as [
      number,
      number,
      number,
    ],
  };
}

/**
 * Visit every pair of same-facing triangles whose planes lie within `tol` and whose bounds touch.
 * Triangles are grouped by quantised facing, clustered along the plane offset, then swept.
 */
function forEachCoplanarPair(
  tris: readonly Tri[],
  tol: number,
  visit: (a: Tri, b: Tri) => void,
) {
  const groups = new Map<string, Tri[]>();
  for (const t of tris) {
    const key = facingKey(t.n);
    let g = groups.get(key);
    if (!g) groups.set(key, (g = []));
    g.push(t);
  }
  for (const g of groups.values()) {
    g.sort((a, b) => a.d - b.d);
    let start = 0;
    while (start < g.length) {
      // Cluster of triangles whose plane offsets chain within the tolerance.
      let end = start + 1;
      while (end < g.length && g[end].d - g[end - 1].d <= tol) end++;
      const cluster = g.slice(start, end);
      start = end;
      if (cluster.length < 2) continue;
      // Sweep-and-prune along an axis that is not the plane normal's dominant one.
      const n = cluster[0].n;
      const dominant =
        Math.abs(n[0]) >= Math.abs(n[1]) && Math.abs(n[0]) >= Math.abs(n[2])
          ? 0
          : Math.abs(n[1]) >= Math.abs(n[2])
            ? 1
            : 2;
      const axis = dominant === 0 ? 1 : 0;
      cluster.sort((a, b) => a.lo[axis] - b.lo[axis]);
      for (let i = 0; i < cluster.length; i++) {
        const a = cluster[i];
        for (let j = i + 1; j < cluster.length; j++) {
          const b = cluster[j];
          if (b.lo[axis] >= a.hi[axis]) break;
          if (Math.abs(a.d - b.d) > tol || dot(a.n, b.n) < 0.9995) continue;
          if (
            [0, 1, 2].some(
              (k) => b.lo[k] > a.hi[k] + tol || a.lo[k] > b.hi[k] + tol,
            )
          )
            continue;
          visit(a, b);
        }
      }
    }
  }
}

/** Every pair of sources with coplanar, same-facing, overlapping triangles. Largest area first. */
export function findCoplanarOverlaps(
  sources: readonly TriangleSource[],
  options: CoplanarOptions = {},
): CoplanarOverlap[] {
  const tol = options.planeTolerance ?? 0.0005;
  const minArea = options.minArea ?? 1e-4;
  const same = options.sameSource ?? true;
  const exposedOnly = options.exposedOnly ?? true;
  const tris = triangles(sources);
  const exposed = exposure(tris);
  const found = new Map<string, CoplanarOverlap>();
  forEachCoplanarPair(tris, tol, (a, b) => {
    if (!same && a.src === b.src) return;
    const ma = sources[a.src].material;
    if (ma !== undefined && ma === sources[b.src].material) return;
    const o = overlap(a, b);
    if (o.area < minArea) return;
    if (exposedOnly && !exposed(o.at, a.n)) return;
    const [s, t] = a.src <= b.src ? [a.src, b.src] : [b.src, a.src];
    const key = `${s}|${t}`;
    const prev = found.get(key);
    if (prev) {
      prev.area += o.area;
      prev.pairs++;
    } else
      found.set(key, {
        a: sources[s].source,
        b: sources[t].source,
        area: o.area,
        pairs: 1,
        at: o.at,
        normal: a.n,
      });
  });
  return [...found.values()].sort((x, y) => y.area - x.area);
}

export interface CoplanarLayer {
  /** xyz triples, shared by every layer of one mesh; moved triangles append new vertices here. */
  positions: number[];
  /** Per-vertex normals parallel to `positions` (copied for appended vertices). */
  normals?: number[];
  /** Index array shared by the mesh; this layer owns `[first, first + count)`. */
  indices: number[];
  first: number;
  count: number;
  /** Higher draws in front where two layers share a plane. Equal priorities are left alone. */
  priority: number;
  /** Layers with the same material shade identically where they overlap and are left alone. */
  material?: string;
}

/**
 * Deterministic decal offset for coplanar surfaces of different materials. Wherever two layers
 * share a plane and overlap, the higher-priority layer's triangles move out along their normal to
 * `step` in front of everything they cover (stacked layers stay ordered: B over A by one step, C
 * over B over A by two), so each overlap has exactly one visible winner at any camera distance.
 *
 * Moved triangles get their own vertex copies, so neighbouring faces are never dragged along.
 * Returns the number of triangles moved.
 */
export function resolveCoplanarLayers(
  layers: readonly CoplanarLayer[],
  options: {
    step?: number;
    planeTolerance?: number;
    minArea?: number;
    /** A moved face can land on a surface that sat exactly one step in front; re-check. */
    passes?: number;
  } = {},
): number {
  let total = 0;
  let dirty: Set<string> | undefined;
  for (let pass = 0; pass < (options.passes ?? 3); pass++) {
    const result = resolvePass(layers, options, dirty);
    total += result.moved;
    if (!result.moved) break;
    dirty = result.planes;
  }
  return total;
}

const facingKey = (n: readonly number[]) =>
  `${Math.round(n[0] * 20)},${Math.round(n[1] * 20)},${Math.round(n[2] * 20)}`;

function resolvePass(
  layers: readonly CoplanarLayer[],
  options: { step?: number; planeTolerance?: number; minArea?: number },
  /** Later passes only revisit planes that received a moved triangle. */
  only?: ReadonlySet<string>,
): { moved: number; planes: Set<string> } {
  const step = options.step ?? 0.001;
  const tol = options.planeTolerance ?? 0.0005;
  const minArea = options.minArea ?? 1e-6;
  const bucket = (d: number) => Math.round(d / (4 * tol));
  let tris = triangles(
    layers.map((l, i) => ({
      source: String(i),
      positions: l.positions,
      indices: l.indices,
      first: l.first,
      count: l.count,
    })),
  );
  if (only)
    tris = tris.filter((t) => {
      const k = facingKey(t.n);
      const b = bucket(t.d);
      return (
        only.has(`${k}|${b - 1}`) ||
        only.has(`${k}|${b}`) ||
        only.has(`${k}|${b + 1}`)
      );
    });
  // Winning triangles and the triangles they cover.
  const beaten = new Map<Tri, Tri[]>();
  forEachCoplanarPair(tris, tol, (a, b) => {
    const pa = layers[a.src].priority;
    const pb = layers[b.src].priority;
    if (pa === pb) return;
    const ma = layers[a.src].material;
    if (ma !== undefined && ma === layers[b.src].material) return;
    if (overlap(a, b).area < minArea) return;
    const [win, lose] = pa > pb ? [a, b] : [b, a];
    let list = beaten.get(win);
    if (!list) beaten.set(win, (list = []));
    list.push(lose);
  });
  // Target plane offset: one step in front of the (moved) plane of everything covered. Priorities
  // strictly decrease along `beaten`, so the recursion terminates.
  const targets = new Map<Tri, number>();
  const targetOf = (t: Tri): number => {
    const known = targets.get(t);
    if (known !== undefined) return known;
    let d = t.d;
    for (const l of beaten.get(t) ?? []) d = Math.max(d, targetOf(l) + step);
    targets.set(t, d);
    return d;
  };
  let moved = 0;
  const planes = new Set<string>();
  for (const t of beaten.keys()) {
    const off = targetOf(t) - t.d;
    if (off <= 0) continue;
    planes.add(`${facingKey(t.n)}|${bucket(t.d + off)}`);
    const L = layers[t.src];
    const base = L.positions.length / 3;
    for (let k = 0; k < 3; k++) {
      const v = L.indices[t.firstIndex + k];
      L.positions.push(
        L.positions[v * 3] + t.n[0] * off,
        L.positions[v * 3 + 1] + t.n[1] * off,
        L.positions[v * 3 + 2] + t.n[2] * off,
      );
      L.normals?.push(
        L.normals[v * 3],
        L.normals[v * 3 + 1],
        L.normals[v * 3 + 2],
      );
      L.indices[t.firstIndex + k] = base + k;
    }
    moved++;
  }
  return { moved, planes };
}

/**
 * Point-in-solid test by the nearest hit along the face normal: a point just in front of a face
 * is enclosed when the first surface the ray meets faces away from it (the ray is leaving a
 * solid). Axis-aligned rays use 2D bins; others fall back to a linear scan.
 */
function exposure(tris: Tri[]) {
  const CELL = 0.25;
  const bins = [0, 1, 2].map(() => new Map<string, Tri[]>());
  for (const t of tris)
    for (let k = 0; k < 3; k++) {
      const [u, v] = [(k + 1) % 3, (k + 2) % 3];
      for (
        let i = Math.floor(t.lo[u] / CELL);
        i <= Math.floor(t.hi[u] / CELL);
        i++
      )
        for (
          let j = Math.floor(t.lo[v] / CELL);
          j <= Math.floor(t.hi[v] / CELL);
          j++
        ) {
          const key = `${i},${j}`;
          let b = bins[k].get(key);
          if (!b) bins[k].set(key, (b = []));
          b.push(t);
        }
    }
  return (at: readonly number[], n: readonly number[]): boolean => {
    const eps = 0.002;
    const o = [at[0] + n[0] * eps, at[1] + n[1] * eps, at[2] + n[2] * eps];
    const k = [0, 1, 2].find((i) => Math.abs(n[i]) > 0.9999);
    const candidates =
      k === undefined
        ? tris
        : (bins[k].get(
            `${Math.floor(o[(k + 1) % 3] / CELL)},${Math.floor(o[(k + 2) % 3] / CELL)}`,
          ) ?? []);
    let best = Infinity;
    let facing = 0;
    for (const t of candidates) {
      const denom = dot(t.n, n);
      if (Math.abs(denom) < 1e-9) continue;
      const dist = (t.d - dot(t.n, o)) / denom;
      if (dist <= 1e-6 || dist >= best) continue;
      const p = [o[0] + n[0] * dist, o[1] + n[1] * dist, o[2] + n[2] * dist];
      if (!insideTriangle(t, p)) continue;
      best = dist;
      facing = denom;
    }
    return !(facing > 0);
  };
}

function insideTriangle(t: Tri, p: readonly number[]): boolean {
  for (let i = 0; i < 3; i++) {
    const a = t.p[i];
    const b = t.p[(i + 1) % 3];
    const e = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const w = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
    const c = [
      e[1] * w[2] - e[2] * w[1],
      e[2] * w[0] - e[0] * w[2],
      e[0] * w[1] - e[1] * w[0],
    ];
    if (dot(c, t.n) < -1e-9) return false;
  }
  return true;
}
