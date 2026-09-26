/**
 * Authoring helpers for developer prefab ships. They only produce plain grammar data
 * (the same `ShipPrefabDocumentV1` the Shipyard edits), so everything built here can be
 * opened, edited and republished in the Shipyard.
 */
import {
  G,
  insidePolygon,
  placedTilePolygon,
  type EdgeTypeId,
  type FaceNormal,
  type HeightClassId,
  type Pt,
  type QuarterTurn,
  type RoomTypeId,
  type ShapeTileId,
  type ShapeTilePlacement,
  ccw,
} from "../construction-grammar";
import {
  SHIP_PREFAB_SCHEMA,
  type PrefabEdge,
  type PrefabMount,
  type PrefabRoom,
  type PrefabSkylight,
  type PrefabVolume,
  type ShipPrefabDocumentV1,
} from "../ship-prefab";

const k = (p: Pt) => `${Math.round(p[0] * 1e6) / 1e6},${Math.round(p[1] * 1e6) / 1e6}`;

/** Find the shape tile orientation whose placed polygon equals `poly` (vertex sets). */
export function matchTile(shape: ShapeTileId, poly: readonly Pt[]): ShapeTilePlacement {
  const want = new Set(poly.map(k));
  const x = Math.floor(Math.min(...poly.map((p) => p[0])) + 1e-9);
  const y = Math.floor(Math.min(...poly.map((p) => p[1])) + 1e-9);
  for (const reflected of [false, true])
    for (const rot of [0, 1, 2, 3] as QuarterTurn[]) {
      const t: ShapeTilePlacement = { x, y, shape, rot, reflected };
      const got = placedTilePolygon(t);
      if (got.length === want.size && got.every((p) => want.has(k(p)))) return t;
    }
  throw Error(`No ${shape} orientation matches ${JSON.stringify(poly)}`);
}

/**
 * Tiles for a lattice polygon whose edges are axis-aligned or 1:1..1:4 slopes: slope tiles
 * along each diagonal edge (on the inside), squares for every other covered cell.
 * `skip(x, y)` leaves cells empty (e.g. for arc tiles placed separately).
 */
export function polygonTiles(polyIn: readonly Pt[], skip: (x: number, y: number) => boolean = () => false): ShapeTilePlacement[] {
  const poly = ccw(polyIn);
  const tiles: ShapeTilePlacement[] = [];
  const claimed = new Set<string>();
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    if (dx === 0 || dy === 0) continue;
    const shallow = Math.abs(dx) >= Math.abs(dy);
    const ratio = shallow ? Math.abs(dx / dy) : Math.abs(dy / dx);
    if (!Number.isInteger(ratio) || ratio < 1 || ratio > 4) throw Error(`Edge ${k(p)} -> ${k(q)} is not a 1:1..1:4 slope`);
    const steps = shallow ? Math.abs(dy) : Math.abs(dx);
    const sx = dx / steps;
    const sy = dy / steps;
    for (let s = 0; s < steps; s++) {
      const a: Pt = [p[0] + sx * s, p[1] + sy * s];
      const b: Pt = [a[0] + sx, a[1] + sy];
      const c1: Pt = [a[0], b[1]];
      const c2: Pt = [b[0], a[1]];
      const cross = (c: Pt) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const c = cross(c1) > 0 ? c1 : c2;
      const shape = `slope${ratio}` as ShapeTileId;
      const t = matchTile(shape, [a, b, c]);
      if (skip(t.x, t.y)) continue;
      tiles.push(t);
      const [w, h] = G.shapeTiles[shape].size;
      const [tw, th] = t.rot % 2 ? [h, w] : [w, h];
      for (let x = t.x; x < t.x + tw; x++) for (let yy = t.y; yy < t.y + th; yy++) claimed.add(`${x},${yy}`);
    }
  }
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  for (let x = Math.floor(Math.min(...xs)); x < Math.ceil(Math.max(...xs)); x++)
    for (let y = Math.floor(Math.min(...ys)); y < Math.ceil(Math.max(...ys)); y++) {
      if (claimed.has(`${x},${y}`) || skip(x, y)) continue;
      if (insidePolygon(poly, x + 0.5, y + 0.5)) tiles.push({ x, y, shape: "square", rot: 0, reflected: false });
    }
  return tiles;
}

export type Corner = "ne" | "nw" | "se" | "sw";
/** A convex or concave quarter-arc tile rounding the given corner of an r x r box at (x, y). */
export function arcTile(x: number, y: number, r: 1 | 2 | 3 | 4, corner: Corner, concave = false): ShapeTilePlacement {
  const rot = ({ ne: 0, nw: 1, sw: 2, se: 3 } as const)[corner];
  const shape = `arc${r}${concave ? "c" : ""}` as ShapeTileId;
  if (!(shape in G.shapeTiles)) throw Error(`No ${shape} tile`);
  return { x, y, shape, rot: (concave ? (rot + 2) % 4 : rot) as QuarterTurn, reflected: false };
}

export function rectTiles(x0: number, y0: number, x1: number, y1: number): ShapeTilePlacement[] {
  const out: ShapeTilePlacement[] = [];
  for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) out.push({ x, y, shape: "square", rot: 0, reflected: false });
  return out;
}

/** Mirror tiles across the horizontal line y = axis (port/starboard symmetry). */
export function mirrorTilesY(tiles: readonly ShapeTilePlacement[], axis: number): ShapeTilePlacement[] {
  return tiles.map((t) => matchTile(t.shape, placedTilePolygon(t).map(([x, y]) => [x, 2 * axis - y] as Pt)));
}

export function volume(
  id: string,
  kind: "hull" | "plate",
  height: HeightClassId,
  tiles: ShapeTilePlacement[],
  extra: Partial<Pick<PrefabVolume, "spine" | "logo" | "faceStyle">> = {},
): PrefabVolume {
  return { id, kind, height, deck: 0, tiles, ...extra };
}

export const room = (id: string, label: string, type: RoomTypeId, rect: [number, number, number, number]): PrefabRoom => ({ id, label, type, deck: 0, rect });
export const door = (id: string, a: [number, number], b: [number, number], type: EdgeTypeId = "door.standard"): PrefabEdge => ({ id, deck: 0, a, b, type });
export const edge = (id: string, a: [number, number], b: [number, number], type: EdgeTypeId): PrefabEdge => ({ id, deck: 0, a, b, type });
export const top = (id: string, component: string, at: [number, number]): PrefabMount => ({ id, component, attach: "top", at });
export const face = (id: string, component: string, normal: FaceNormal, at: [number, number], z?: number): PrefabMount =>
  z === undefined ? { id, component, attach: "face", at, normal } : { id, component, attach: "face", at, normal, z };
export const opening = (id: string, component: string, normal: FaceNormal, at: [number, number]): PrefabMount => ({ id, component, attach: "edge", at, normal });
export const module = (id: string, component: string, at: [number, number], facing: FaceNormal = "fore"): PrefabMount => ({ id, component, attach: "interior", at, normal: facing });
export const skylight = (id: string, at: [number, number], size: [number, number]): PrefabSkylight => ({ id, at, size });

export function prefab(d: Omit<ShipPrefabDocumentV1, "schema" | "revision" | "decks" | "edges" | "skylights"> & Partial<Pick<ShipPrefabDocumentV1, "edges" | "skylights">>): ShipPrefabDocumentV1 {
  return {
    schema: SHIP_PREFAB_SCHEMA,
    revision: 1,
    decks: [{ index: 0, name: "Main deck" }],
    edges: [],
    skylights: [],
    ...d,
  };
}
