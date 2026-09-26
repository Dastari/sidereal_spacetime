/**
 * Pure document commands for the prefab editor. Each takes a document and returns a new
 * one (or the same object when nothing changed, which the history ignores). None of them
 * normalise or repair other data; validation stays with `validateShipPrefab`.
 */
import {
  placedTilePolygon,
  placedTileSize,
  insidePolygon,
  tileOverlaps,
  type FaceNormal,
  type QuarterTurn,
  type ShapeTilePlacement,
} from "@sidereal/content/construction-grammar";
import type {
  PrefabComponentCatalog,
  PrefabEdge,
  PrefabMount,
  PrefabRoom,
  PrefabSkylight,
  PrefabVolume,
  ShipPrefabDocumentV1,
} from "@sidereal/content/ship-prefab";
import {
  mirrorEdge,
  mirrorMount,
  mirrorRoom,
  mirrorSkylight,
  mirrorTile,
  sameEdge,
  sameMount,
  sameRect,
  sameTile,
} from "./symmetry";

type Doc = ShipPrefabDocumentV1;

export type PrefabSelection =
  | { kind: "volume"; id: string }
  | { kind: "tile"; volume: string; index: number }
  | { kind: "room"; id: string }
  | { kind: "edge"; id: string }
  | { kind: "mount"; id: string }
  | { kind: "skylight"; id: string };

export interface CommandResult {
  doc: Doc;
  /** Why (part of) the command was refused; the document may still have changed. */
  error?: string;
  /** Selection to adopt after the command, when it created something. */
  select?: PrefabSelection;
}

/** Grammar ids: lower-case, digits, dot, dash, underscore; unique within a collection. */
export function uniqueId(taken: Iterable<string>, base: string): string {
  const used = new Set(taken);
  const stem =
    base
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^[^a-z0-9]+/, "")
      .slice(0, 60) || "item";
  if (!used.has(stem)) return stem;
  for (let i = 2; ; i++) if (!used.has(`${stem}-${i}`)) return `${stem}-${i}`;
}

// ------------------------------------------------------------------ metadata
export function updateMeta(
  doc: Doc,
  patch: Partial<Pick<Doc, "id" | "name" | "description" | "faction" | "role" | "theme" | "sizeClass" | "revision">>,
): Doc {
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  if (keys.every((k) => doc[k] === patch[k])) return doc;
  return { ...doc, ...patch };
}

export function updateMarkings(doc: Doc, patch: Partial<Doc["markings"]>): Doc {
  const keys = Object.keys(patch) as (keyof Doc["markings"])[];
  if (keys.every((k) => doc.markings[k] === patch[k])) return doc;
  return { ...doc, markings: { ...doc.markings, ...patch } };
}

// ------------------------------------------------------------------ volumes and tiles
export function addVolume(doc: Doc, init: Partial<PrefabVolume> = {}): CommandResult {
  const kind = init.kind ?? "hull";
  const id = uniqueId(doc.volumes.map((v) => v.id), init.id ?? (kind === "plate" ? "plate" : "hull"));
  const volume: PrefabVolume = { id, kind, height: init.height ?? (kind === "plate" ? "wing" : "pod"), deck: 0, tiles: init.tiles ?? [] };
  if (init.spine !== undefined) volume.spine = init.spine;
  if (init.logo !== undefined) volume.logo = init.logo;
  if (init.faceStyle !== undefined) volume.faceStyle = init.faceStyle;
  return { doc: { ...doc, volumes: [...doc.volumes, volume] }, select: { kind: "volume", id } };
}

export function updateVolume(doc: Doc, id: string, patch: Partial<Omit<PrefabVolume, "id" | "tiles">>): Doc {
  const v = doc.volumes.find((x) => x.id === id);
  if (!v) return doc;
  const next: PrefabVolume = { ...v };
  for (const [k, value] of Object.entries(patch) as [keyof PrefabVolume, unknown][]) {
    if (value === undefined) delete next[k];
    else (next as unknown as Record<string, unknown>)[k] = value;
  }
  return { ...doc, volumes: doc.volumes.map((x) => (x.id === id ? next : x)) };
}

export function removeVolume(doc: Doc, id: string): Doc {
  if (!doc.volumes.some((v) => v.id === id)) return doc;
  return { ...doc, volumes: doc.volumes.filter((v) => v.id !== id) };
}

const tileBox = (t: ShapeTilePlacement): [number, number, number, number] => {
  const [w, h] = placedTileSize(t);
  return [t.x, t.y, t.x + w, t.y + h];
};
const boxesTouch = (a: number[], b: number[]) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

/** Indices of tiles that overlap `candidate` (same deterministic coverage test as validation). */
export function overlappingTiles(tiles: readonly ShapeTilePlacement[], candidate: ShapeTilePlacement): number[] {
  const box = tileBox(candidate);
  const near = tiles.map((t, i) => [t, i] as const).filter(([t]) => boxesTouch(tileBox(t), box));
  if (!near.length) return [];
  const pairs = tileOverlaps([...near.map(([t]) => t), candidate]);
  const last = near.length;
  return pairs.filter(([a, b]) => a === last || b === last).map(([a, b]) => near[a === last ? b : a][1]);
}

/**
 * Paint tiles into a volume. Tiles that overlap existing (or earlier painted) tiles are
 * rejected; with symmetry each tile brings its mirror (skipped when it lands on itself).
 */
export function paintTiles(doc: Doc, volumeId: string, candidates: readonly ShapeTilePlacement[], mirror: number | null = null): CommandResult {
  const volume = doc.volumes.find((v) => v.id === volumeId);
  if (!volume) return { doc, error: "Pick a volume to paint into" };
  const tiles = [...volume.tiles];
  let rejected = 0;
  for (const c of candidates) {
    const set = [c];
    if (mirror !== null) {
      const m = mirrorTile(c, mirror);
      if (!sameTile(m, c)) set.push(m);
    }
    for (const t of set) {
      if (overlappingTiles(tiles, t).length) rejected++;
      else tiles.push(t);
    }
  }
  if (tiles.length === volume.tiles.length) return { doc, error: rejected ? "Overlaps an existing tile" : undefined };
  return {
    doc: { ...doc, volumes: doc.volumes.map((v) => (v.id === volumeId ? { ...v, tiles } : v)) },
    error: rejected ? `${rejected} overlapping tile${rejected === 1 ? "" : "s"} skipped` : undefined,
  };
}

/** Index of the topmost tile of the volume whose polygon contains the point, or -1. */
export function tileIndexAt(volume: PrefabVolume, x: number, y: number, skip?: ReadonlySet<number>): number {
  for (let i = volume.tiles.length - 1; i >= 0; i--) {
    if (skip?.has(i)) continue;
    const t = volume.tiles[i];
    const [x0, y0, x1, y1] = tileBox(t);
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    if (insidePolygon(placedTilePolygon(t), x, y)) return i;
  }
  return -1;
}

/** Erase the tiles under each point (and their mirrors). */
export function eraseTiles(doc: Doc, volumeId: string, points: readonly (readonly [number, number])[], mirror: number | null = null): Doc {
  const volume = doc.volumes.find((v) => v.id === volumeId);
  if (!volume) return doc;
  const drop = new Set<number>();
  const all = mirror === null ? points : [...points, ...points.map(([x, y]) => [x, 2 * mirror - y] as const)];
  for (const [x, y] of all) {
    const i = tileIndexAt(volume, x, y, drop);
    if (i >= 0) drop.add(i);
  }
  if (!drop.size) return doc;
  return { ...doc, volumes: doc.volumes.map((v) => (v.id === volumeId ? { ...v, tiles: v.tiles.filter((_, i) => !drop.has(i)) } : v)) };
}

/** Replace one tile; refused when the result would overlap another tile. */
export function replaceTile(doc: Doc, volumeId: string, index: number, tile: ShapeTilePlacement): CommandResult {
  const volume = doc.volumes.find((v) => v.id === volumeId);
  if (!volume || !volume.tiles[index]) return { doc };
  const others = volume.tiles.filter((_, i) => i !== index);
  if (overlappingTiles(others, tile).length) return { doc, error: "That would overlap another tile" };
  const tiles = volume.tiles.map((t, i) => (i === index ? tile : t));
  return { doc: { ...doc, volumes: doc.volumes.map((v) => (v.id === volumeId ? { ...v, tiles } : v)) } };
}

// ------------------------------------------------------------------ rooms
export function roomRectsOverlap(a: readonly number[], b: readonly number[]) {
  return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
}

export function addRoom(doc: Doc, room: Omit<PrefabRoom, "id" | "deck">, mirror: number | null = null): CommandResult {
  const rooms = [...doc.rooms];
  const taken = rooms.map((r) => r.id);
  const created: PrefabRoom[] = [];
  const base = { ...room, deck: 0 };
  const set = [base];
  if (mirror !== null) {
    const m = mirrorRoom(base, mirror);
    if (!sameRect(m.rect, base.rect)) set.push(m);
  }
  for (const r of set) {
    const clash = [...rooms, ...created].find((o) => roomRectsOverlap(o.rect, r.rect));
    if (clash) return { doc, error: `Overlaps room ${clash.label}` };
    const id = uniqueId([...taken, ...created.map((c) => c.id)], r.label || r.type);
    created.push({ id, ...r });
  }
  return { doc: { ...doc, rooms: [...rooms, ...created] }, select: { kind: "room", id: created[0].id } };
}

export function updateRoom(doc: Doc, id: string, patch: Partial<Omit<PrefabRoom, "id">>): Doc {
  if (!doc.rooms.some((r) => r.id === id)) return doc;
  return { ...doc, rooms: doc.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)) };
}

// ------------------------------------------------------------------ edges
type Seg = [[number, number], [number, number]];
export function unitSegments(a: readonly number[], b: readonly number[]): Seg[] {
  const L = Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]));
  const dx = (b[0] - a[0]) / L;
  const dy = (b[1] - a[1]) / L;
  const out: Seg[] = [];
  for (let u = 0; u < L; u++) out.push([[a[0] + dx * u, a[1] + dy * u], [a[0] + dx * (u + 1), a[1] + dy * (u + 1)]]);
  return out;
}
export const segKey = ([p, q]: readonly (readonly number[])[]) => {
  const [m, n] = p[0] < q[0] || (p[0] === q[0] && p[1] <= q[1]) ? [p, q] : [q, p];
  return `${m[0]},${m[1]}|${n[0]},${n[1]}`;
};

/**
 * Place an edge feature. Existing edges sharing any unit segment are replaced; placing the
 * exact same edge and type again removes it (toggle).
 */
export function placeEdge(doc: Doc, edge: Omit<PrefabEdge, "id" | "deck">, mirror: number | null = null): CommandResult {
  const set = [edge];
  if (mirror !== null) {
    const m = mirrorEdge(edge, mirror);
    if (!sameEdge(m, edge)) set.push(m);
  }
  const exact = doc.edges.find((e) => sameEdge(e, edge) && e.type === edge.type);
  if (exact) {
    const mirrored = mirror !== null ? doc.edges.find((e) => e !== exact && sameEdge(e, mirrorEdge(edge, mirror)) && e.type === edge.type) : undefined;
    return { doc: { ...doc, edges: doc.edges.filter((e) => e !== exact && e !== mirrored) } };
  }
  const keys = new Set(set.flatMap((e) => unitSegments(e.a, e.b).map(segKey)));
  const kept = doc.edges.filter((e) => !unitSegments(e.a, e.b).some((s) => keys.has(segKey(s))));
  const created: PrefabEdge[] = [];
  for (const e of set) {
    const base = e.type.startsWith("door") ? "door" : e.type.replace(/\./g, "-");
    const id = uniqueId([...kept.map((x) => x.id), ...created.map((x) => x.id)], base);
    created.push({ id, deck: 0, a: [...e.a] as [number, number], b: [...e.b] as [number, number], type: e.type });
  }
  return { doc: { ...doc, edges: [...kept, ...created] }, select: { kind: "edge", id: created[0].id } };
}

export function updateEdge(doc: Doc, id: string, patch: Partial<Omit<PrefabEdge, "id">>): Doc {
  if (!doc.edges.some((e) => e.id === id)) return doc;
  return { ...doc, edges: doc.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) };
}

// ------------------------------------------------------------------ mounts and skylights
export function mountIdBase(component: string) {
  return component.split(".")[0] || "mount";
}

export function addMount(doc: Doc, mount: Omit<PrefabMount, "id">, catalog: PrefabComponentCatalog, mirror: number | null = null): CommandResult {
  const spec = catalog.get(mount.component);
  const set: Omit<PrefabMount, "id">[] = [mount];
  if (mirror !== null) {
    const m = mirrorMount({ ...mount, id: "_" }, spec, mirror);
    const { id: _drop, ...rest } = m;
    void _drop;
    if (!sameMount(m, { ...mount, id: "_" })) set.push(rest);
  }
  const created: PrefabMount[] = [];
  for (const m of set) {
    const id = uniqueId([...doc.mounts.map((x) => x.id), ...created.map((x) => x.id)], mountIdBase(m.component));
    created.push(cleanMount({ id, ...m }));
  }
  return { doc: { ...doc, mounts: [...doc.mounts, ...created] }, select: { kind: "mount", id: created[0].id } };
}

/** Drop optional keys that are undefined so documents stay admissible and canonical. */
export function cleanMount(m: PrefabMount): PrefabMount {
  const out: PrefabMount = { id: m.id, component: m.component, attach: m.attach, at: [m.at[0], m.at[1]] };
  if (m.normal !== undefined && m.attach !== "top") out.normal = m.normal;
  if (m.z !== undefined && m.attach === "face") out.z = m.z;
  return out;
}

export function updateMount(doc: Doc, id: string, patch: Partial<Omit<PrefabMount, "id">>): Doc {
  if (!doc.mounts.some((m) => m.id === id)) return doc;
  return { ...doc, mounts: doc.mounts.map((m) => (m.id === id ? cleanMount({ ...m, ...patch }) : m)) };
}

export function addSkylight(doc: Doc, s: Omit<PrefabSkylight, "id">, mirror: number | null = null): CommandResult {
  const set = [s];
  if (mirror !== null) {
    const m = mirrorSkylight({ ...s, id: "_" }, mirror);
    if (m.at[1] !== s.at[1]) set.push({ at: m.at, size: m.size });
  }
  const created: PrefabSkylight[] = [];
  for (const x of set) {
    const clash = [...doc.skylights, ...created].find((o) =>
      roomRectsOverlap([o.at[0], o.at[1], o.at[0] + o.size[0], o.at[1] + o.size[1]], [x.at[0], x.at[1], x.at[0] + x.size[0], x.at[1] + x.size[1]]),
    );
    if (clash) return { doc, error: `Overlaps skylight ${clash.id}` };
    created.push({ id: uniqueId([...doc.skylights.map((o) => o.id), ...created.map((o) => o.id)], "sky"), at: [...x.at], size: [...x.size] });
  }
  return { doc: { ...doc, skylights: [...doc.skylights, ...created] }, select: { kind: "skylight", id: created[0].id } };
}

export function updateSkylight(doc: Doc, id: string, patch: Partial<Omit<PrefabSkylight, "id">>): Doc {
  if (!doc.skylights.some((s) => s.id === id)) return doc;
  return { ...doc, skylights: doc.skylights.map((s) => (s.id === id ? { ...s, ...patch } : s)) };
}

// ------------------------------------------------------------------ selection commands
export function selectionExists(doc: Doc, sel: PrefabSelection | null): boolean {
  if (!sel) return false;
  switch (sel.kind) {
    case "volume":
      return doc.volumes.some((v) => v.id === sel.id);
    case "tile":
      return !!doc.volumes.find((v) => v.id === sel.volume)?.tiles[sel.index];
    case "room":
      return doc.rooms.some((r) => r.id === sel.id);
    case "edge":
      return doc.edges.some((e) => e.id === sel.id);
    case "mount":
      return doc.mounts.some((m) => m.id === sel.id);
    case "skylight":
      return doc.skylights.some((s) => s.id === sel.id);
  }
}

export function removeSelection(doc: Doc, sel: PrefabSelection): Doc {
  switch (sel.kind) {
    case "volume":
      return removeVolume(doc, sel.id);
    case "tile":
      return {
        ...doc,
        volumes: doc.volumes.map((v) => (v.id === sel.volume ? { ...v, tiles: v.tiles.filter((_, i) => i !== sel.index) } : v)),
      };
    case "room":
      return { ...doc, rooms: doc.rooms.filter((r) => r.id !== sel.id) };
    case "edge":
      return { ...doc, edges: doc.edges.filter((e) => e.id !== sel.id) };
    case "mount":
      return { ...doc, mounts: doc.mounts.filter((m) => m.id !== sel.id) };
    case "skylight":
      return { ...doc, skylights: doc.skylights.filter((s) => s.id !== sel.id) };
  }
}

/** Move the selection by whole cells (mounts: 0.5 m steps along their grid). */
export function nudgeSelection(doc: Doc, sel: PrefabSelection, dx: number, dy: number): CommandResult {
  switch (sel.kind) {
    case "room": {
      const r = doc.rooms.find((x) => x.id === sel.id);
      if (!r) return { doc };
      const rect: PrefabRoom["rect"] = [r.rect[0] + dx, r.rect[1] + dy, r.rect[2] + dx, r.rect[3] + dy];
      const clash = doc.rooms.find((o) => o.id !== r.id && roomRectsOverlap(o.rect, rect));
      if (clash) return { doc, error: `Would overlap room ${clash.label}` };
      return { doc: updateRoom(doc, r.id, { rect }) };
    }
    case "mount": {
      const m = doc.mounts.find((x) => x.id === sel.id);
      if (!m) return { doc };
      // Face and edge mounts slide along their face only; the face line stays fixed.
      let [mx, my] = [dx, dy];
      if (m.attach === "face" || m.attach === "edge") {
        if (m.normal === "fore" || m.normal === "aft") mx = 0;
        else my = 0;
      }
      if (mx === 0 && my === 0) return { doc, error: "Face mounts slide along their face" };
      return { doc: updateMount(doc, m.id, { at: [m.at[0] + mx, m.at[1] + my] }) };
    }
    case "skylight": {
      const s = doc.skylights.find((x) => x.id === sel.id);
      if (!s) return { doc };
      return { doc: updateSkylight(doc, s.id, { at: [s.at[0] + Math.sign(dx) * Math.ceil(Math.abs(dx)), s.at[1] + Math.sign(dy) * Math.ceil(Math.abs(dy))] }) };
    }
    case "edge": {
      const e = doc.edges.find((x) => x.id === sel.id);
      if (!e) return { doc };
      const [ix, iy] = [Math.sign(dx) * Math.ceil(Math.abs(dx)), Math.sign(dy) * Math.ceil(Math.abs(dy))];
      return { doc: updateEdge(doc, e.id, { a: [e.a[0] + ix, e.a[1] + iy], b: [e.b[0] + ix, e.b[1] + iy] }) };
    }
    case "tile": {
      const v = doc.volumes.find((x) => x.id === sel.volume);
      const t = v?.tiles[sel.index];
      if (!t) return { doc };
      return replaceTile(doc, sel.volume, sel.index, { ...t, x: t.x + Math.sign(dx) * Math.ceil(Math.abs(dx)), y: t.y + Math.sign(dy) * Math.ceil(Math.abs(dy)) });
    }
    case "volume": {
      const [ix, iy] = [Math.sign(dx) * Math.ceil(Math.abs(dx)), Math.sign(dy) * Math.ceil(Math.abs(dy))];
      return { doc: { ...doc, volumes: doc.volumes.map((v) => (v.id === sel.id ? { ...v, tiles: v.tiles.map((t) => ({ ...t, x: t.x + ix, y: t.y + iy })) } : v)) } };
    }
  }
}

export const NEXT_FACING: Record<FaceNormal, FaceNormal> = { fore: "port", port: "aft", aft: "starboard", starboard: "fore" };

/** R: turn a tile a quarter (counter-clockwise) or an interior module's facing. */
export function rotateSelection(doc: Doc, sel: PrefabSelection): CommandResult {
  if (sel.kind === "tile") {
    const t = doc.volumes.find((v) => v.id === sel.volume)?.tiles[sel.index];
    if (!t) return { doc };
    return replaceTile(doc, sel.volume, sel.index, { ...t, rot: ((t.rot + 1) % 4) as QuarterTurn });
  }
  if (sel.kind === "mount") {
    const m = doc.mounts.find((x) => x.id === sel.id);
    if (!m) return { doc };
    if (m.attach !== "interior") return { doc, error: "Only interior modules turn; face mounts take their face's normal" };
    return { doc: updateMount(doc, m.id, { normal: NEXT_FACING[m.normal ?? "fore"] }) };
  }
  if (sel.kind === "skylight") {
    const s = doc.skylights.find((x) => x.id === sel.id);
    if (!s) return { doc };
    return { doc: updateSkylight(doc, s.id, { size: [s.size[1], s.size[0]] }) };
  }
  return { doc, error: "Select a tile, interior module or skylight to rotate" };
}

// ------------------------------------------------------------------ ids
/** Grammar element ids (volumes, rooms, edges, mounts, skylights). */
export const ELEMENT_ID = /^[a-z0-9][a-z0-9._-]{0,79}$/;

/**
 * Rename an element. Ids are authored data: room ids become construction room ids and
 * mount ids name derived doors and sockets, so the Inspector lets authors set them exactly.
 */
export function renameElement(doc: Doc, sel: PrefabSelection, id: string): CommandResult {
  if (sel.kind === "tile") return { doc, error: "Tiles have no id" };
  if (sel.id === id) return { doc };
  if (!ELEMENT_ID.test(id)) return { doc, error: "Ids use lower-case letters, digits, dots, dashes and underscores" };
  const key = ({ volume: "volumes", room: "rooms", edge: "edges", mount: "mounts", skylight: "skylights" } as const)[sel.kind];
  const list = doc[key] as readonly { id: string }[];
  if (!list.some((x) => x.id === sel.id)) return { doc };
  if (list.some((x) => x.id === id)) return { doc, error: `${id} is already used by another ${sel.kind}` };
  return {
    doc: { ...doc, [key]: list.map((x) => (x.id === sel.id ? { ...x, id } : x)) },
    select: { kind: sel.kind, id },
  };
}

/** F: reflect a tile. */
export function reflectSelection(doc: Doc, sel: PrefabSelection): CommandResult {
  if (sel.kind !== "tile") return { doc, error: "Select a tile to mirror" };
  const t = doc.volumes.find((v) => v.id === sel.volume)?.tiles[sel.index];
  if (!t) return { doc };
  return replaceTile(doc, sel.volume, sel.index, { ...t, reflected: !t.reflected });
}
