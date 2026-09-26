/**
 * Construction grammar v1 for prefab ships (docs/shipyard_player_builder_design.md §3, §12).
 *
 * Pure and deterministic. The numbers live in construction-grammar.v1.json, which the
 * Python kit exporter reads as well, so no kit restates them.
 *
 * Frame: ship-local metres, +X fore, +Y port, +Z up. Plan cells are 1 m. Heights are
 * texels (1/16 m). Shape tiles are polygons on the 1 m lattice, not assets.
 */
import grammarJson from "./construction-grammar.v1.json";

export type Pt = readonly [number, number];

export type ShapeTileId = keyof typeof grammarJson.shapeTiles;
export type HeightClassId = keyof typeof grammarJson.heightClasses;
export type MountSizeId = keyof typeof grammarJson.mountSizes;
export type BlueprintSizeClassId = keyof typeof grammarJson.blueprintSizeClasses;
export type EdgeTypeId = keyof typeof grammarJson.edgeTypes;
export type RoomTypeId = keyof typeof grammarJson.roomTypes;
export type FloorKindId = (typeof grammarJson.floorKinds)[number];
export type WallVariantId = (typeof grammarJson.wallVariants)[number];
export type QuarterTurn = 0 | 1 | 2 | 3;

export interface HeightClass {
  z: [number, number];
  kinds: ("hull" | "plate")[];
  walkable: boolean;
  massPerM2: number;
  label: string;
}
export interface RoomTypeSpec {
  floor: FloorKindId;
  walls: WallVariantId[];
  light: [number, number, number];
  control?: boolean;
  /** [art-library design id, width texels, depth texels, height texels] */
  sockets: [string, number, number, number][];
}
export interface EdgeTypeSpec {
  seals: boolean;
  walkable: boolean;
  door?: boolean;
  label: string;
}
export interface BlueprintSizeClass {
  label: string;
  maxCells: [number, number];
  maxMount: MountSizeId;
  maxDecks: number;
  maxMounts: number;
}

export const CONSTRUCTION_GRAMMAR = grammarJson as unknown as {
  schema: "sidereal.construction-grammar.v1";
  texelsPerMeter: number;
  latticePerMeter: number;
  cellMeters: number;
  deck: {
    pitchTexels: number;
    floorTopTexels: number;
    wallTopTexels: number;
    roofTexels: number;
    interiorCutTexels: number;
    shellCutTexels: number;
    exteriorWallTexels: number;
    partitionTexels: number;
    minCorridorCells: number;
  };
  heightClasses: Record<HeightClassId, HeightClass>;
  tierRule: {
    twoTierMinTexels: number;
    lowerTierTexels: number;
    twoTierRimTexels: number;
    oneTierMinTexels: number;
    oneTierRimTexels: number;
    cassetteMinTexels: number;
    smallSplitMinTexels: number;
    skirtTexels: number;
  };
  shapeTiles: Record<
    ShapeTileId,
    {
      size: [number, number];
      kind: "polygon" | "arc";
      points?: [number, number][];
      radius?: number;
      concave?: boolean;
      label: string;
    }
  >;
  arcSegmentsPerRadius: number;
  mountSizes: Record<MountSizeId, { cells: number; label: string }>;
  blueprintSizeClasses: Record<BlueprintSizeClassId, BlueprintSizeClass>;
  edgeTypes: Record<EdgeTypeId, EdgeTypeSpec>;
  wallVariants: WallVariantId[];
  floorKinds: FloorKindId[];
  roomTypes: Record<RoomTypeId, RoomTypeSpec>;
  cassettes: {
    face: string[];
    windows: string[];
    pickWidth1: string[];
    pickWidth2: string[];
    pickWidth3: string[];
    pickSmall: string[];
    packWidths: number[];
    smallSplitChance: number;
  };
  roof: {
    moduleSizes: [number, number][];
    bigKinds: string[];
    thinKinds: string[];
    smallKinds: string[];
    rimKinds: string[];
    skylightSizes: [number, number][];
  };
  decorators: Record<string, string>;
};

export const G = CONSTRUCTION_GRAMMAR;
export const TEXEL = 1 / G.texelsPerMeter;
export const SHAPE_TILE_IDS = Object.keys(G.shapeTiles) as ShapeTileId[];
export const HEIGHT_CLASS_IDS = Object.keys(G.heightClasses) as HeightClassId[];
export const MOUNT_SIZE_IDS = Object.keys(G.mountSizes) as MountSizeId[];
export const BLUEPRINT_SIZE_CLASS_IDS = Object.keys(
  G.blueprintSizeClasses,
) as BlueprintSizeClassId[];
export const EDGE_TYPE_IDS = Object.keys(G.edgeTypes) as EdgeTypeId[];
export const ROOM_TYPE_IDS = Object.keys(G.roomTypes) as RoomTypeId[];

export const mountSizeRank = (size: MountSizeId): number =>
  MOUNT_SIZE_IDS.indexOf(size);

/** Snap floating noise onto the exact lattice values the tiles are built from. */
function snap(v: number): number {
  const r = Math.round(v);
  if (Math.abs(v - r) < 1e-9) return r;
  return Math.round(v * 1e9) / 1e9;
}

/** FNV-1a style hash in [0, 1). Same algorithm as the Python prototype `H`. */
export function hash01(...parts: (string | number)[]): number {
  let h = 2166136261;
  for (const v of parts) {
    const words =
      typeof v === "string"
        ? Array.from(v, (c) => c.charCodeAt(0))
        : [Math.trunc(v)];
    for (const w of words) {
      h = Math.imul((h ^ (w >>> 0)) >>> 0, 16777619) >>> 0;
      h = (h ^ (h >>> 13)) >>> 0;
    }
  }
  return (h % 100000) / 100000;
}

export function signedArea(poly: readonly Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

export const ccw = (poly: readonly Pt[]): Pt[] =>
  signedArea(poly) > 0 ? [...poly] : [...poly].reverse();

/** Even-odd point in polygon. */
export function insidePolygon(poly: readonly Pt[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, n = poly.length; i < n; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % n];
    if (y0 > y !== y1 > y && x < x0 + ((y - y0) * (x1 - x0)) / (y1 - y0)) c = !c;
  }
  return c;
}

export interface Outline {
  outer: Pt[];
  holes: Pt[][];
}

export function insideOutline(o: Outline, x: number, y: number): boolean {
  return insidePolygon(o.outer, x, y) && !o.holes.some((h) => insidePolygon(h, x, y));
}

export function outlineArea(o: Outline): number {
  return (
    Math.abs(signedArea(o.outer)) -
    o.holes.reduce((s, h) => s + Math.abs(signedArea(h)), 0)
  );
}

/** Quarter circle points from angle a0 to a1 degrees (inclusive), centred at c. */
export function arcPoints(
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
  n: number,
): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    out.push([snap(cx + r * Math.cos(a)), snap(cy + r * Math.sin(a))]);
  }
  return out;
}

/** CCW polygon of a shape tile in its local bounding box [0,w]x[0,h] (cells). */
export function shapeTileLocalPolygon(shape: ShapeTileId): Pt[] {
  const spec = G.shapeTiles[shape];
  if (!spec) throw Error(`Unknown shape tile ${shape}`);
  if (spec.kind === "polygon") return ccw(spec.points!.map(([x, y]) => [x, y] as Pt));
  const r = spec.radius!;
  const n = G.arcSegmentsPerRadius * r;
  if (!spec.concave) return ccw([[0, 0], ...arcPoints(0, 0, r, 0, 90, n)]);
  // Square minus the quarter disc centred on the origin corner.
  const arc = arcPoints(0, 0, r, 90, 0, n).slice(1, -1);
  return ccw([[r, 0], [r, r], [0, r], ...arc]);
}

export interface ShapeTilePlacement {
  /** Min corner of the placed tile's bounding box, whole cells. */
  x: number;
  y: number;
  shape: ShapeTileId;
  /** Counter-clockwise quarter turns, applied after the mirror. */
  rot: QuarterTurn;
  /** Mirror across the local vertical axis before rotating. */
  reflected: boolean;
}

export function placedTileSize(t: Pick<ShapeTilePlacement, "shape" | "rot">): [number, number] {
  const [w, h] = G.shapeTiles[t.shape].size;
  return t.rot % 2 ? [h, w] : [w, h];
}

/** CCW polygon of a placed tile in ship cells. */
export function placedTilePolygon(t: ShapeTilePlacement): Pt[] {
  let [w, h] = G.shapeTiles[t.shape].size;
  let pts: Pt[] = shapeTileLocalPolygon(t.shape);
  if (t.reflected) pts = pts.map(([x, y]) => [w - x, y] as Pt);
  for (let k = 0; k < t.rot; k++) {
    pts = pts.map(([x, y]) => [h - y, x] as Pt);
    [w, h] = [h, w];
  }
  return ccw(pts.map(([x, y]) => [snap(x + t.x), snap(y + t.y)] as Pt));
}

const key = (p: Pt) => `${snap(p[0])},${snap(p[1])}`;

/** Split an axis-aligned edge at whole-metre lattice points. */
function splitAxisEdge(a: Pt, b: Pt): [Pt, Pt][] {
  const vertical = Math.abs(a[0] - b[0]) < 1e-9;
  const horizontal = Math.abs(a[1] - b[1]) < 1e-9;
  if (!vertical && !horizontal) return [[a, b]];
  const axis = vertical ? 1 : 0;
  const lo = Math.min(a[axis], b[axis]);
  const hi = Math.max(a[axis], b[axis]);
  const cuts = [lo];
  for (let v = Math.floor(lo) + 1; v < hi - 1e-9; v++) if (v > lo + 1e-9) cuts.push(v);
  cuts.push(hi);
  const forward = b[axis] > a[axis];
  if (!forward) cuts.reverse();
  const out: [Pt, Pt][] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const p: Pt = vertical ? [a[0], cuts[i]] : [cuts[i], a[1]];
    const q: Pt = vertical ? [a[0], cuts[i + 1]] : [cuts[i + 1], a[1]];
    out.push([p, q]);
  }
  return out;
}

const turnAngle = (din: Pt, dout: Pt) => {
  // Signed angle from din to dout in (-pi, pi]; positive is a left (CCW) turn.
  return Math.atan2(din[0] * dout[1] - din[1] * dout[0], din[0] * dout[0] + din[1] * dout[1]);
};

/** Merge consecutive collinear edges of a closed loop. */
export function simplifyLoop(loop: readonly Pt[]): Pt[] {
  let pts = [...loop];
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length];
      const b = pts[i];
      const c = pts[(i + 1) % pts.length];
      const d1: Pt = [b[0] - a[0], b[1] - a[1]];
      const d2: Pt = [c[0] - b[0], c[1] - b[1]];
      const cross = d1[0] * d2[1] - d1[1] * d2[0];
      const dot = d1[0] * d2[0] + d1[1] * d2[1];
      if (Math.abs(cross) < 1e-9 && dot > 0) {
        pts.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  // Start on the lowest-left vertex so outlines are canonical.
  let best = 0;
  for (let i = 1; i < pts.length; i++)
    if (pts[i][1] < pts[best][1] - 1e-9 || (Math.abs(pts[i][1] - pts[best][1]) < 1e-9 && pts[i][0] < pts[best][0]))
      best = i;
  return [...pts.slice(best), ...pts.slice(0, best)];
}

export interface TileUnion {
  /** Counter-clockwise outer loops. A valid volume has exactly one. */
  outers: Pt[][];
  /** Clockwise hole loops. */
  holes: Pt[][];
}

/**
 * Union of non-overlapping tiles by edge cancellation: shared edges appear once in
 * each direction and cancel, leaving the boundary. Pinch vertices take the leftmost
 * turn so touching corners stay separate loops.
 */
export function unionTiles(tiles: readonly ShapeTilePlacement[]): TileUnion {
  const edges = new Map<string, [Pt, Pt]>();
  for (const t of tiles) {
    const poly = placedTilePolygon(t);
    for (let i = 0; i < poly.length; i++) {
      for (const [a, b] of splitAxisEdge(poly[i], poly[(i + 1) % poly.length])) {
        const k = `${key(a)}|${key(b)}`;
        const reverse = `${key(b)}|${key(a)}`;
        if (edges.has(reverse)) edges.delete(reverse);
        else edges.set(k, [a, b]);
      }
    }
  }
  const outgoing = new Map<string, [Pt, Pt][]>();
  for (const e of [...edges.values()].sort((m, n) => key(m[0]).localeCompare(key(n[0])) || key(m[1]).localeCompare(key(n[1])))) {
    const k = key(e[0]);
    if (!outgoing.has(k)) outgoing.set(k, []);
    outgoing.get(k)!.push(e);
  }
  const used = new Set<[Pt, Pt]>();
  const loops: Pt[][] = [];
  for (const list of outgoing.values()) {
    for (const start of list) {
      if (used.has(start)) continue;
      const loop: Pt[] = [];
      let e = start;
      for (let guard = 0; guard < 100000; guard++) {
        used.add(e);
        loop.push(e[0]);
        const din: Pt = [e[1][0] - e[0][0], e[1][1] - e[0][1]];
        const next = (outgoing.get(key(e[1])) ?? []).filter((c) => !used.has(c));
        if (!next.length) break;
        next.sort(
          (m, n) =>
            turnAngle(din, [n[1][0] - n[0][0], n[1][1] - n[0][1]]) -
            turnAngle(din, [m[1][0] - m[0][0], m[1][1] - m[0][1]]),
        );
        e = next[0];
      }
      if (loop.length >= 3) loops.push(simplifyLoop(loop));
    }
  }
  const outers = loops.filter((l) => signedArea(l) > 0);
  const holes = loops.filter((l) => signedArea(l) < 0);
  const order = (a: Pt[], b: Pt[]) => a[0][1] - b[0][1] || a[0][0] - b[0][0];
  return { outers: outers.sort(order), holes: holes.sort(order) };
}

/** Sample offsets never lie on a 1:1..1:4 slope diagonal of the lattice. */
const SAMPLE_OFFSETS: Pt = [0.37, 0.61];
export const COVERAGE_SAMPLES_PER_CELL = 8;

/**
 * Deterministic coverage sampling (8x8 per cell). Returns sample keys per tile index so
 * callers can find overlaps (a sample claimed by two tiles).
 */
export function tileOverlaps(tiles: readonly ShapeTilePlacement[]): [number, number][] {
  const owner = new Map<string, number>();
  const pairs = new Set<string>();
  const n = COVERAGE_SAMPLES_PER_CELL;
  tiles.forEach((t, ti) => {
    const poly = placedTilePolygon(t);
    const [w, h] = placedTileSize(t);
    for (let cx = t.x; cx < t.x + w; cx++)
      for (let cy = t.y; cy < t.y + h; cy++)
        for (let i = 0; i < n; i++)
          for (let j = 0; j < n; j++) {
            const x = cx + (i + SAMPLE_OFFSETS[0]) / n;
            const y = cy + (j + SAMPLE_OFFSETS[1]) / n;
            if (!insidePolygon(poly, x, y)) continue;
            const k = `${cx}:${cy}:${i}:${j}`;
            const prev = owner.get(k);
            if (prev !== undefined && prev !== ti) pairs.add(`${Math.min(prev, ti)}:${Math.max(prev, ti)}`);
            else owner.set(k, ti);
          }
  });
  return [...pairs].map((p) => p.split(":").map(Number) as [number, number]);
}

/** Cells whose area is fully inside the outline (the Python prototype's 5-point test). */
export function fullCells(o: Outline): [number, number][] {
  const xs = o.outer.map((p) => p[0]);
  const ys = o.outer.map((p) => p[1]);
  const out: [number, number][] = [];
  for (let cx = Math.floor(Math.min(...xs)); cx < Math.ceil(Math.max(...xs)); cx++)
    for (let cy = Math.floor(Math.min(...ys)); cy < Math.ceil(Math.max(...ys)); cy++) {
      const pts: Pt[] = [
        [cx + 0.02, cy + 0.02],
        [cx + 0.98, cy + 0.02],
        [cx + 0.02, cy + 0.98],
        [cx + 0.98, cy + 0.98],
        [cx + 0.5, cy + 0.5],
      ];
      if (pts.every(([x, y]) => insideOutline(o, x, y))) out.push([cx, cy]);
    }
  return out;
}

export interface VolumeTiers {
  tiers: [number, number][];
  rim: [number, number] | null;
}

/** Face tiering of a volume's z band (texels); same rule as the prototype `vol_tiers`. */
export function volumeTiers(z0: number, z1: number): VolumeTiers {
  const r = G.tierRule;
  const h = z1 - z0;
  if (h >= r.twoTierMinTexels)
    return {
      tiers: [
        [z0, z0 + r.lowerTierTexels],
        [z0 + r.lowerTierTexels, z1 - r.twoTierRimTexels],
      ],
      rim: [z1 - r.twoTierRimTexels, z1],
    };
  if (h >= r.oneTierMinTexels) return { tiers: [[z0, z1 - r.oneTierRimTexels]], rim: [z1 - r.oneTierRimTexels, z1] };
  return { tiers: [[z0, z1]], rim: null };
}

/** Every cassette height (texels) the dresser can request, and every rim height. */
export function cassetteHeights(): { cassettes: number[]; rims: number[] } {
  const cassettes = new Set<number>();
  const rims = new Set<number>();
  for (const id of HEIGHT_CLASS_IDS) {
    const [z0, z1] = G.heightClasses[id].z;
    const { tiers, rim } = volumeTiers(z0, z1);
    for (const [t0, t1] of tiers) {
      const h = t1 - t0;
      if (h < G.tierRule.cassetteMinTexels) continue;
      cassettes.add(h);
      if (h >= G.tierRule.smallSplitMinTexels) {
        cassettes.add(Math.floor(h / 2));
        cassettes.add(h - Math.floor(h / 2));
      }
    }
    if (rim) rims.add(rim[1] - rim[0]);
  }
  return { cassettes: [...cassettes].sort((a, b) => a - b), rims: [...rims].sort((a, b) => a - b) };
}

export type FaceNormal = "fore" | "aft" | "port" | "starboard";
export const FACE_NORMALS: FaceNormal[] = ["fore", "aft", "port", "starboard"];
export const NORMAL_VECTOR: Record<FaceNormal, Pt> = {
  fore: [1, 0],
  aft: [-1, 0],
  port: [0, 1],
  starboard: [0, -1],
};
/** Kit face-piece rotation in degrees: outward normal = (-sin r, cos r), local +X = (cos r, sin r). */
export const NORMAL_ROTATION_DEG: Record<FaceNormal, number> = {
  port: 0,
  aft: 90,
  starboard: 180,
  fore: 270,
};

export function normalOf(v: Pt): FaceNormal | null {
  for (const n of FACE_NORMALS) {
    const [x, y] = NORMAL_VECTOR[n];
    if (Math.abs(v[0] - x) < 1e-6 && Math.abs(v[1] - y) < 1e-6) return n;
  }
  return null;
}

/** Axis-aligned outline edges with their outward normal (outer loops are CCW). */
export function axisFaces(loop: readonly Pt[]): { a: Pt; b: Pt; normal: FaceNormal; length: number }[] {
  const out: { a: Pt; b: Pt; normal: FaceNormal; length: number }[] = [];
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const L = Math.hypot(dx, dy);
    if (Math.abs(dx) > 1e-9 && Math.abs(dy) > 1e-9) continue;
    const n = normalOf([dy / L, -dx / L]);
    if (n) out.push({ a, b, normal: n, length: L });
  }
  return out;
}
