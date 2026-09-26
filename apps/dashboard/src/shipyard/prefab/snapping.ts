/**
 * Cursor snapping and live placement checks for the prefab plan editor. Pure: the
 * canvas passes plan-space points (metres, +X fore, +Y port) and gets grammar-shaped
 * candidates plus the first failing rule, if any.
 */
import {
  G,
  axisFaces,
  insideOutline,
  placedTileSize,
  type EdgeTypeId,
  type FaceNormal,
  type Pt,
  type ShapeTilePlacement,
} from "@sidereal/content/construction-grammar";
import {
  deckVolume,
  deriveInterior,
  placeMount,
  roomCells,
  validateMount,
  type PrefabComponentCatalog,
  type PrefabComponentSpec,
  type PrefabMount,
  type PrefabRoom,
  type ShipPrefabDocumentV1,
  type VolumeGeometry,
} from "@sidereal/content/ship-prefab";
import { overlappingTiles, roomRectsOverlap, segKey, unitSegments } from "./commands";
import { mirrorMount, snapHalf } from "./symmetry";

type Doc = ShipPrefabDocumentV1;

export interface PlacementCheck {
  ok: boolean;
  /** First failing rule, shown on the ghost and in the status bar. */
  reason?: string;
}

// ------------------------------------------------------------------ tiles, rooms, skylights
/** Tile whose bounding box is centred on the cursor cell. */
export function tileCandidate(p: Pt, shape: ShapeTilePlacement["shape"], rot: ShapeTilePlacement["rot"], reflected: boolean): ShapeTilePlacement {
  const [w, h] = placedTileSize({ shape, rot });
  return { x: Math.round(p[0] - w / 2), y: Math.round(p[1] - h / 2), shape, rot, reflected };
}

export function checkTile(doc: Doc, volumeId: string, t: ShapeTilePlacement): PlacementCheck {
  const v = doc.volumes.find((x) => x.id === volumeId);
  if (!v) return { ok: false, reason: "Pick a volume to paint into" };
  if (overlappingTiles(v.tiles, t).length) return { ok: false, reason: "Overlaps an existing tile in this volume" };
  return { ok: true };
}

/** Cell rectangle [x0, y0, x1, y1) covering both cursor cells of a drag. */
export function roomRectFromDrag(a: Pt, b: Pt): PrefabRoom["rect"] {
  const [ax, ay] = [Math.floor(a[0]), Math.floor(a[1])];
  const [bx, by] = [Math.floor(b[0]), Math.floor(b[1])];
  return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx) + 1, Math.max(ay, by) + 1];
}

export function checkRoom(doc: Doc, rect: PrefabRoom["rect"], type: PrefabRoom["type"], ignore?: string): PlacementCheck {
  const clash = doc.rooms.find((r) => r.id !== ignore && roomRectsOverlap(r.rect, rect));
  if (clash) return { ok: false, reason: `Overlaps room ${clash.label}` };
  const deck = deckVolume(doc, 0);
  if (!deck?.outline) return { ok: false, reason: "Rooms need a walkable deck-class hull volume" };
  if (!roomCells({ id: "_", label: "_", type, deck: 0, rect }, deck.outline).length) return { ok: false, reason: "Outside the deck hull" };
  const narrow = Math.min(rect[2] - rect[0], rect[3] - rect[1]);
  if (type === "corridor" && narrow < G.deck.minCorridorCells) return { ok: false, reason: `Corridors must be at least ${G.deck.minCorridorCells} cells wide` };
  return { ok: true };
}

export function skylightCandidate(p: Pt, size: [number, number]): { at: [number, number]; size: [number, number] } {
  return { at: [Math.round(p[0] - size[0] / 2), Math.round(p[1] - size[1] / 2)], size };
}

export function checkSkylight(doc: Doc, geoms: readonly VolumeGeometry[], at: [number, number], size: [number, number], catalog: PrefabComponentCatalog, ignore?: string): PlacementCheck {
  const corners: Pt[] = [[0.1, 0.1], [size[0] - 0.1, 0.1], [0.1, size[1] - 0.1], [size[0] - 0.1, size[1] - 0.1]];
  const onRoof = geoms.some((g) => g.outline && g.volume.kind === "hull" && corners.every(([dx, dy]) => insideOutline(g.outline!, at[0] + dx, at[1] + dy)));
  if (!onRoof) return { ok: false, reason: "Skylights sit fully on a hull roof" };
  const rect = [at[0], at[1], at[0] + size[0], at[1] + size[1]];
  const clash = doc.skylights.find((s) => s.id !== ignore && roomRectsOverlap([s.at[0], s.at[1], s.at[0] + s.size[0], s.at[1] + s.size[1]], rect));
  if (clash) return { ok: false, reason: `Overlaps skylight ${clash.id}` };
  for (const m of doc.mounts) {
    if (m.attach !== "top") continue;
    if (roomRectsOverlap(placeMount(m, catalog.get(m.component), geoms).rect, rect)) return { ok: false, reason: `Overlaps top mount ${m.id}` };
  }
  return { ok: true };
}

// ------------------------------------------------------------------ edges
/**
 * Nearest lattice edge to the cursor. `cells` = 1 gives the unit edge under the cursor;
 * doors take 2 collinear cells centred on the nearest lattice point along that line.
 */
export function snapEdge(p: Pt, cells: 1 | 2): { a: [number, number]; b: [number, number] } {
  const [x, y] = p;
  const dH = Math.abs(y - Math.round(y));
  const dV = Math.abs(x - Math.round(x));
  if (dH <= dV) {
    const Y = Math.round(y);
    const x0 = cells === 1 ? Math.floor(x) : Math.round(x) - 1;
    return { a: [x0, Y], b: [x0 + cells, Y] };
  }
  const X = Math.round(x);
  const y0 = cells === 1 ? Math.floor(y) : Math.round(y) - 1;
  return { a: [X, y0], b: [X, y0 + cells] };
}

export const edgeCells = (type: EdgeTypeId): 1 | 2 => (G.edgeTypes[type].door ? 2 : 1);

const edgeContext = new WeakMap<Doc, { exterior: Set<string>; roomEdges: Set<string> }>();

function edgeKeys(doc: Doc, catalog: PrefabComponentCatalog) {
  let c = edgeContext.get(doc);
  if (c) return c;
  const interior = deriveInterior(doc, 0, catalog);
  const exterior = new Set(interior.exteriorWalls.map((w) => segKey([w.a, w.b])));
  for (const d of interior.doors) if (d.exterior) for (const s of unitSegments(d.a, d.b)) exterior.add(segKey(s));
  const roomEdges = new Set<string>();
  const deck = deckVolume(doc, 0);
  if (deck?.outline)
    for (const room of doc.rooms)
      for (const [x, y] of roomCells(room, deck.outline))
        for (const s of [
          [[x, y], [x + 1, y]],
          [[x, y + 1], [x + 1, y + 1]],
          [[x, y], [x, y + 1]],
          [[x + 1, y], [x + 1, y + 1]],
        ] as [Pt, Pt][])
          roomEdges.add(segKey(s));
  c = { exterior, roomEdges };
  edgeContext.set(doc, c);
  return c;
}

/** Same placement rules as `validateShipPrefab` edge checks, for one candidate. */
export function checkEdge(doc: Doc, catalog: PrefabComponentCatalog, a: readonly number[], b: readonly number[], type: EdgeTypeId): PlacementCheck {
  const { exterior, roomEdges } = edgeKeys(doc, catalog);
  const segs = unitSegments(a, b).map(segKey);
  if (G.edgeTypes[type].door && segs.length !== 2) return { ok: false, reason: "Doors span exactly two cells (2 m module)" };
  if (segs.every((k) => exterior.has(k))) return { ok: false, reason: "Exterior openings are edge mounts (airlock or cargo door), not edges" };
  if (!segs.every((k) => roomEdges.has(k) && !exterior.has(k))) return { ok: false, reason: `${G.edgeTypes[type].label} must lie on room boundaries inside the hull` };
  return { ok: true };
}

// ------------------------------------------------------------------ mounts
export type MountMode = "top" | "face" | "edge" | "interior";

/** Placement modes a component supports ("rear" is a face mode restricted to aft faces). */
export function mountModes(spec: PrefabComponentSpec): MountMode[] {
  const out: MountMode[] = [];
  for (const a of spec.attach) {
    const m: MountMode = a === "rear" ? "face" : a;
    if (!out.includes(m)) out.push(m);
  }
  return out;
}

/** Plan extents of a component placed with the given attach/facing. */
export function mountExtent(spec: PrefabComponentSpec, attach: "top" | "interior", normal?: FaceNormal): [number, number] {
  const r = placeMount({ id: "_", component: spec.id, attach, at: [0, 0], ...(attach === "interior" ? { normal: normal ?? "fore" } : {}) }, spec, []).rect;
  return [r[2] - r[0], r[3] - r[1]];
}

interface FaceLine {
  a: Pt;
  b: Pt;
  normal: FaceNormal;
  volume: string;
}

export function hullFaces(geoms: readonly VolumeGeometry[], onlyVolume?: string): FaceLine[] {
  const out: FaceLine[] = [];
  for (const g of geoms) {
    if (!g.outline || (onlyVolume && g.volume.id !== onlyVolume)) continue;
    for (const f of axisFaces(g.outline.outer)) out.push({ a: f.a, b: f.b, normal: f.normal, volume: g.volume.id });
  }
  return out;
}

function distanceToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/**
 * Snap a component to a hardpoint anchor near the cursor.
 * - top: footprint centred on the cursor, min corner on the 0.5 m roof grid;
 * - interior: same on the floor, turned by `facing`;
 * - face: nearest straight hull face (outward normal chosen from the face), 0.5 m along it;
 * - edge: nearest straight face of the walkable deck volume, spanning whole wall cells.
 */
export function snapMount(
  doc: Doc,
  geoms: readonly VolumeGeometry[],
  spec: PrefabComponentSpec,
  mode: MountMode,
  p: Pt,
  facing: FaceNormal = "fore",
): Omit<PrefabMount, "id"> | null {
  if (mode === "top" || mode === "interior") {
    const [ex, ey] = mountExtent(spec, mode, facing);
    const at: [number, number] = [snapHalf(p[0] - ex / 2), snapHalf(p[1] - ey / 2)];
    return mode === "top" ? { component: spec.id, attach: "top", at } : { component: spec.id, attach: "interior", at, normal: facing };
  }
  const rearOnly = mode === "face" && !spec.attach.includes("face");
  const deck = mode === "edge" ? deckVolume(doc, 0) : null;
  if (mode === "edge" && !deck) return null;
  const faces = hullFaces(geoms, deck?.volume.id).filter((f) => !rearOnly || f.normal === "aft");
  if (!faces.length) return null;
  let best = faces[0];
  let bestD = Infinity;
  for (const f of faces) {
    const d = distanceToSegment(p, f.a, f.b);
    if (d < bestD - 1e-9) {
      best = f;
      bestD = d;
    }
  }
  const along = best.normal === "fore" || best.normal === "aft" ? 1 : 0;
  const width = Math.max(1, spec.cells[0]);
  const lo = Math.min(best.a[along], best.b[along]);
  const hi = Math.max(best.a[along], best.b[along]);
  const snapAlong = (v: number) => (mode === "edge" ? Math.round(v - width / 2) + width / 2 : snapHalf(v));
  let c = snapAlong(p[along]);
  if (hi - lo >= width) c = Math.min(Math.max(c, lo + width / 2), hi - width / 2);
  c = snapAlong(c);
  if (hi - lo >= width && (c - width / 2 < lo - 1e-9 || c + width / 2 > hi + 1e-9)) c = mode === "edge" ? Math.ceil(lo) + width / 2 : snapHalf(lo + width / 2);
  const at: [number, number] = along === 1 ? [best.a[0], c] : [c, best.a[1]];
  return { component: spec.id, attach: mode, at, normal: best.normal };
}

/** Live green/red feedback: `validateMount` for the candidate and, with symmetry, its mirror. */
export function checkMount(
  doc: Doc,
  catalog: PrefabComponentCatalog,
  geoms: readonly VolumeGeometry[],
  candidate: PrefabMount,
  mirror: number | null = null,
  ignore?: string,
): PlacementCheck & { mirrored?: PrefabMount } {
  const others = doc.mounts.filter((m) => m.id !== ignore);
  // Validate as if placed: edge openings are derived doors looked up by mount id.
  const placed = (list: PrefabMount[]): Doc => ({ ...doc, mounts: list });
  const issues = validateMount(placed([...others, candidate]), candidate, catalog, geoms, others).filter((i) => i.severity === "error");
  if (issues.length) return { ok: false, reason: issues[0].message };
  if (mirror !== null) {
    const m = { ...mirrorMount(candidate, catalog.get(candidate.component), mirror), id: `${candidate.id}-mirror` };
    const same = m.at[0] === candidate.at[0] && m.at[1] === candidate.at[1] && m.normal === candidate.normal;
    if (!same) {
      const mi = validateMount(placed([...others, candidate, m]), m, catalog, geoms, [...others, candidate]).filter((i) => i.severity === "error");
      if (mi.length) return { ok: false, reason: `Mirror: ${mi[0].message}`, mirrored: m };
      return { ok: true, mirrored: m };
    }
  }
  return { ok: true };
}
