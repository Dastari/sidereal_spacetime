/**
 * Prefab ship document v1: grammar data only (docs/shipyard_player_builder_design.md §3, §8, §12).
 *
 * A prefab is hull volumes (shape tiles + height class), a room plan (labels only), edge
 * features (doors, glazing, half walls), typed hardpoint mounts that reference the ship
 * component catalog, skylights and markings. Everything visual (cassettes, roofs, rims,
 * skins, walls, posts, object sockets) is DERIVED deterministically from this data.
 *
 * Frame: ship-local metres, +X fore, +Y port, +Z up; plan cells are 1 m; heights in texels.
 */
import {
  G,
  TEXEL,
  axisFaces,
  fullCells,
  hash01,
  insideOutline,
  insidePolygon,
  mountSizeRank,
  outlineArea,
  placedTileSize,
  tileOverlaps,
  unionTiles,
  NORMAL_VECTOR,
  type BlueprintSizeClassId,
  type EdgeTypeId,
  type FaceNormal,
  type FloorKindId,
  type HeightClassId,
  type MountSizeId,
  type Outline,
  type Pt,
  type RoomTypeId,
  type ShapeTilePlacement,
  type WallVariantId,
  SHAPE_TILE_IDS,
  HEIGHT_CLASS_IDS,
  EDGE_TYPE_IDS,
  ROOM_TYPE_IDS,
  BLUEPRINT_SIZE_CLASS_IDS,
  FACE_NORMALS,
} from "./construction-grammar";

export const SHIP_PREFAB_SCHEMA = "sidereal.ship-prefab.v1" as const;
export const SHIP_THEME_IDS = ["federation", "riftjack", "aurelian", "industrial", "crystalline"] as const;
export type ShipThemeId = (typeof SHIP_THEME_IDS)[number];
export const EMBLEM_IDS = ["planet", "skull", "crystal", "gear", "none"] as const;
export type EmblemId = (typeof EMBLEM_IDS)[number];

export const SHIP_PREFAB_LIMITS = {
  bytes: 262144,
  volumes: 32,
  tilesPerVolume: 2048,
  tiles: 4096,
  rooms: 96,
  edges: 512,
  mounts: 64,
  skylights: 16,
  coordinate: 128,
} as const;

export interface PrefabVolume {
  id: string;
  kind: "hull" | "plate";
  height: HeightClassId;
  deck: number;
  tiles: ShapeTilePlacement[];
  /** Roof spine (charcoal corridor band with the emblem module). Hull volumes only. */
  spine?: boolean;
  /** Logo cassette on the longest faces. Default true for deck-class hull volumes. */
  logo?: boolean;
  /** "windows" packs viewport glazing in the upper tier (stations, observation decks). */
  faceStyle?: "default" | "windows";
}

export interface PrefabRoom {
  id: string;
  label: string;
  type: RoomTypeId;
  deck: number;
  /** Cell rectangle [x0, y0, x1, y1), whole cells. Clipped to the hull outline. */
  rect: [number, number, number, number];
}

export interface PrefabEdge {
  id: string;
  deck: number;
  /** Axis-aligned lattice segment. Doors span exactly two cells (2 m module). */
  a: [number, number];
  b: [number, number];
  type: EdgeTypeId;
}

export interface PrefabMount {
  id: string;
  /** Ship component catalog id (SHIPS-COMPONENTS). */
  component: string;
  /**
   * top: roof hardpoint; face: side/rear hull hardpoint; edge: exterior opening on a walkable
   * deck face (airlocks, cargo doors); interior: room floor module.
   */
  attach: "top" | "face" | "edge" | "interior";
  /**
   * top/interior: footprint min corner (0.5 m snap).
   * face/edge: footprint centre on the face line (0.5 m snap; edge: whole metres).
   */
  at: [number, number];
  /** face: outward normal of the hardpoint face. interior: the side the access/operator faces. */
  normal?: FaceNormal;
  /** Face mounts: bottom of the footprint in texels; default centres it on the face band. */
  z?: number;
}

export interface PrefabSkylight {
  id: string;
  at: [number, number];
  size: [number, number];
}

export interface PrefabMarkings {
  name: string;
  number: string;
  emblem: EmblemId;
}

export interface ShipPrefabDocumentV1 {
  schema: typeof SHIP_PREFAB_SCHEMA;
  id: string;
  name: string;
  revision: number;
  description: string;
  faction: string;
  role: string;
  theme: ShipThemeId;
  sizeClass: BlueprintSizeClassId;
  /** Launch rule: exactly one deck; the data model carries more. */
  decks: { index: number; name: string }[];
  volumes: PrefabVolume[];
  rooms: PrefabRoom[];
  edges: PrefabEdge[];
  mounts: PrefabMount[];
  skylights: PrefabSkylight[];
  markings: PrefabMarkings;
}

// ---------------------------------------------------------------- component catalog adapter
/**
 * The subset of the ship component catalog that prefab grammar needs. The catalog itself
 * (ids, stats, art) is owned by SHIPS-COMPONENTS (`ship-components.v1`); adapters map it here.
 */
export interface PrefabComponentSpec {
  id: string;
  label: string;
  /** Catalog family, e.g. propulsion, weapon, power, sensor, utility, interior. */
  category: string;
  sizeClass: MountSizeId;
  /** Hardpoint sockets this component accepts. "rear" is a face whose outward normal is aft. */
  attach: ("top" | "face" | "rear" | "edge" | "interior")[];
  /**
   * Hardpoint cells in the component frame [x (across / along the face), y (fore / outward)].
   * Top and interior: plan footprint. Face: width along the face is cells[0].
   */
  cells: [number, number];
  /** Height of the mounted part in texels (face mounts use it for vertical fit). */
  heightTexels: number;
  massKg: number;
  /** Main thrust (N) along the component's forward axis; rear-mounted engines push the ship fore. */
  thrustN?: number;
  powerGenerationW?: number;
  powerDrawW?: number;
  heatW?: number;
  heatRejectionW?: number;
  /** Crew station this component provides (pilot seats grant flight control). */
  station?: string | null;
  berths?: number;
  /** Visual asset reference resolved by the renderer. */
  visual?: { url: string; node?: string };
}

export interface PrefabComponentCatalog {
  revision: string;
  get(id: string): PrefabComponentSpec | undefined;
  list(): readonly PrefabComponentSpec[];
}

export function componentCatalogFrom(revision: string, specs: readonly PrefabComponentSpec[]): PrefabComponentCatalog {
  const map = new Map(specs.map((s) => [s.id, s]));
  return { revision, get: (id) => map.get(id), list: () => specs };
}

// ---------------------------------------------------------------- strict admission
const ID = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const LABEL = /^[A-Za-z0-9 ._/'&-]{1,32}$/;

function fail(path: string, why: string): never {
  throw Error(`Invalid ship prefab ${path}: ${why}`);
}
function obj(v: unknown, path: string, keys: string[], optional: string[] = []): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) fail(path, "expected an object");
  const o = v as Record<string, unknown>;
  for (const k of Object.keys(o)) if (!keys.includes(k) && !optional.includes(k)) fail(path, `unknown field ${k}`);
  for (const k of keys) if (!(k in o)) fail(path, `missing field ${k}`);
  return o;
}
function int(v: unknown, path: string, lo: number = -SHIP_PREFAB_LIMITS.coordinate, hi: number = SHIP_PREFAB_LIMITS.coordinate): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < lo || v > hi) fail(path, `expected an integer in [${lo}, ${hi}]`);
  return v;
}
function half(v: unknown, path: string): number {
  if (typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > SHIP_PREFAB_LIMITS.coordinate || !Number.isInteger(v * 2))
    fail(path, "expected a coordinate on the 0.5 m grid");
  return v;
}
function str(v: unknown, path: string, re: RegExp): string {
  if (typeof v !== "string" || !re.test(v)) fail(path, "invalid text");
  return v;
}
function oneOf<T extends string>(v: unknown, path: string, values: readonly T[]): T {
  if (typeof v !== "string" || !values.includes(v as T)) fail(path, `expected one of ${values.join(", ")}`);
  return v as T;
}
function arr(v: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(v) || v.length > max) fail(path, `expected an array of at most ${max}`);
  return v;
}
function uniq(ids: string[], path: string) {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) fail(path, `duplicate id ${id}`);
    seen.add(id);
  }
}

/** Parse untrusted JSON into a document. Never normalises; rejects unknown fields. */
export function readShipPrefab(value: unknown): ShipPrefabDocumentV1 {
  const o = obj(value, "document", [
    "schema", "id", "name", "revision", "description", "faction", "role", "theme", "sizeClass",
    "decks", "volumes", "rooms", "edges", "mounts", "skylights", "markings",
  ]);
  if (o.schema !== SHIP_PREFAB_SCHEMA) fail("schema", `expected ${SHIP_PREFAB_SCHEMA}`);
  const text = (v: unknown, p: string, max: number) => {
    if (typeof v !== "string" || v.length > max || /[\u0000-\u001f]/.test(v)) fail(p, "invalid text");
    return v;
  };
  let tileCount = 0;
  const doc: ShipPrefabDocumentV1 = {
    schema: SHIP_PREFAB_SCHEMA,
    id: str(o.id, "id", ID),
    name: str(o.name, "name", LABEL),
    revision: int(o.revision, "revision", 1, 1_000_000),
    description: text(o.description, "description", 400),
    faction: text(o.faction, "faction", 40),
    role: text(o.role, "role", 40),
    theme: oneOf(o.theme, "theme", SHIP_THEME_IDS),
    sizeClass: oneOf(o.sizeClass, "sizeClass", BLUEPRINT_SIZE_CLASS_IDS),
    decks: arr(o.decks, "decks", 8).map((d, i) => {
      const r = obj(d, `decks[${i}]`, ["index", "name"]);
      return { index: int(r.index, `decks[${i}].index`, 0, 7), name: str(r.name, `decks[${i}].name`, LABEL) };
    }),
    volumes: arr(o.volumes, "volumes", SHIP_PREFAB_LIMITS.volumes).map((v, i) => {
      const p = `volumes[${i}]`;
      const r = obj(v, p, ["id", "kind", "height", "deck", "tiles"], ["spine", "logo", "faceStyle"]);
      const tiles = arr(r.tiles, `${p}.tiles`, SHIP_PREFAB_LIMITS.tilesPerVolume).map((t, j) => {
        const q = obj(t, `${p}.tiles[${j}]`, ["x", "y", "shape", "rot", "reflected"]);
        if (typeof q.reflected !== "boolean") fail(`${p}.tiles[${j}].reflected`, "expected boolean");
        return {
          x: int(q.x, `${p}.tiles[${j}].x`),
          y: int(q.y, `${p}.tiles[${j}].y`),
          shape: oneOf(q.shape, `${p}.tiles[${j}].shape`, SHAPE_TILE_IDS),
          rot: int(q.rot, `${p}.tiles[${j}].rot`, 0, 3) as 0 | 1 | 2 | 3,
          reflected: q.reflected,
        };
      });
      tileCount += tiles.length;
      const out: PrefabVolume = {
        id: str(r.id, `${p}.id`, ID),
        kind: oneOf(r.kind, `${p}.kind`, ["hull", "plate"] as const),
        height: oneOf(r.height, `${p}.height`, HEIGHT_CLASS_IDS),
        deck: int(r.deck, `${p}.deck`, 0, 7),
        tiles,
      };
      if (r.spine !== undefined) {
        if (typeof r.spine !== "boolean") fail(`${p}.spine`, "expected boolean");
        out.spine = r.spine;
      }
      if (r.logo !== undefined) {
        if (typeof r.logo !== "boolean") fail(`${p}.logo`, "expected boolean");
        out.logo = r.logo;
      }
      if (r.faceStyle !== undefined) out.faceStyle = oneOf(r.faceStyle, `${p}.faceStyle`, ["default", "windows"] as const);
      return out;
    }),
    rooms: arr(o.rooms, "rooms", SHIP_PREFAB_LIMITS.rooms).map((v, i) => {
      const p = `rooms[${i}]`;
      const r = obj(v, p, ["id", "label", "type", "deck", "rect"]);
      const rect = arr(r.rect, `${p}.rect`, 4).map((n, k) => int(n, `${p}.rect[${k}]`));
      if (rect.length !== 4 || rect[2] <= rect[0] || rect[3] <= rect[1]) fail(`${p}.rect`, "expected [x0, y0, x1, y1] with x1 > x0, y1 > y0");
      return {
        id: str(r.id, `${p}.id`, ID),
        label: str(r.label, `${p}.label`, LABEL),
        type: oneOf(r.type, `${p}.type`, ROOM_TYPE_IDS),
        deck: int(r.deck, `${p}.deck`, 0, 7),
        rect: rect as [number, number, number, number],
      };
    }),
    edges: arr(o.edges, "edges", SHIP_PREFAB_LIMITS.edges).map((v, i) => {
      const p = `edges[${i}]`;
      const r = obj(v, p, ["id", "deck", "a", "b", "type"]);
      const pt = (x: unknown, q: string) => {
        const a = arr(x, q, 2);
        if (a.length !== 2) fail(q, "expected [x, y]");
        return [int(a[0], `${q}[0]`), int(a[1], `${q}[1]`)] as [number, number];
      };
      const a = pt(r.a, `${p}.a`);
      const b = pt(r.b, `${p}.b`);
      if ((a[0] !== b[0]) === (a[1] !== b[1])) fail(p, "edge must be axis-aligned with non-zero length");
      return { id: str(r.id, `${p}.id`, ID), deck: int(r.deck, `${p}.deck`, 0, 7), a, b, type: oneOf(r.type, `${p}.type`, EDGE_TYPE_IDS) };
    }),
    mounts: arr(o.mounts, "mounts", SHIP_PREFAB_LIMITS.mounts).map((v, i) => {
      const p = `mounts[${i}]`;
      const r = obj(v, p, ["id", "component", "attach", "at"], ["normal", "z"]);
      const at = arr(r.at, `${p}.at`, 2);
      if (at.length !== 2) fail(`${p}.at`, "expected [x, y]");
      const m: PrefabMount = {
        id: str(r.id, `${p}.id`, ID),
        component: str(r.component, `${p}.component`, /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/),
        attach: oneOf(r.attach, `${p}.attach`, ["top", "face", "edge", "interior"] as const),
        at: [half(at[0], `${p}.at[0]`), half(at[1], `${p}.at[1]`)],
      };
      if (r.normal !== undefined) m.normal = oneOf(r.normal, `${p}.normal`, FACE_NORMALS);
      if (r.z !== undefined) m.z = int(r.z, `${p}.z`, -64, 128);
      if ((m.attach === "face" || m.attach === "edge") && !m.normal) fail(p, `${m.attach} mounts need a normal`);
      if (m.attach === "edge" && m.z !== undefined) fail(p, "edge mounts take no z");
      if (m.attach === "top" && (m.normal !== undefined || m.z !== undefined)) fail(p, "top mounts take no normal or z");
      if (m.attach === "interior" && m.z !== undefined) fail(p, "interior mounts take no z");
      return m;
    }),
    skylights: arr(o.skylights, "skylights", SHIP_PREFAB_LIMITS.skylights).map((v, i) => {
      const p = `skylights[${i}]`;
      const r = obj(v, p, ["id", "at", "size"]);
      const at = arr(r.at, `${p}.at`, 2);
      const size = arr(r.size, `${p}.size`, 2);
      const s: [number, number] = [int(size[0], `${p}.size[0]`, 2, 3), int(size[1], `${p}.size[1]`, 2, 3)];
      return { id: str(r.id, `${p}.id`, ID), at: [int(at[0], `${p}.at[0]`), int(at[1], `${p}.at[1]`)], size: s };
    }),
    markings: (() => {
      const r = obj(o.markings, "markings", ["name", "number", "emblem"]);
      return {
        name: str(r.name, "markings.name", /^[A-Z0-9 ._/-]{0,16}$/),
        number: str(r.number, "markings.number", /^[A-Z0-9 ._/-]{0,10}$/),
        emblem: oneOf(r.emblem, "markings.emblem", EMBLEM_IDS),
      };
    })(),
  };
  if (tileCount > SHIP_PREFAB_LIMITS.tiles) fail("volumes", "too many tiles");
  uniq(doc.volumes.map((v) => v.id), "volumes");
  uniq(doc.rooms.map((v) => v.id), "rooms");
  uniq(doc.edges.map((v) => v.id), "edges");
  uniq(doc.mounts.map((v) => v.id), "mounts");
  uniq(doc.skylights.map((v) => v.id), "skylights");
  return doc;
}

export function parseShipPrefabJson(json: string): ShipPrefabDocumentV1 {
  if (json.length > SHIP_PREFAB_LIMITS.bytes) throw Error("Ship prefab exceeds the size limit");
  return readShipPrefab(JSON.parse(json));
}

/** Canonical JSON (stable key order) for hashing and publication. */
export function canonicalShipPrefabJson(doc: ShipPrefabDocumentV1): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v as object)
              .sort()
              .map((k) => [k, sort((v as Record<string, unknown>)[k])]),
          )
        : v;
  return JSON.stringify(sort(readShipPrefab(doc)));
}

// ---------------------------------------------------------------- derived geometry
export interface VolumeGeometry {
  volume: PrefabVolume;
  outline: Outline | null;
  /** Number of disconnected outer loops (valid volumes have exactly 1). */
  islands: number;
  z: [number, number];
  area: number;
  bounds: [number, number, number, number];
}

export function volumeGeometry(volume: PrefabVolume): VolumeGeometry {
  const u = unionTiles(volume.tiles);
  const outline = u.outers.length ? { outer: u.outers[0], holes: u.holes } : null;
  const xs: number[] = [];
  const ys: number[] = [];
  for (const t of volume.tiles) {
    const [w, h] = placedTileSize(t);
    xs.push(t.x, t.x + w);
    ys.push(t.y, t.y + h);
  }
  return {
    volume,
    outline,
    islands: u.outers.length,
    z: [...G.heightClasses[volume.height].z] as [number, number],
    area: u.outers.reduce((s, o) => s + outlineArea({ outer: o, holes: [] }), 0) - (outline ? outline.holes.reduce((s, h) => s + outlineArea({ outer: h, holes: [] }), 0) : 0),
    bounds: xs.length ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] : [0, 0, 0, 0],
  };
}

export function prefabBounds(geoms: readonly VolumeGeometry[]): [number, number, number, number] {
  const b = geoms.filter((g) => g.volume.tiles.length).map((g) => g.bounds);
  if (!b.length) return [0, 0, 0, 0];
  return [Math.min(...b.map((v) => v[0])), Math.min(...b.map((v) => v[1])), Math.max(...b.map((v) => v[2])), Math.max(...b.map((v) => v[3]))];
}

/** Ship origin used by rendering and authority: centre of the structure bounding box. */
export function prefabOrigin(doc: ShipPrefabDocumentV1): [number, number] {
  const [x0, y0, x1, y1] = prefabBounds(doc.volumes.map(volumeGeometry));
  return [(x0 + x1) / 2, (y0 + y1) / 2];
}

export interface MountPlacement {
  mount: PrefabMount;
  spec: PrefabComponentSpec | undefined;
  /** Plan footprint rectangle [x0, y0, x1, y1] (m). Face mounts: the strip just outside the face. */
  rect: [number, number, number, number];
  /** Bottom and top in texels. */
  z: [number, number];
  /**
   * Component-frame quarter turns (counter-clockwise, as in ship-components.v1): the component's
   * +Y (forward / access side) points fore at 0, port at 1, aft at 2, starboard at 3.
   * Face mounts extend outward along the component's -Y, so an aft (rear) face is 0.
   */
  quarterTurns: 0 | 1 | 2 | 3;
  /** Component origin in the prefab plan (m): face = hardpoint centre on the face line, top = footprint
   * centre on the roof, interior = footprint centre on the floor. */
  anchor: [number, number];
  /** Component origin height (texels): face = hardpoint centre, top = roof plane, interior = floor top. */
  anchorZ: number;
  /** Host volume (top, face) or room (interior). */
  host: string | null;
  /** Face mounts are "rear" when the normal is aft. */
  rear: boolean;
}

const FORWARD_QT: Record<FaceNormal, 0 | 1 | 2 | 3> = { fore: 0, port: 1, aft: 2, starboard: 3 };
const OUTWARD_QT: Record<FaceNormal, 0 | 1 | 2 | 3> = { aft: 0, starboard: 1, fore: 2, port: 3 };

/** Plan extents (X, Y) of a footprint whose component frame is turned by qt. */
function planExtent(cells: [number, number], qt: number): [number, number] {
  return qt % 2 ? [cells[0], cells[1]] : [cells[1], cells[0]];
}

export function placeMount(mount: PrefabMount, spec: PrefabComponentSpec | undefined, geoms: readonly VolumeGeometry[]): MountPlacement {
  const fallback = spec ? G.mountSizes[spec.sizeClass].cells : 1;
  const cells: [number, number] = spec ? [Math.max(spec.cells[0], 1), Math.max(spec.cells[1], 1)] : [fallback, fallback];
  const heightT = spec?.heightTexels ?? cells[0] * 16;
  if (mount.attach === "top" || mount.attach === "interior") {
    const qt = mount.attach === "top" ? 0 : FORWARD_QT[mount.normal ?? "fore"];
    const [ex, ey] = planExtent(cells, qt);
    const [x, y] = mount.at;
    const rect: [number, number, number, number] = [x, y, x + ex, y + ey];
    const anchor: [number, number] = [x + ex / 2, y + ey / 2];
    if (mount.attach === "interior")
      return { mount, spec, rect, z: [G.deck.floorTopTexels, G.deck.floorTopTexels + heightT], quarterTurns: qt, anchor, anchorZ: G.deck.floorTopTexels, host: null, rear: false };
    let host: VolumeGeometry | null = null;
    for (const g of geoms) if (g.outline && insideOutline(g.outline, anchor[0], anchor[1]) && (!host || g.z[1] > host.z[1])) host = g;
    const z0 = host ? host.z[1] : G.deck.roofTexels;
    return { mount, spec, rect, z: [z0, z0 + heightT], quarterTurns: 0, anchor, anchorZ: z0, host: host?.volume.id ?? null, rear: false };
  }
  const normal = mount.normal ?? "aft";
  const [nx, ny] = NORMAL_VECTOR[normal];
  const width = cells[0];
  const depth = cells[1];
  const along = normal === "fore" || normal === "aft" ? 1 : 0;
  const across = 1 - along;
  const lo: [number, number] = [0, 0];
  const hi: [number, number] = [0, 0];
  lo[along] = mount.at[along] - width / 2;
  hi[along] = mount.at[along] + width / 2;
  const out = along === 1 ? nx : ny;
  lo[across] = Math.min(mount.at[across], mount.at[across] + out * depth);
  hi[across] = Math.max(mount.at[across], mount.at[across] + out * depth);
  const rect: [number, number, number, number] = [lo[0], lo[1], hi[0], hi[1]];
  let host: VolumeGeometry | null = null;
  for (const g of geoms) {
    if (!g.outline) continue;
    for (const f of axisFaces(g.outline.outer)) {
      if (f.normal !== normal) continue;
      if (Math.abs(f.a[across] - mount.at[across]) > 1e-6) continue;
      const flo = Math.min(f.a[along], f.b[along]);
      const fhi = Math.max(f.a[along], f.b[along]);
      if (mount.at[along] - width / 2 >= flo - 1e-6 && mount.at[along] + width / 2 <= fhi + 1e-6) host = g;
    }
    if (host) break;
  }
  const band = host?.z ?? G.heightClasses.deck.z;
  const z0 =
    mount.attach === "edge" ? G.deck.floorTopTexels : (mount.z ?? band[0] + Math.floor((band[1] - band[0] - heightT) / 2));
  return {
    mount, spec, rect, z: [z0, z0 + heightT], quarterTurns: OUTWARD_QT[normal], anchor: [mount.at[0], mount.at[1]],
    anchorZ: z0 + heightT / 2, host: host?.volume.id ?? null, rear: normal === "aft",
  };
}

// ---------------------------------------------------------------- interior derivation
export interface DerivedFloor {
  cell: [number, number];
  kind: FloorKindId;
  room: string;
  /** Partial cells (sloped or curved hull) get a generated slab clipped to the outline. */
  partial: boolean;
}
export interface DerivedEdge {
  a: Pt;
  b: Pt;
  /** Edge type used for pressure/traversal. Exterior walls are always wall.full. */
  type: EdgeTypeId;
  /** Kit wall variant for opaque walls. */
  variant: WallVariantId;
  rooms: [string | null, string | null];
  exterior: boolean;
}
export interface DerivedDoor {
  id: string;
  a: Pt;
  b: Pt;
  type: EdgeTypeId;
  rooms: [string | null, string | null];
  exterior: boolean;
}
export interface DerivedSocket {
  designId: string;
  room: string;
  /** Min corner (m) of the footprint in the ship plan. */
  at: [number, number];
  /** Plan footprint (m) after rotation. */
  size: [number, number];
  heightTexels: number;
  /** Direction the object's front faces. */
  facing: FaceNormal;
  control: boolean;
}
export interface DerivedCompartment {
  id: string;
  rooms: string[];
}
export interface DerivedInterior {
  deck: number;
  volume: string | null;
  floors: DerivedFloor[];
  /** Exterior boundary walls, 250 mm inward. Non-axis runs are generated stepped walls. */
  exteriorWalls: DerivedEdge[];
  exteriorSlopes: { a: Pt; b: Pt; room: string | null }[];
  partitions: DerivedEdge[];
  doors: DerivedDoor[];
  posts: Pt[];
  sockets: DerivedSocket[];
  lights: { room: string; at: [number, number]; colour: [number, number, number]; area: number }[];
  labels: { room: string; text: string; at: [number, number] }[];
  compartments: DerivedCompartment[];
  /** Pilot station (control seat centre, metres) when a control room exists. */
  station: { at: [number, number]; room: string } | null;
}

const ekey = (a: Pt, b: Pt) => {
  const [p, q] = a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]) ? [a, b] : [b, a];
  return `${p[0]},${p[1]}|${q[0]},${q[1]}`;
};

function unitSegments(a: Pt, b: Pt): [Pt, Pt][] {
  const out: [Pt, Pt][] = [];
  const L = Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]));
  const d: Pt = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  for (let u = 0; u < L; u++) out.push([[a[0] + d[0] * u, a[1] + d[1] * u], [a[0] + d[0] * (u + 1), a[1] + d[1] * (u + 1)]]);
  return out;
}

/** Rooms and the cells they own on the deck volume (rect clipped to the outline). */
export function roomCells(room: PrefabRoom, outline: Outline): [number, number][] {
  const out: [number, number][] = [];
  const [x0, y0, x1, y1] = room.rect;
  for (let x = x0; x < x1; x++)
    for (let y = y0; y < y1; y++) {
      const pts: Pt[] = [[x + 0.5, y + 0.5], [x + 0.1, y + 0.1], [x + 0.9, y + 0.1], [x + 0.1, y + 0.9], [x + 0.9, y + 0.9]];
      if (pts.some(([px, py]) => insideOutline(outline, px, py))) out.push([x, y]);
    }
  return out;
}

export function deckVolume(doc: ShipPrefabDocumentV1, deck = 0): VolumeGeometry | null {
  const g = doc.volumes.filter((v) => v.kind === "hull" && v.deck === deck && G.heightClasses[v.height].walkable).map(volumeGeometry);
  return g.find((x) => x.outline) ?? null;
}

export function deriveInterior(doc: ShipPrefabDocumentV1, deck = 0, catalog?: PrefabComponentCatalog): DerivedInterior {
  const empty: DerivedInterior = {
    deck, volume: null, floors: [], exteriorWalls: [], exteriorSlopes: [], partitions: [], doors: [], posts: [],
    sockets: [], lights: [], labels: [], compartments: [], station: null,
  };
  const vg = deckVolume(doc, deck);
  if (!vg || !vg.outline) return empty;
  const outline = vg.outline;
  const rooms = doc.rooms.filter((r) => r.deck === deck);
  const cellRoom = new Map<string, PrefabRoom>();
  const full = new Set(fullCells(outline).map(([x, y]) => `${x},${y}`));
  const floors: DerivedFloor[] = [];
  for (const room of rooms)
    for (const [x, y] of roomCells(room, outline)) {
      const k = `${x},${y}`;
      if (cellRoom.has(k)) continue;
      cellRoom.set(k, room);
      floors.push({ cell: [x, y], kind: G.roomTypes[room.type].floor, room: room.id, partial: !full.has(k) });
    }
  const roomAt = (x: number, y: number) => cellRoom.get(`${Math.floor(x)},${Math.floor(y)}`) ?? null;

  // Exterior walls along the outline (outer + holes), inward.
  const exteriorWalls: DerivedEdge[] = [];
  const exteriorSlopes: DerivedInterior["exteriorSlopes"] = [];
  const exteriorKeys = new Set<string>();
  for (const loop of [outline.outer, ...outline.holes]) {
    for (let i = 0; i < loop.length; i++) {
      const p = loop[i];
      const q = loop[(i + 1) % loop.length];
      const axis = Math.abs(p[0] - q[0]) < 1e-9 || Math.abs(p[1] - q[1]) < 1e-9;
      const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const left: Pt = [-(q[1] - p[1]) / L, (q[0] - p[0]) / L];
      if (!axis || Math.abs(p[0] - Math.round(p[0])) > 1e-9 || Math.abs(p[1] - Math.round(p[1])) > 1e-9) {
        const mid: Pt = [(p[0] + q[0]) / 2 + left[0] * 0.3, (p[1] + q[1]) / 2 + left[1] * 0.3];
        exteriorSlopes.push({ a: p, b: q, room: roomAt(mid[0], mid[1])?.id ?? null });
        continue;
      }
      for (const [a, b] of unitSegments(p, q)) {
        const mid: Pt = [(a[0] + b[0]) / 2 + left[0] * 0.5, (a[1] + b[1]) / 2 + left[1] * 0.5];
        const room = roomAt(mid[0], mid[1]);
        const styles = room ? G.roomTypes[room.type].walls : (["wall"] as WallVariantId[]);
        const variant = hash01("ext2", a[0], a[1]) < 0.7 ? styles[Math.floor(hash01("ext", a[0], a[1]) * styles.length)] : "wall";
        exteriorKeys.add(ekey(a, b));
        exteriorWalls.push({ a, b, type: "wall.full", variant, rooms: [room?.id ?? null, null], exterior: true });
      }
    }
  }

  // Edge features on this deck, split into unit segments.
  const features = doc.edges.filter((e) => e.deck === deck);
  const doorFeatures = features.filter((e) => G.edgeTypes[e.type].door);
  const overrideFeatures = features.filter((e) => !G.edgeTypes[e.type].door);
  const doorKeys = new Map<string, PrefabEdge>();
  for (const e of doorFeatures) for (const [a, b] of unitSegments(e.a, e.b)) doorKeys.set(ekey(a, b), e);
  const overrideKeys = new Map<string, PrefabEdge>();
  for (const e of overrideFeatures) for (const [a, b] of unitSegments(e.a, e.b)) overrideKeys.set(ekey(a, b), e);

  // Partitions: unit edges between two different room cells (or a room and a void cell) inside the hull.
  const partitions: DerivedEdge[] = [];
  const vertexDirs = new Map<string, string[]>();
  const addDir = (v: Pt, d: string) => {
    const k = `${v[0]},${v[1]}`;
    if (!vertexDirs.has(k)) vertexDirs.set(k, []);
    vertexDirs.get(k)!.push(d);
  };
  const seen = new Set<string>();
  const cells = [...cellRoom.keys()].map((k) => k.split(",").map(Number) as [number, number]).sort((m, n) => m[0] - n[0] || m[1] - n[1]);
  for (const [cx, cy] of cells) {
    const here = cellRoom.get(`${cx},${cy}`)!;
    const sides: [Pt, Pt, number, number][] = [
      [[cx, cy], [cx + 1, cy], cx, cy - 1],
      [[cx, cy + 1], [cx + 1, cy + 1], cx, cy + 1],
      [[cx, cy], [cx, cy + 1], cx - 1, cy],
      [[cx + 1, cy], [cx + 1, cy + 1], cx + 1, cy],
    ];
    for (const [a, b, ox, oy] of sides) {
      const k = ekey(a, b);
      if (seen.has(k) || exteriorKeys.has(k)) continue;
      seen.add(k);
      const other = cellRoom.get(`${ox},${oy}`) ?? null;
      if (other === here) continue;
      const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const normal: Pt = a[1] === b[1] ? [0, 0.01] : [0.01, 0];
      if (!insideOutline(outline, mid[0] + normal[0], mid[1] + normal[1]) || !insideOutline(outline, mid[0] - normal[0], mid[1] - normal[1])) continue;
      if (doorKeys.has(k)) {
        addDir(a, "door");
        addDir(b, "door");
        continue;
      }
      const ov = overrideKeys.get(k);
      const types = [here.type, other?.type].filter(Boolean) as RoomTypeId[];
      const host = types.filter((t) => t !== "corridor")[0] ?? types[0];
      const styles = G.roomTypes[host].walls;
      let variant = styles[Math.floor(hash01("part", a[0], a[1]) * styles.length)];
      if (types.includes("corridor") && hash01("cl", a[0], a[1]) < 0.35) variant = "light";
      const type: EdgeTypeId = ov ? ov.type : "wall.full";
      if (type === "open") continue;
      partitions.push({ a, b, type, variant, rooms: [here.id, other?.id ?? null], exterior: false });
      addDir(a, a[1] === b[1] ? "h" : "v");
      addDir(b, a[1] === b[1] ? "h" : "v");
    }
  }

  const doors: DerivedDoor[] = doorFeatures.map((e) => {
    const [a, b] = [e.a as Pt, e.b as Pt];
    const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const n: Pt = a[1] === b[1] ? [0, 0.5] : [0.5, 0];
    const r1 = roomAt(mid[0] + n[0] - (a[1] === b[1] ? 0.5 : 0), mid[1] + n[1] - (a[1] === b[1] ? 0 : 0.5));
    const r2 = roomAt(mid[0] - n[0] - (a[1] === b[1] ? 0.5 : 0), mid[1] - n[1] - (a[1] === b[1] ? 0 : 0.5));
    const exterior = unitSegments(a, b).every(([p, q]) => exteriorKeys.has(ekey(p, q)));
    return { id: e.id, a, b, type: e.type, rooms: [r1?.id ?? null, r2?.id ?? null], exterior };
  });
  // Edge mounts (exterior airlocks, cargo doors) open the exterior wall they sit on.
  for (const m of doc.mounts) {
    if (m.attach !== "edge" || !m.normal) continue;
    const spec = catalog?.get(m.component);
    const width = spec ? Math.max(1, spec.cells[0]) : 2;
    const along = m.normal === "fore" || m.normal === "aft" ? 1 : 0;
    const a: Pt = along === 1 ? [m.at[0], m.at[1] - width / 2] : [m.at[0] - width / 2, m.at[1]];
    const b: Pt = along === 1 ? [m.at[0], m.at[1] + width / 2] : [m.at[0] + width / 2, m.at[1]];
    const [nx, ny] = NORMAL_VECTOR[m.normal];
    const inside = roomAt((a[0] + b[0]) / 2 - nx * 0.5, (a[1] + b[1]) / 2 - ny * 0.5);
    const cargo = (spec?.category ?? "").includes("cargo") || m.component.startsWith("cargo-door");
    doors.push({ id: m.id, a, b, type: cargo ? "door.blast" : "door.airlock", rooms: [inside?.id ?? null, null], exterior: true });
  }
  // Doors on the exterior replace the wall segments they occupy.
  const exteriorDoorKeys = new Set(doors.filter((d) => d.exterior).flatMap((d) => unitSegments(d.a, d.b).map(([p, q]) => ekey(p, q))));
  const exteriorFinal = exteriorWalls.filter((w) => !exteriorDoorKeys.has(ekey(w.a, w.b)));

  const posts: Pt[] = [];
  for (const [k, dirs] of [...vertexDirs.entries()].sort()) {
    const walls = dirs.filter((d) => d !== "door");
    if (!walls.length) continue;
    if (dirs.length === 2 && new Set(dirs).size === 1) continue;
    posts.push(k.split(",").map(Number) as unknown as Pt);
  }

  // Sockets, lights and labels per room.
  const sockets: DerivedSocket[] = [];
  const lights: DerivedInterior["lights"] = [];
  const labels: DerivedInterior["labels"] = [];
  let station: DerivedInterior["station"] = null;
  const [ox0, , ox1] = vg.bounds;
  for (const room of rooms) {
    const own = floors.filter((f) => f.room === room.id && !f.partial).map((f) => f.cell);
    if (!own.length) continue;
    const x0 = Math.min(...own.map((c) => c[0]));
    const y0 = Math.min(...own.map((c) => c[1]));
    const x1 = Math.max(...own.map((c) => c[0])) + 1;
    const y1 = Math.max(...own.map((c) => c[1])) + 1;
    const spec = G.roomTypes[room.type];
    const area = floors.filter((f) => f.room === room.id).length;
    lights.push({ room: room.id, at: [(x0 + x1) / 2, (y0 + y1) / 2], colour: spec.light, area });
    labels.push({ room: room.id, text: room.label, at: [(x0 + x1) / 2, (y0 + y1) / 2] });
    if (spec.control) {
      // Control rooms: the pilot seat faces fore on the room's centre line near the bow end;
      // consoles sit ahead of it and banks behind it.
      const cy = (y0 + y1) / 2;
      const bowward = x1 > (ox0 + ox1) / 2;
      const seatX = bowward ? x1 - 1.6 : x0 + 1.0;
      for (const [designId, w, d, h] of spec.sockets) {
        const sw = w * TEXEL;
        const sd = d * TEXEL;
        let at: [number, number];
        if (designId.endsWith("pilot-seat")) at = [seatX - sd / 2, cy - sw / 2];
        else if (designId.endsWith("command-console")) at = [Math.min(seatX + 0.55, x1 - 0.3 - sd), cy - sw / 2];
        else at = [Math.max(x0 + 0.3, seatX - 1.4 - sd), cy - sw / 2];
        if (at[0] < x0 + 0.2 || at[0] + sd > x1 - 0.2 || sw > y1 - y0 - 0.4) continue;
        const control = designId.endsWith("pilot-seat");
        sockets.push({ designId, room: room.id, at, size: [sd, sw], heightTexels: h, facing: "fore", control });
        if (control) station = { at: [at[0] + sd / 2, at[1] + sw / 2], room: room.id };
      }
      continue;
    }
    // Other rooms: along the longest side without a door, facing into the room.
    const doorSides = new Set<string>();
    for (const d of doors) {
      if (!d.rooms.includes(room.id)) continue;
      if (d.a[1] === d.b[1]) doorSides.add(Math.abs(d.a[1] - y0) < Math.abs(d.a[1] - y1) ? "south" : "north");
      else doorSides.add(Math.abs(d.a[0] - x0) < Math.abs(d.a[0] - x1) ? "west" : "east");
    }
    const sidesAll = [
      { side: "north", len: x1 - x0, facing: "starboard" as FaceNormal },
      { side: "south", len: x1 - x0, facing: "port" as FaceNormal },
      { side: "west", len: y1 - y0, facing: "fore" as FaceNormal },
      { side: "east", len: y1 - y0, facing: "aft" as FaceNormal },
    ];
    const free = sidesAll.filter((s) => !doorSides.has(s.side));
    const pick = (free.length ? free : sidesAll).sort((m, n) => n.len - m.len)[0];
    const centred = room.type === "engineering";
    let u = 0.35;
    for (const [designId, w, d, h] of spec.sockets) {
      const sw = w * TEXEL;
      const sd = d * TEXEL;
      if (u + sw > pick.len - 0.3) break;
      let at: [number, number];
      let size: [number, number];
      if (centred) {
        size = [sw, sd];
        at = [(x0 + x1) / 2 - sw / 2, (y0 + y1) / 2 - sd / 2];
      } else if (pick.side === "north") {
        size = [sw, sd];
        at = [x0 + u, y1 - 0.3 - sd];
      } else if (pick.side === "south") {
        size = [sw, sd];
        at = [x0 + u, y0 + 0.3];
      } else if (pick.side === "west") {
        size = [sd, sw];
        at = [x0 + 0.3, y0 + u];
      } else {
        size = [sd, sw];
        at = [x1 - 0.3 - sd, y0 + u];
      }
      sockets.push({ designId, room: room.id, at, size, heightTexels: h, facing: pick.facing, control: false });
      u += sw + 0.3;
      if (centred) break;
    }
  }

  // Pressure compartments: rooms joined by non-sealing edges (half walls, open edges).
  const parent = new Map(rooms.map((r) => [r.id, r.id]));
  const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!));
  for (const e of features)
    if (!G.edgeTypes[e.type].seals)
      for (const [a, b] of unitSegments(e.a, e.b)) {
        const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const n: Pt = a[1] === b[1] ? [0, 0.5] : [0.5, 0];
        const r1 = roomAt(mid[0] + n[0], mid[1] + n[1]);
        const r2 = roomAt(mid[0] - n[0], mid[1] - n[1]);
        if (r1 && r2 && r1 !== r2) parent.set(find(r1.id), find(r2.id));
      }
  const groups = new Map<string, string[]>();
  for (const r of rooms) {
    const k = find(r.id);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r.id);
  }
  const compartments = [...groups.values()].map((rs, i) => ({ id: `compartment-${i + 1}`, rooms: rs }));

  // A pilot console component (station "pilot") overrides the derived seat socket.
  if (catalog)
    for (const m of doc.mounts) {
      if (m.attach !== "interior") continue;
      const spec = catalog.get(m.component);
      if (spec?.station !== "pilot") continue;
      const mp = placeMount(m, spec, []);
      const room = roomAt(mp.anchor[0], mp.anchor[1]);
      if (room) {
        station = { at: mp.anchor, room: room.id };
        break;
      }
    }

  return {
    deck, volume: vg.volume.id, floors, exteriorWalls: exteriorFinal, exteriorSlopes, partitions, doors, posts,
    sockets, lights, labels, compartments, station,
  };
}

// ---------------------------------------------------------------- validation
export type PrefabIssueRef =
  | { kind: "document" }
  | { kind: "volume"; id: string; tile?: number }
  | { kind: "room"; id: string }
  | { kind: "edge"; id: string }
  | { kind: "mount"; id: string }
  | { kind: "skylight"; id: string };

export interface PrefabIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  ref: PrefabIssueRef;
}

const rectsOverlap = (a: readonly number[], b: readonly number[]) => a[0] < b[2] - 1e-9 && b[0] < a[2] - 1e-9 && a[1] < b[3] - 1e-9 && b[1] < a[3] - 1e-9;

/** Validate one mount against the ship (used for live green/red placement feedback). */
export function validateMount(
  doc: ShipPrefabDocumentV1,
  mount: PrefabMount,
  catalog: PrefabComponentCatalog,
  geoms: readonly VolumeGeometry[] = doc.volumes.map(volumeGeometry),
  others: readonly PrefabMount[] = doc.mounts.filter((m) => m.id !== mount.id),
): PrefabIssue[] {
  const issues: PrefabIssue[] = [];
  const ref = { kind: "mount" as const, id: mount.id };
  const err = (code: string, message: string) => issues.push({ severity: "error", code, message, ref });
  const spec = catalog.get(mount.component);
  if (!spec) {
    err("mount.unknown-component", `Unknown component ${mount.component}`);
    return issues;
  }
  const size = G.blueprintSizeClasses[doc.sizeClass];
  if (mountSizeRank(spec.sizeClass) > mountSizeRank(size.maxMount))
    err("mount.size-class", `${spec.label} is ${spec.sizeClass}; a size-${doc.sizeClass} blueprint allows up to ${size.maxMount}`);
  const place = placeMount(mount, spec, geoms);
  if (mount.attach === "interior") {
    if (!spec.attach.includes("interior")) err("mount.attach", `${spec.label} is not an interior module`);
    const deck = deckVolume(doc, 0);
    if (!deck?.outline) err("mount.no-deck", "Interior modules need a walkable deck");
    else {
      const cellRoom = new Map<string, string>();
      for (const room of doc.rooms)
        for (const [x, y] of roomCells(room, deck.outline)) if (!cellRoom.has(`${x},${y}`)) cellRoom.set(`${x},${y}`, room.id);
      const full = new Set(fullCells(deck.outline).map(([x, y]) => `${x},${y}`));
      const [x0, y0, x1, y1] = place.rect;
      const rooms = new Set<string>();
      let outside = false;
      for (let x = x0 + 0.125; x < x1; x += 0.25)
        for (let y = y0 + 0.125; y < y1; y += 0.25) {
          const k = `${Math.floor(x)},${Math.floor(y)}`;
          const r = cellRoom.get(k);
          if (!r || !full.has(k)) outside = true;
          else rooms.add(r);
        }
      if (outside) err("mount.off-floor", `${spec.label} must sit on whole floor cells inside a room`);
      else if (rooms.size > 1) err("mount.two-rooms", `${spec.label} straddles a room boundary`);
    }
  } else if (mount.attach === "edge") {
    if (!spec.attach.includes("edge")) err("mount.attach", `${spec.label} is not an exterior opening (edge) component`);
    const deck = deckVolume(doc, 0);
    const along = mount.normal === "fore" || mount.normal === "aft" ? 1 : 0;
    if (!Number.isInteger(mount.at[1 - along]) || !Number.isInteger(mount.at[along] - spec.cells[0] / 2))
      err("mount.edge-grid", `${spec.label} must span whole wall cells`);
    if (!deck?.outline || place.host !== deck.volume.id) err("mount.edge-face", `${spec.label} must sit on a straight face of the walkable deck hull`);
    else {
      const interior = deriveInterior(doc, 0, catalog);
      const door = interior.doors.find((d) => d.id === mount.id);
      if (!door?.rooms[0]) err("mount.edge-room", `${spec.label} must open into a room`);
    }
  } else if (mount.attach === "top") {
    if (!spec.attach.includes("top")) err("mount.attach", `${spec.label} cannot mount on a top hardpoint`);
    const [x0, y0, x1, y1] = place.rect;
    let hostZ: number | null = null;
    for (let x = x0 + 0.125; x < x1; x += 0.25)
      for (let y = y0 + 0.125; y < y1; y += 0.25) {
        let z: number | null = null;
        for (const g of geoms) if (g.outline && insideOutline(g.outline, x, y)) z = Math.max(z ?? -1, g.z[1]);
        if (z === null) {
          err("mount.off-hull", `${spec.label} footprint leaves the hull roof`);
          return issues;
        }
        if (hostZ !== null && z !== hostZ) {
          err("mount.uneven", `${spec.label} footprint spans two roof heights`);
          return issues;
        }
        hostZ = z;
      }
    for (const s of doc.skylights)
      if (rectsOverlap(place.rect, [s.at[0], s.at[1], s.at[0] + s.size[0], s.at[1] + s.size[1]]))
        err("mount.skylight", `${spec.label} overlaps skylight ${s.id}`);
  } else {
    const rear = mount.normal === "aft";
    if (!spec.attach.includes("face") && !(rear && spec.attach.includes("rear")))
      err("mount.attach", `${spec.label} cannot mount on ${rear ? "a rear" : "a side"} face`);
    if (!place.host) err("mount.off-face", `${spec.label} must sit fully on one straight hull face`);
    else {
      const g = geoms.find((v) => v.volume.id === place.host)!;
      const overhang = place.z[0] < g.z[0] || place.z[1] > g.z[1];
      if (overhang && !(rear && spec.sizeClass === "XL"))
        err("mount.face-height", `${spec.label} is taller than the ${g.volume.height} face (only XL rear mounts may overhang)`);
      // The face must be exposed: nothing else occupies the strip just outside it.
      const [nx, ny] = NORMAL_VECTOR[mount.normal!];
      const mid: Pt = [mount.at[0] + nx * 0.3, mount.at[1] + ny * 0.3];
      for (const o of geoms)
        if (o !== g && o.outline && insideOutline(o.outline, mid[0], mid[1]) && o.z[0] < place.z[1] && place.z[0] < o.z[1])
          err("mount.face-covered", `${spec.label} face is covered by volume ${o.volume.id}`);
    }
  }
  for (const o of others) {
    const ospec = catalog.get(o.component);
    const op = placeMount(o, ospec, geoms);
    const lineKind = (a: string) => (a === "edge" ? "face" : a);
    if (lineKind(o.attach) !== lineKind(mount.attach)) continue;
    const onFace = mount.attach === "face" || mount.attach === "edge";
    if (onFace && o.normal !== mount.normal) continue;
    if (onFace && Math.abs(o.at[o.normal === "fore" || o.normal === "aft" ? 0 : 1] - mount.at[mount.normal === "fore" || mount.normal === "aft" ? 0 : 1]) > 1e-6) continue;
    const zOverlap = place.z[0] < op.z[1] && op.z[0] < place.z[1];
    if (rectsOverlap(place.rect, op.rect) && (!onFace || zOverlap)) err("mount.overlap", `Overlaps mount ${o.id}`);
  }
  return issues;
}

export function validateShipPrefab(doc: ShipPrefabDocumentV1, catalog: PrefabComponentCatalog): PrefabIssue[] {
  const issues: PrefabIssue[] = [];
  const push = (severity: "error" | "warning", code: string, message: string, ref: PrefabIssueRef) => issues.push({ severity, code, message, ref });
  const size = G.blueprintSizeClasses[doc.sizeClass];
  const docRef = { kind: "document" as const };
  if (doc.decks.length !== 1 || doc.decks[0].index !== 0) push("error", "decks.launch", "Launch ships have exactly one deck (index 0)", docRef);
  const geoms = doc.volumes.map(volumeGeometry);
  if (!doc.volumes.some((v) => v.kind === "hull")) push("error", "volumes.none", "A ship needs at least one hull volume", docRef);
  for (const g of geoms) {
    const v = g.volume;
    const ref = { kind: "volume" as const, id: v.id };
    if (!v.tiles.length) push("error", "volume.empty", `Volume ${v.id} has no tiles`, ref);
    if (!G.heightClasses[v.height].kinds.includes(v.kind)) push("error", "volume.height", `${v.height} is not a ${v.kind} height class`, ref);
    if (v.deck !== 0) push("error", "volume.deck", "Launch ships use deck 0 only", ref);
    if (g.islands > 1) push("error", "volume.islands", `Volume ${v.id} is ${g.islands} separate pieces; split it into volumes`, ref);
    for (const [i, j] of tileOverlaps(v.tiles)) push("error", "volume.overlap", `Tiles ${i} and ${j} overlap`, { kind: "volume", id: v.id, tile: j });
  }
  const [bx0, by0, bx1, by1] = prefabBounds(geoms);
  if (bx1 - bx0 > size.maxCells[0] || by1 - by0 > size.maxCells[1])
    push("error", "size.extent", `Structure is ${bx1 - bx0} x ${by1 - by0} m; size ${doc.sizeClass} allows ${size.maxCells[0]} x ${size.maxCells[1]} m`, docRef);
  const hardpoints = doc.mounts.filter((m) => m.attach !== "interior").length;
  if (hardpoints > size.maxMounts) push("error", "size.mounts", `Size ${doc.sizeClass} allows ${size.maxMounts} hardpoint mounts (has ${hardpoints})`, docRef);

  // Rooms.
  const deck = deckVolume(doc, 0);
  const claimed = new Map<string, string>();
  for (const room of doc.rooms) {
    const ref = { kind: "room" as const, id: room.id };
    if (!deck?.outline) {
      push("error", "room.no-deck", "Rooms need a walkable deck-class hull volume", ref);
      continue;
    }
    const cells = roomCells(room, deck.outline);
    if (!cells.length) push("error", "room.outside", `${room.label} is outside the deck hull`, ref);
    for (const [x, y] of cells) {
      const k = `${x},${y}`;
      if (claimed.has(k)) {
        push("error", "room.overlap", `${room.label} overlaps room ${claimed.get(k)}`, ref);
        break;
      }
      claimed.set(k, room.id);
    }
    const [x0, y0, x1, y1] = room.rect;
    if (room.type === "corridor" && Math.min(x1 - x0, y1 - y0) < G.deck.minCorridorCells)
      push("error", "room.corridor-width", `Corridors must be at least ${G.deck.minCorridorCells} cells wide`, ref);
    else if (Math.min(x1 - x0, y1 - y0) < 2 && room.type !== "cockpit") push("warning", "room.narrow", `${room.label} is under 2 m wide`, ref);
  }
  if (!doc.rooms.some((r) => G.roomTypes[r.type].control)) push("error", "rooms.control", "A ship needs a bridge or cockpit room for its pilot station", docRef);

  // Edges.
  const interior = deriveInterior(doc, 0, catalog);
  const partitionKeys = new Set(interior.partitions.map((p) => ekey(p.a, p.b)));
  const exteriorKeys = new Set([...interior.exteriorWalls].map((p) => ekey(p.a, p.b)));
  for (const d of interior.doors) if (d.exterior) for (const [a, b] of unitSegments(d.a, d.b)) exteriorKeys.add(ekey(a, b));
  const roomEdgeKeys = new Set<string>();
  if (deck?.outline)
    for (const room of doc.rooms)
      for (const [x, y] of roomCells(room, deck.outline))
        for (const [a, b] of [
          [[x, y], [x + 1, y]], [[x, y + 1], [x + 1, y + 1]], [[x, y], [x, y + 1]], [[x + 1, y], [x + 1, y + 1]],
        ] as [Pt, Pt][])
          roomEdgeKeys.add(ekey(a, b));
  const edgeClaims = new Map<string, string>();
  for (const e of doc.edges) {
    const ref = { kind: "edge" as const, id: e.id };
    const spec = G.edgeTypes[e.type];
    const segs = unitSegments(e.a, e.b);
    if (spec.door && segs.length !== 2) push("error", "edge.door-module", "Doors span exactly two cells (2 m module)", ref);
    for (const [a, b] of segs) {
      const k = ekey(a, b);
      if (edgeClaims.has(k)) push("error", "edge.overlap", `Overlaps edge ${edgeClaims.get(k)}`, ref);
      edgeClaims.set(k, e.id);
    }
    const allExterior = segs.every(([a, b]) => exteriorKeys.has(ekey(a, b)));
    const onRooms = segs.every(([a, b]) => roomEdgeKeys.has(ekey(a, b)) && !exteriorKeys.has(ekey(a, b)));
    if (allExterior) push("error", "edge.exterior", "Exterior openings are edge mounts (airlock or cargo-door components), not edges", ref);
    else if (!onRooms) push("error", "edge.placement", `${spec.label} must lie on room boundaries inside the hull`, ref);
    if (!spec.door && !allExterior && onRooms && !segs.every(([a, b]) => partitionKeys.has(ekey(a, b)) || e.type === "open"))
      push("warning", "edge.inside-room", `${spec.label} lies inside one room`, ref);
  }
  // Traversal: every room reachable from the control room through doors/open edges.
  const control = doc.rooms.find((r) => G.roomTypes[r.type].control);
  if (control && deck?.outline) {
    const adj = new Map<string, Set<string>>();
    const link = (a: string | null, b: string | null) => {
      if (!a || !b || a === b) return;
      if (!adj.has(a)) adj.set(a, new Set());
      if (!adj.has(b)) adj.set(b, new Set());
      adj.get(a)!.add(b);
      adj.get(b)!.add(a);
    };
    for (const d of interior.doors) link(d.rooms[0], d.rooms[1]);
    for (const e of doc.edges)
      if (e.type === "open")
        for (const [a, b] of unitSegments(e.a, e.b)) {
          const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          const n: Pt = a[1] === b[1] ? [0, 0.5] : [0.5, 0];
          const at = (x: number, y: number) => claimed.get(`${Math.floor(x)},${Math.floor(y)}`) ?? null;
          link(at(mid[0] + n[0], mid[1] + n[1]), at(mid[0] - n[0], mid[1] - n[1]));
        }
    const seen = new Set([control.id]);
    const queue = [control.id];
    while (queue.length) for (const n of adj.get(queue.shift()!) ?? []) if (!seen.has(n)) seen.add(n), queue.push(n);
    for (const r of doc.rooms) if (!seen.has(r.id)) push("warning", "room.unreachable", `${r.label} cannot be reached from ${control.label}`, { kind: "room", id: r.id });
  }
  if (control && !interior.station) push("error", "rooms.station", `${control.label} is too small for a pilot seat`, { kind: "room", id: control.id });

  // Mounts and skylights.
  for (const m of doc.mounts) issues.push(...validateMount(doc, m, catalog, geoms));
  for (const s of doc.skylights) {
    const ref = { kind: "skylight" as const, id: s.id };
    const hostOk = geoms.some((g) => g.outline && g.volume.kind === "hull" &&
      [[0.1, 0.1], [s.size[0] - 0.1, 0.1], [0.1, s.size[1] - 0.1], [s.size[0] - 0.1, s.size[1] - 0.1]].every(([dx, dy]) => insideOutline(g.outline!, s.at[0] + dx, s.at[1] + dy)));
    if (!hostOk) push("error", "skylight.off-roof", "Skylights sit fully on a hull roof", ref);
  }
  const stats = prefabStats(doc, catalog);
  if (stats.thrustN <= 0) push("warning", "flight.no-thrust", "No engines: the ship cannot fly", docRef);
  if (stats.powerBalanceW < 0) push("warning", "power.deficit", `Power deficit of ${Math.round(-stats.powerBalanceW / 1000)} kW`, docRef);
  if (stats.heatBalanceW > 0) push("warning", "heat.surplus", `Heat surplus of ${Math.round(stats.heatBalanceW / 1000)} kW`, docRef);
  return issues;
}

// ---------------------------------------------------------------- stats
export interface PrefabStats {
  lengthM: number;
  beamM: number;
  hullAreaM2: number;
  deckAreaM2: number;
  rooms: number;
  structureMassKg: number;
  componentMassKg: number;
  massKg: number;
  thrustN: number;
  /** Forward acceleration from rear engines (m/s^2). */
  accelerationMs2: number;
  thrustToWeight: number;
  powerGenerationW: number;
  powerDrawW: number;
  powerBalanceW: number;
  heatGenerationW: number;
  heatDissipationW: number;
  heatBalanceW: number;
  mountsBySize: Record<MountSizeId, number>;
  mountsByCategory: Record<string, number>;
  crew: number;
  cargoCells: number;
}

/** Mass of a floor cell and a wall unit (kg): light-alloy decking and partitions. Proposed, not balance-approved. */
const FLOOR_KG_PER_M2 = 40;
const WALL_KG_PER_M = 60;

export function prefabStats(doc: ShipPrefabDocumentV1, catalog: PrefabComponentCatalog): PrefabStats {
  const geoms = doc.volumes.map(volumeGeometry);
  const [x0, y0, x1, y1] = prefabBounds(geoms);
  let structureMassKg = 0;
  let hullAreaM2 = 0;
  for (const g of geoms) {
    hullAreaM2 += g.area;
    structureMassKg += g.area * G.heightClasses[g.volume.height].massPerM2 * 1000;
  }
  const interior = deriveInterior(doc, 0, catalog);
  structureMassKg += interior.floors.length * FLOOR_KG_PER_M2;
  structureMassKg += (interior.partitions.length + interior.exteriorWalls.length) * WALL_KG_PER_M;
  const mountsBySize: Record<MountSizeId, number> = { SM: 0, MD: 0, LG: 0, XL: 0 };
  const mountsByCategory: Record<string, number> = {};
  let componentMassKg = 0;
  let thrustN = 0;
  let pg = 0;
  let pd = 0;
  let hg = 0;
  let hd = 0;
  let berths = 0;
  for (const m of doc.mounts) {
    const spec = catalog.get(m.component);
    if (!spec) continue;
    mountsBySize[spec.sizeClass]++;
    mountsByCategory[spec.category] = (mountsByCategory[spec.category] ?? 0) + 1;
    componentMassKg += spec.massKg;
    if (spec.thrustN && m.attach === "face" && m.normal === "aft") thrustN += spec.thrustN;
    pg += spec.powerGenerationW ?? 0;
    pd += spec.powerDrawW ?? 0;
    hg += spec.heatW ?? 0;
    hd += spec.heatRejectionW ?? 0;
    berths += spec.berths ?? 0;
  }
  const massKg = structureMassKg + componentMassKg;
  const bunks = interior.sockets.filter((s) => s.designId.endsWith("crew-bunk")).length;
  return {
    lengthM: x1 - x0,
    beamM: y1 - y0,
    hullAreaM2,
    deckAreaM2: interior.floors.length,
    rooms: doc.rooms.length,
    structureMassKg,
    componentMassKg,
    massKg,
    thrustN,
    accelerationMs2: massKg > 0 ? thrustN / massKg : 0,
    thrustToWeight: massKg > 0 ? thrustN / (massKg * 9.81) : 0,
    powerGenerationW: pg,
    powerDrawW: pd,
    powerBalanceW: pg - pd,
    heatGenerationW: hg,
    heatDissipationW: hd,
    heatBalanceW: hg - hd,
    mountsBySize,
    mountsByCategory,
    crew: Math.max(1, berths + bunks * 2),
    cargoCells: interior.floors.filter((f) => doc.rooms.find((r) => r.id === f.room)?.type === "cargo").length,
  };
}

/** Empty document for the editor's "new prefab" action. */
export function blankShipPrefab(id: string, name: string, sizeClass: BlueprintSizeClassId = "S", theme: ShipThemeId = "federation"): ShipPrefabDocumentV1 {
  const tiles: ShapeTilePlacement[] = [];
  for (let x = 0; x < 8; x++) for (let y = 0; y < 4; y++) tiles.push({ x, y, shape: "square", rot: 0, reflected: false });
  return {
    schema: SHIP_PREFAB_SCHEMA,
    id,
    name,
    revision: 1,
    description: "",
    faction: "",
    role: "",
    theme,
    sizeClass,
    decks: [{ index: 0, name: "Main deck" }],
    volumes: [{ id: "hull", kind: "hull", height: "deck", deck: 0, tiles, spine: false }],
    rooms: [{ id: "bridge", label: "BRIDGE", type: "bridge", deck: 0, rect: [4, 0, 8, 4] }],
    edges: [],
    mounts: [],
    skylights: [],
    markings: { name: name.toUpperCase().slice(0, 16), number: "", emblem: "none" },
  };
}

/** Unused export guard so tree-shaking keeps the helpers referenced by tests. */
export const __prefabInternals = { unitSegments, ekey, insidePolygon };
