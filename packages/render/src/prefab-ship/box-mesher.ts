/**
 * Chamfered brick mesher for dresser-generated boxes (hull bodies, skins, floor slabs, slope
 * walls, shell bands). Pure TypeScript: output is plain typed arrays in the prefab frame
 * (metres, +X fore, +Y port, +Z up), one array set per material slot.
 *
 * Look: the same 1-segment chamfer as the exported kit (0.012 m bevel, flat facets), so a box
 * is 6 faces + 12 edge strips + 8 corner triangles = 44 triangles. Hidden-face removal is the
 * cheap exact case only: two boxes whose opposing faces cover the identical texel rectangle drop
 * both faces (2 triangles each); the bevel strips stay, which is the brick seam.
 *
 * Coplanar same-facing faces of different slots (overlay stripes on skin panels) are separated
 * by a tiny per-slot outward inflation (<= 0.75 mm), the runtime equivalent of the exporter's
 * "later boxes win" rule; glass shrinks by 0.25 mm.
 */

/** [x0, y0, z0, x1, y1, z1, slot index] in texels (1/16 m). Same shape as the dresser's DressBox. */
export type TexelBox = readonly [number, number, number, number, number, number, number];

export interface BoxMesherOptions {
  /** Metres per texel. Default 1/16. */
  texel?: number;
  /** Chamfer width in metres. Default 0.012 (kit exporter bevel). 0 gives plain 12-triangle boxes. */
  chamfer?: number;
  /** Drop exactly shared opposing faces. Default true. */
  cull?: boolean;
  /** Outward inflation (metres) per slot index; negative shrinks. Default `DEFAULT_SLOT_INFLATION`. */
  inflation?: readonly number[];
}

export interface SlotGeometry {
  slot: number;
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  triangles: number;
  boxes: number;
}

export interface BoxMeshResult {
  slots: SlotGeometry[];
  triangles: number;
  boxes: number;
  culledFaces: number;
}

export const KIT_CHAMFER_M = 0.012;
/** Triangles in one chamfered box with no culled faces. */
export const CHAMFERED_BOX_TRIANGLES = 44;

/**
 * Per-slot inflation in metres, indexed like SHIP_KIT_SLOTS
 * (primary, secondary, accent, trim, metal, dark, emit_a, emit_b, glass). Base panels stay put,
 * overlay stripes (dark vents, metal/trim bands, lights) sit fractionally proud.
 */
export const DEFAULT_SLOT_INFLATION: readonly number[] = [0, 0, 0, 0.0005, 0.0005, 0.00025, 0.00075, 0.00075, -0.00025];

/** Growable triangle soup (prefab frame metres). */
export interface GeometryBuilder {
  positions: number[];
  normals: number[];
  indices: number[];
  boxes: number;
}

export const newBuilder = (): GeometryBuilder => ({ positions: [], normals: [], indices: [], boxes: 0 });

const AXES: readonly [number, number][] = [
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 1],
  [2, -1],
  [2, 1],
];

function faceKey(b: TexelBox, axis: number, side: number): string {
  const u = (axis + 1) % 3;
  const v = (axis + 2) % 3;
  const c = side > 0 ? b[axis + 3] : b[axis];
  return `${axis}|${c}|${b[u]}|${b[v]}|${b[u + 3]}|${b[v + 3]}`;
}

/** (box index, face index) pairs hidden by an exactly matching opposing face of another box. */
export function hiddenFaces(boxes: readonly TexelBox[]): Set<number> {
  const seen = new Map<string, number[]>();
  boxes.forEach((b, i) =>
    AXES.forEach(([axis, side], f) => {
      const k = `${faceKey(b, axis, side)}|${side}`;
      let list = seen.get(k);
      if (!list) seen.set(k, (list = []));
      list.push(i * 6 + f);
    }),
  );
  const hidden = new Set<number>();
  boxes.forEach((b, i) =>
    AXES.forEach(([axis, side], f) => {
      const opposite = seen.get(`${faceKey(b, axis, side)}|${-side}`);
      if (opposite?.some((id) => Math.floor(id / 6) !== i && boxes[Math.floor(id / 6)][6] !== GLASS_SLOT && b[6] !== GLASS_SLOT)) hidden.add(i * 6 + f);
    }),
  );
  return hidden;
}

const GLASS_SLOT = 8;

/** Append a convex polygon with a flat normal, wound counter-clockwise seen from the normal side. */
export function pushPoly(out: GeometryBuilder, pts: readonly (readonly [number, number, number])[], n: readonly [number, number, number]) {
  const base = out.positions.length / 3;
  for (const p of pts) {
    out.positions.push(p[0], p[1], p[2]);
    out.normals.push(n[0], n[1], n[2]);
  }
  // Orient the fan so the geometric normal agrees with n (counter-clockwise seen from outside).
  const [a, b, c] = pts;
  const cx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
  const cy = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
  const cz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const flip = cx * n[0] + cy * n[1] + cz * n[2] < 0;
  for (let k = 1; k + 1 < pts.length; k++) {
    if (flip) out.indices.push(base, base + k + 1, base + k);
    else out.indices.push(base, base + k, base + k + 1);
  }
}

/**
 * Emit one chamfered box. `lo`/`hi` are the outer bounds (metres), `c` the chamfer, `hidden(f)`
 * whether face f (AXES order) is culled.
 */
export function emitBox(out: GeometryBuilder, lo: readonly number[], hi: readonly number[], c: number, hidden: (f: number) => boolean) {
  const inLo = [lo[0] + c, lo[1] + c, lo[2] + c];
  const inHi = [hi[0] - c, hi[1] - c, hi[2] - c];
  const outer = (axis: number, side: number) => (side > 0 ? hi[axis] : lo[axis]);
  const inner = (axis: number, side: number) => (side > 0 ? inHi[axis] : inLo[axis]);
  const pt = (vals: number[]): [number, number, number] => [vals[0], vals[1], vals[2]];
  // Faces.
  AXES.forEach(([axis, side], f) => {
    if (hidden(f)) return;
    const u = (axis + 1) % 3;
    const v = (axis + 2) % 3;
    const corners: [number, number, number][] = [];
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const p = [0, 0, 0];
      p[axis] = outer(axis, side);
      p[u] = inner(u, su);
      p[v] = inner(v, sv);
      corners.push(pt(p));
    }
    const n: [number, number, number] = [0, 0, 0];
    n[axis] = side;
    pushPoly(out, corners, n);
  });
  if (c <= 0) return;
  const r2 = Math.SQRT1_2;
  // Edge strips between two faces (axes a < b), running along the third axis t.
  for (const [a, b] of [[0, 1], [0, 2], [1, 2]] as const) {
    const t = 3 - a - b;
    for (const sa of [-1, 1])
      for (const sb of [-1, 1]) {
        const p = (onA: boolean, st: number) => {
          const q = [0, 0, 0];
          q[a] = onA ? outer(a, sa) : inner(a, sa);
          q[b] = onA ? inner(b, sb) : outer(b, sb);
          q[t] = inner(t, st);
          return pt(q);
        };
        const n: [number, number, number] = [0, 0, 0];
        n[a] = sa * r2;
        n[b] = sb * r2;
        pushPoly(out, [p(true, -1), p(true, 1), p(false, 1), p(false, -1)], n);
      }
  }
  // Corner triangles.
  const r3 = 1 / Math.sqrt(3);
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1]) {
        const s = [sx, sy, sz];
        const tri = [0, 1, 2].map((k) => pt([0, 1, 2].map((a) => (a === k ? outer(a, s[a]) : inner(a, s[a])))));
        pushPoly(out, tri, [sx * r3, sy * r3, sz * r3]);
      }
}

/** Mesh a list of texel boxes into chamfered bricks, one geometry per slot index. */
export function meshBoxes(boxes: readonly TexelBox[], options: BoxMesherOptions = {}): BoxMeshResult {
  const texel = options.texel ?? 1 / 16;
  const chamfer = options.chamfer ?? KIT_CHAMFER_M;
  const inflation = options.inflation ?? DEFAULT_SLOT_INFLATION;
  const hidden = options.cull === false ? new Set<number>() : hiddenFaces(boxes);
  const builders = new Map<number, GeometryBuilder>();
  let culledFaces = 0;
  boxes.forEach((b, i) => {
    if (b[3] <= b[0] || b[4] <= b[1] || b[5] <= b[2]) return;
    const slot = b[6];
    let out = builders.get(slot);
    if (!out) builders.set(slot, (out = newBuilder()));
    const e = inflation[slot] ?? 0;
    const lo = [b[0] * texel - e, b[1] * texel - e, b[2] * texel - e];
    const hi = [b[3] * texel + e, b[4] * texel + e, b[5] * texel + e];
    const c = Math.min(chamfer, 0.3 * Math.min(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]));
    emitBox(out, lo, hi, c, (f) => {
      const h = hidden.has(i * 6 + f);
      if (h) culledFaces++;
      return h;
    });
    out.boxes++;
  });
  const slots = [...builders.entries()]
    .sort((m, n) => m[0] - n[0])
    .map(([slot, g]) => ({
      slot,
      positions: new Float32Array(g.positions),
      normals: new Float32Array(g.normals),
      indices: new Uint32Array(g.indices),
      triangles: g.indices.length / 3,
      boxes: g.boxes,
    }));
  return { slots, triangles: slots.reduce((n, s) => n + s.triangles, 0), boxes: slots.reduce((n, s) => n + s.boxes, 0), culledFaces };
}
