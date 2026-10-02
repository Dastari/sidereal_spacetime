import { bowJoinErrors } from "@sidereal/content/bow-profiles";
/**
 * Pure document commands for the prefab editor. Each takes a document and returns a new
 * one (or the same object when nothing changed, which the history ignores). None of them
 * normalise or repair other data; validation stays with `validateShipPrefab`.
 */
import {
  G,
  NORMAL_VECTOR,
  placedTilePolygon,
  placedTileSize,
  insidePolygon,
  tileOverlaps,
  type FaceNormal,
  type Pt,
  type QuarterTurn,
  type ShapeTilePlacement,
} from "@sidereal/content/construction-grammar";
import {
  SHIP_LOGIC_DEVICES,
  SHIP_LOGIC_LIMITS,
  validateLogicWiring,
  type LogicFacing,
  type PrefabLogic,
  type PrefabLogicDevice,
  type PrefabLogicEndpoint,
  type PrefabLogicLink,
} from "@sidereal/content/ship-logic";
import {
  mountTileAccepts,
  mountTileCapacity,
  mountTileRequired,
} from "@sidereal/content/ship-mount-tiles";
import {
  deriveInterior,
  fixtureSize,
  logicWallPlacement,
  mountTileCapacityText,
  validatePrefabFixtures,
  type PrefabComponentCatalog,
  type PrefabEdge,
  type PrefabFixture,
  type PrefabFixtureDesign,
  type PrefabMount,
  type PrefabMountTile,
  type PrefabRoom,
  type PrefabSkylight,
  type PrefabVolume,
  type ShipPrefabDocumentV1,
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
  | { kind: "mounttile"; id: string }
  | { kind: "skylight"; id: string }
  /** A hand-placed storage deck object (`doc.fixtures`). */
  | { kind: "fixture"; id: string }
  /** A ship logic device (wall button, door actuator, airlock controller). */
  | { kind: "logic"; id: string };

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
  patch: Partial<
    Pick<
      Doc,
      | "id"
      | "name"
      | "description"
      | "faction"
      | "role"
      | "theme"
      | "sizeClass"
      | "revision"
    >
  >,
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
export function addVolume(
  doc: Doc,
  init: Partial<PrefabVolume> = {},
): CommandResult {
  const kind = init.kind ?? "hull";
  const id = uniqueId(
    doc.volumes.map((v) => v.id),
    init.id ?? (kind === "plate" ? "plate" : "hull"),
  );
  const volume: PrefabVolume = {
    id,
    kind,
    height: init.height ?? (kind === "plate" ? "wing" : "pod"),
    deck: 0,
    tiles: init.tiles ?? [],
  };
  if (init.spine !== undefined) volume.spine = init.spine;
  if (init.logo !== undefined) volume.logo = init.logo;
  if (init.faceStyle !== undefined) volume.faceStyle = init.faceStyle;
  return {
    doc: { ...doc, volumes: [...doc.volumes, volume] },
    select: { kind: "volume", id },
  };
}

export function updateVolume(
  doc: Doc,
  id: string,
  patch: Partial<Omit<PrefabVolume, "id" | "tiles">>,
): Doc {
  const v = doc.volumes.find((x) => x.id === id);
  if (!v) return doc;
  const next: PrefabVolume = { ...v };
  for (const [k, value] of Object.entries(patch) as [
    keyof PrefabVolume,
    unknown,
  ][]) {
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
const boxesTouch = (a: number[], b: number[]) =>
  a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

/** Indices of tiles that overlap `candidate` (same deterministic coverage test as validation). */
export function overlappingTiles(
  tiles: readonly ShapeTilePlacement[],
  candidate: ShapeTilePlacement,
): number[] {
  const box = tileBox(candidate);
  const near = tiles
    .map((t, i) => [t, i] as const)
    .filter(([t]) => boxesTouch(tileBox(t), box));
  if (!near.length) return [];
  const pairs = tileOverlaps([...near.map(([t]) => t), candidate]);
  const last = near.length;
  return pairs
    .filter(([a, b]) => a === last || b === last)
    .map(([a, b]) => near[a === last ? b : a][1]);
}

/**
 * Paint tiles into a volume. Tiles that overlap existing (or earlier painted) tiles are
 * rejected; with symmetry each tile brings its mirror (skipped when it lands on itself).
 */
export function paintTiles(
  doc: Doc,
  volumeId: string,
  candidates: readonly ShapeTilePlacement[],
  mirror: number | null = null,
): CommandResult {
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
  if (bowJoinErrors(tiles, volume.height).length)
    return { doc, error: "Bow edge profiles do not match" };
  if (tiles.length === volume.tiles.length)
    return { doc, error: rejected ? "Overlaps an existing tile" : undefined };
  return {
    doc: {
      ...doc,
      volumes: doc.volumes.map((v) =>
        v.id === volumeId ? { ...v, tiles } : v,
      ),
    },
    error: rejected
      ? `${rejected} overlapping tile${rejected === 1 ? "" : "s"} skipped`
      : undefined,
  };
}

/** Index of the topmost tile of the volume whose polygon contains the point, or -1. */
export function tileIndexAt(
  volume: PrefabVolume,
  x: number,
  y: number,
  skip?: ReadonlySet<number>,
): number {
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
export function eraseTiles(
  doc: Doc,
  volumeId: string,
  points: readonly (readonly [number, number])[],
  mirror: number | null = null,
): Doc {
  const volume = doc.volumes.find((v) => v.id === volumeId);
  if (!volume) return doc;
  const drop = new Set<number>();
  const all =
    mirror === null
      ? points
      : [...points, ...points.map(([x, y]) => [x, 2 * mirror - y] as const)];
  for (const [x, y] of all) {
    const i = tileIndexAt(volume, x, y, drop);
    if (i >= 0) drop.add(i);
  }
  if (!drop.size) return doc;
  return {
    ...doc,
    volumes: doc.volumes.map((v) =>
      v.id === volumeId
        ? { ...v, tiles: v.tiles.filter((_, i) => !drop.has(i)) }
        : v,
    ),
  };
}

/** Replace one tile; refused when the result would overlap another tile. */
export function replaceTile(
  doc: Doc,
  volumeId: string,
  index: number,
  tile: ShapeTilePlacement,
): CommandResult {
  const volume = doc.volumes.find((v) => v.id === volumeId);
  if (!volume || !volume.tiles[index]) return { doc };
  const others = volume.tiles.filter((_, i) => i !== index);
  if (overlappingTiles(others, tile).length)
    return { doc, error: "That would overlap another tile" };
  const tiles = volume.tiles.map((t, i) => (i === index ? tile : t));
  return {
    doc: {
      ...doc,
      volumes: doc.volumes.map((v) =>
        v.id === volumeId ? { ...v, tiles } : v,
      ),
    },
  };
}

// ------------------------------------------------------------------ rooms
export function roomRectsOverlap(a: readonly number[], b: readonly number[]) {
  return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
}

export function addRoom(
  doc: Doc,
  room: Omit<PrefabRoom, "id" | "deck">,
  mirror: number | null = null,
): CommandResult {
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
    const clash = [...rooms, ...created].find((o) =>
      roomRectsOverlap(o.rect, r.rect),
    );
    if (clash) return { doc, error: `Overlaps room ${clash.label}` };
    const id = uniqueId(
      [...taken, ...created.map((c) => c.id)],
      r.label || r.type,
    );
    created.push({ id, ...r });
  }
  return {
    doc: { ...doc, rooms: [...rooms, ...created] },
    select: { kind: "room", id: created[0].id },
  };
}

export function updateRoom(
  doc: Doc,
  id: string,
  patch: Partial<Omit<PrefabRoom, "id">>,
): Doc {
  if (!doc.rooms.some((r) => r.id === id)) return doc;
  return {
    ...doc,
    rooms: doc.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)),
  };
}

// ------------------------------------------------------------------ edges
type Seg = [[number, number], [number, number]];
export function unitSegments(
  a: readonly number[],
  b: readonly number[],
): Seg[] {
  const L = Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]));
  const dx = (b[0] - a[0]) / L;
  const dy = (b[1] - a[1]) / L;
  const out: Seg[] = [];
  for (let u = 0; u < L; u++)
    out.push([
      [a[0] + dx * u, a[1] + dy * u],
      [a[0] + dx * (u + 1), a[1] + dy * (u + 1)],
    ]);
  return out;
}
export const segKey = ([p, q]: readonly (readonly number[])[]) => {
  const [m, n] =
    p[0] < q[0] || (p[0] === q[0] && p[1] <= q[1]) ? [p, q] : [q, p];
  return `${m[0]},${m[1]}|${n[0]},${n[1]}`;
};

/**
 * Place an edge feature. Existing edges sharing any unit segment are replaced; placing the
 * exact same edge and type again removes it (toggle).
 */
export function placeEdge(
  doc: Doc,
  edge: Omit<PrefabEdge, "id" | "deck">,
  mirror: number | null = null,
): CommandResult {
  const set = [edge];
  if (mirror !== null) {
    const m = mirrorEdge(edge, mirror);
    if (!sameEdge(m, edge)) set.push(m);
  }
  const exact = doc.edges.find(
    (e) => sameEdge(e, edge) && e.type === edge.type,
  );
  if (exact) {
    const mirrored =
      mirror !== null
        ? doc.edges.find(
            (e) =>
              e !== exact &&
              sameEdge(e, mirrorEdge(edge, mirror)) &&
              e.type === edge.type,
          )
        : undefined;
    return {
      doc: {
        ...doc,
        edges: doc.edges.filter((e) => e !== exact && e !== mirrored),
      },
    };
  }
  // Exterior runs (canopy glass) follow the outline and never displace lattice edges.
  const exterior = !!G.edgeTypes[edge.type].exterior;
  const keys = new Set(
    exterior ? [] : set.flatMap((e) => unitSegments(e.a, e.b).map(segKey)),
  );
  const kept = exterior
    ? doc.edges
    : doc.edges.filter((e) =>
        !G.edgeTypes[e.type].exterior &&
        unitSegments(e.a, e.b).some((s) => keys.has(segKey(s)))
          ? false
          : true,
      );
  const created: PrefabEdge[] = [];
  for (const e of set) {
    const base = e.type.startsWith("door")
      ? "door"
      : e.type.replace(/\./g, "-");
    const id = uniqueId(
      [...kept.map((x) => x.id), ...created.map((x) => x.id)],
      base,
    );
    created.push({
      id,
      deck: 0,
      a: [...e.a] as [number, number],
      b: [...e.b] as [number, number],
      type: e.type,
    });
  }
  return {
    doc: { ...doc, edges: [...kept, ...created] },
    select: { kind: "edge", id: created[0].id },
  };
}

export function updateEdge(
  doc: Doc,
  id: string,
  patch: Partial<Omit<PrefabEdge, "id">>,
): Doc {
  if (!doc.edges.some((e) => e.id === id)) return doc;
  return {
    ...doc,
    edges: doc.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)),
  };
}

// ------------------------------------------------------------------ mounts and skylights
export function mountIdBase(component: string) {
  return component.split(".")[0] || "mount";
}

export function addMount(
  doc: Doc,
  mount: Omit<PrefabMount, "id">,
  catalog: PrefabComponentCatalog,
  mirror: number | null = null,
): CommandResult {
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
    const id = uniqueId(
      [...doc.mounts.map((x) => x.id), ...created.map((x) => x.id)],
      mountIdBase(m.component),
    );
    created.push(cleanMount({ id, ...m }));
  }
  return {
    doc: { ...doc, mounts: [...doc.mounts, ...created] },
    select: { kind: "mount", id: created[0].id },
  };
}

/** Drop optional keys that are undefined so documents stay admissible and canonical. */
export function cleanMount(m: PrefabMount): PrefabMount {
  const out: PrefabMount = {
    id: m.id,
    component: m.component,
    attach: m.attach,
    at: [m.at[0], m.at[1]],
  };
  if (m.normal !== undefined && m.attach !== "top") out.normal = m.normal;
  if (m.z !== undefined && m.attach === "face") out.z = m.z;
  if (m.tile !== undefined && m.attach === "top") out.tile = m.tile;
  return out;
}

// ------------------------------------------------------------------ roof mount tiles
/** Mount ids a tile's linked items use: the tile id for one item, `<id>-a`.. for dual/quad. */
export const tileItemIds = (tileId: string, count: number) =>
  Array.from({ length: count }, (_, i) =>
    count === 1 ? tileId : `${tileId}-${"abcd"[i]}`,
  );

/** Documents without `mountTiles` are legacy (pre-2026-09-29 mount rules). */
export function adoptMountRules(doc: Doc): Doc {
  return doc.mountTiles ? doc : { ...doc, mountTiles: [] };
}

export function addMountTile(
  doc: Doc,
  tile: Omit<PrefabMountTile, "id">,
): CommandResult {
  const tiles = doc.mountTiles ?? [];
  const taken = [
    ...tiles.map((t) => t.id),
    ...doc.mounts.flatMap((m) => [m.id, m.id.replace(/-[abcd]$/, "")]),
  ];
  let id = uniqueId(taken, tile.kind === "turret" ? "turret" : "mount");
  // A tile's item ids (<id>, <id>-a..d) must stay free among mounts.
  while (tileItemIds(id, 4).some((x) => doc.mounts.some((m) => m.id === x)))
    id = uniqueId([...taken, id], id);
  const t: PrefabMountTile = {
    id,
    kind: tile.kind,
    size: tile.size,
    at: [tile.at[0], tile.at[1]],
    facing: tile.facing,
  };
  return {
    doc: { ...doc, mountTiles: [...tiles, t] },
    select: { kind: "mounttile", id },
  };
}

/** Change a tile; its items move and turn with it. */
export function updateMountTile(
  doc: Doc,
  id: string,
  patch: Partial<Omit<PrefabMountTile, "id">>,
): Doc {
  const t = doc.mountTiles?.find((x) => x.id === id);
  if (!t) return doc;
  const next = { ...t, ...patch };
  return {
    ...doc,
    mountTiles: doc.mountTiles!.map((x) => (x.id === id ? next : x)),
    mounts: doc.mounts.map((m) =>
      m.tile === id ? { ...m, at: [next.at[0], next.at[1]] } : m,
    ),
  };
}

/**
 * Mount `count` linked `component`s on a tile (replacing what it carries), or clear it with
 * `component = null`. Refuses items the tile cannot carry: only weapons and sensors, and the
 * size table (fixed mounts full size; turret mounts one size smaller).
 */
export function setTileItems(
  doc: Doc,
  tileId: string,
  component: string | null,
  count: 1 | 2 | 4,
  catalog: PrefabComponentCatalog,
): CommandResult {
  const tile = doc.mountTiles?.find((t) => t.id === tileId);
  if (!tile) return { doc, error: `No mount tile ${tileId}` };
  const kept = doc.mounts.filter((m) => m.tile !== tileId);
  if (component === null) return { doc: { ...doc, mounts: kept } };
  const spec = catalog.get(component);
  if (!spec) return { doc, error: `Unknown component ${component}` };
  if (!mountTileRequired(spec.category))
    return {
      doc,
      error: `${spec.label} is not a weapon or sensor; mount tiles carry only weapons and sensors`,
    };
  if (!mountTileCapacity(tile.kind, tile.size, count))
    return {
      doc,
      error: `${count} items do not fit: ${mountTileCapacityText(tile.kind, tile.size)}`,
    };
  if (!mountTileAccepts(tile.kind, tile.size, count, spec.sizeClass))
    return {
      doc,
      error: `${spec.label} is ${spec.sizeClass}: ${mountTileCapacityText(tile.kind, tile.size)}${tile.kind === "turret" ? " (turret mounts carry one size smaller)" : ""}`,
    };
  const ids = tileItemIds(tileId, count);
  const clash = ids.find((x) => kept.some((m) => m.id === x));
  if (clash) return { doc, error: `Mount id ${clash} is already used` };
  const items: PrefabMount[] = ids.map((id) => ({
    id,
    component,
    attach: "top",
    at: [tile.at[0], tile.at[1]],
    tile: tileId,
  }));
  return {
    doc: { ...doc, mounts: [...kept, ...items] },
    select: { kind: "mounttile", id: tileId },
  };
}

export function updateMount(
  doc: Doc,
  id: string,
  patch: Partial<Omit<PrefabMount, "id">>,
): Doc {
  if (!doc.mounts.some((m) => m.id === id)) return doc;
  return {
    ...doc,
    mounts: doc.mounts.map((m) =>
      m.id === id ? cleanMount({ ...m, ...patch }) : m,
    ),
  };
}

export function addSkylight(
  doc: Doc,
  s: Omit<PrefabSkylight, "id">,
  mirror: number | null = null,
): CommandResult {
  const set = [s];
  if (mirror !== null) {
    const m = mirrorSkylight({ ...s, id: "_" }, mirror);
    if (m.at[1] !== s.at[1]) set.push({ at: m.at, size: m.size });
  }
  const created: PrefabSkylight[] = [];
  for (const x of set) {
    const clash = [...doc.skylights, ...created].find((o) =>
      roomRectsOverlap(
        [o.at[0], o.at[1], o.at[0] + o.size[0], o.at[1] + o.size[1]],
        [x.at[0], x.at[1], x.at[0] + x.size[0], x.at[1] + x.size[1]],
      ),
    );
    if (clash) return { doc, error: `Overlaps skylight ${clash.id}` };
    created.push({
      id: uniqueId(
        [...doc.skylights.map((o) => o.id), ...created.map((o) => o.id)],
        "sky",
      ),
      at: [...x.at],
      size: [...x.size],
    });
  }
  return {
    doc: { ...doc, skylights: [...doc.skylights, ...created] },
    select: { kind: "skylight", id: created[0].id },
  };
}

export function updateSkylight(
  doc: Doc,
  id: string,
  patch: Partial<Omit<PrefabSkylight, "id">>,
): Doc {
  if (!doc.skylights.some((s) => s.id === id)) return doc;
  return {
    ...doc,
    skylights: doc.skylights.map((s) => (s.id === id ? { ...s, ...patch } : s)),
  };
}

// ------------------------------------------------------------------ storage fixtures
const twentieth = (v: number) => Math.round(v * 20) / 20 || 0;
const fixturesOf = (doc: Doc): readonly PrefabFixture[] => doc.fixtures ?? [];
/** An empty fixture list is written as no key, so documents without fixtures stay unchanged. */
const withFixtures = (doc: Doc, fixtures: PrefabFixture[]): Doc => {
  if (fixtures.length) return { ...doc, fixtures };
  const { fixtures: _, ...rest } = doc;
  return rest;
};
export const FIXTURE_DESIGN_LABELS: Record<PrefabFixtureDesign, string> = {
  "shipyard.equipment.wall-locker": "Wall locker",
  "cargo.standard.medium": "Storage crate",
  "pale-studless.table.standard": "Table",
  "shipyard.equipment.workshop-bank-r025": "Workshop bank",
  "shipyard.equipment.medical-equipment-bank-r025": "Medical equipment",
};

/** Storage tool: the footprint centred on the cursor, min corner on the 0.05 m grid. */
export function fixtureCandidate(
  p: Pt,
  design: PrefabFixtureDesign,
  facing: FaceNormal,
): Omit<PrefabFixture, "id"> {
  const [w, h] = fixtureSize({ design, facing });
  return {
    design,
    at: [twentieth(p[0] - w / 2), twentieth(p[1] - h / 2)],
    facing,
  };
}

/** Placement gate for one fixture: the `validatePrefabFixtures` rules (doors, buttons, modules). */
export function checkFixture(
  doc: Doc,
  f: PrefabFixture,
  catalog?: PrefabComponentCatalog,
): { ok: boolean; reason?: string } {
  const others = fixturesOf(doc).filter((x) => x.id !== f.id);
  const issue = validatePrefabFixtures(
    { ...doc, fixtures: [...others, f] },
    catalog,
  ).find((i) => i.id === f.id);
  return issue
    ? { ok: false, reason: issue.message.replace(`${f.id} `, "") }
    : { ok: true };
}

export function addFixture(
  doc: Doc,
  f: Omit<PrefabFixture, "id">,
  catalog?: PrefabComponentCatalog,
): CommandResult {
  const id = uniqueId(
    fixturesOf(doc).map((x) => x.id),
    f.design === "cargo.standard.medium" ? "crate" : "locker",
  );
  const fixture: PrefabFixture = {
    id,
    design: f.design,
    at: [f.at[0], f.at[1]],
    facing: f.facing,
  };
  const check = checkFixture(doc, fixture, catalog);
  if (!check.ok) return { doc, error: check.reason };
  return {
    doc: withFixtures(doc, [...fixturesOf(doc), fixture]),
    select: { kind: "fixture", id },
  };
}

export function updateFixture(
  doc: Doc,
  id: string,
  patch: Partial<Omit<PrefabFixture, "id">>,
): Doc {
  if (!fixturesOf(doc).some((f) => f.id === id)) return doc;
  return withFixtures(
    doc,
    fixturesOf(doc).map((f) =>
      f.id === id
        ? {
            ...f,
            ...patch,
            at: patch.at
              ? [twentieth(patch.at[0]), twentieth(patch.at[1])]
              : f.at,
          }
        : f,
    ),
  );
}

// ------------------------------------------------------------------ ship logic (wiki Systems/Ship Logic)
const EMPTY_LOGIC: PrefabLogic = { devices: [], links: [] };
const logicOf = (doc: Doc): PrefabLogic => doc.logic ?? EMPTY_LOGIC;
const withLogic = (doc: Doc, logic: PrefabLogic): Doc => ({ ...doc, logic });
const quarter = (v: number) => Math.round(v * 4) / 4 || 0;

/**
 * Snap a plan point for a wall device: the 0.25 m grid along the wall, and the nearest whole-metre
 * wall line across its facing (the line the panel's back sits on).
 */
export function snapLogicWallPoint(
  p: readonly number[],
  normal: LogicFacing,
): [number, number] {
  const axis = NORMAL_VECTOR[normal][0] !== 0 ? 0 : 1;
  const at: [number, number] = [quarter(p[0]), quarter(p[1])];
  at[axis] = Math.round(p[axis]) || 0;
  return at;
}

/** Whether a wall button fits at this (snapped) point and facing; reasons are the validator's. */
export function checkLogicButton(
  doc: Doc,
  at: [number, number],
  normal: LogicFacing,
  catalog?: PrefabComponentCatalog,
  ignore?: string,
): { ok: boolean; reason?: string } {
  const place = logicWallPlacement(doc, { at, normal }, catalog);
  if ("error" in place) return { ok: false, reason: `Button ${place.error}` };
  const clash = logicOf(doc).devices.find(
    (d) =>
      d.id !== ignore &&
      d.kind === "button" &&
      d.normal === normal &&
      d.at?.[0] === at[0] &&
      d.at?.[1] === at[1],
  );
  if (clash) return { ok: false, reason: `Button ${clash.id} is already here` };
  return { ok: true };
}

function addLogicDevice(
  doc: Doc,
  device: Omit<PrefabLogicDevice, "id">,
  base: string,
): CommandResult {
  const logic = logicOf(doc);
  if (logic.devices.length >= SHIP_LOGIC_LIMITS.devices)
    return {
      doc,
      error: `A ship holds at most ${SHIP_LOGIC_LIMITS.devices} logic devices`,
    };
  const id = uniqueId(
    logic.devices.map((d) => d.id),
    base,
  );
  return {
    doc: withLogic(doc, {
      devices: [...logic.devices, { id, ...device }],
      links: logic.links,
    }),
    select: { kind: "logic", id },
  };
}

/** Add a wall button at a plan point, facing the side it is pressed from. */
export function addLogicButton(
  doc: Doc,
  p: readonly number[],
  normal: LogicFacing,
  catalog?: PrefabComponentCatalog,
): CommandResult {
  const at = snapLogicWallPoint(p, normal);
  const check = checkLogicButton(doc, at, normal, catalog);
  if (!check.ok) return { doc, error: check.reason };
  return addLogicDevice(doc, { kind: "button", at, normal }, "btn");
}

/** Move (and optionally turn) a wall button; the new spot must be a usable wall. */
export function moveLogicButton(
  doc: Doc,
  id: string,
  p: readonly number[],
  normal?: LogicFacing,
  catalog?: PrefabComponentCatalog,
): CommandResult {
  const logic = logicOf(doc);
  const d = logic.devices.find((x) => x.id === id);
  if (!d) return { doc };
  if (d.kind !== "button" || !d.normal)
    return { doc, error: "Only wall buttons have a wall position" };
  const facing = normal ?? d.normal;
  const at = snapLogicWallPoint(p, facing);
  if (d.at?.[0] === at[0] && d.at?.[1] === at[1] && d.normal === facing)
    return { doc };
  const check = checkLogicButton(doc, at, facing, catalog, id);
  if (!check.ok) return { doc, error: check.reason };
  return {
    doc: withLogic(doc, {
      devices: logic.devices.map((x) =>
        x.id === id ? { ...x, at, normal: facing } : x,
      ),
      links: logic.links,
    }),
  };
}

/** Doors of the deck a door actuator can drive: door edges and edge-mount openings. */
export function logicDoors(doc: Doc, catalog?: PrefabComponentCatalog) {
  return deriveInterior(doc, 0, catalog).doors;
}

/** Add a door actuator on a door edge or edge-mount opening (one actuator per door). */
export function addLogicDoor(
  doc: Doc,
  door: string,
  catalog: PrefabComponentCatalog,
): CommandResult {
  const d = logicDoors(doc, catalog).find((x) => x.id === door);
  if (!d) return { doc, error: `No door ${door} on the deck` };
  if (d.type === "door.forcefield")
    return { doc, error: "A forcefield has no leaves to actuate" };
  const mount = doc.mounts.find((m) => m.id === door);
  if (mount && !catalog.get(mount.component)?.dataPort)
    return {
      doc,
      error: `${mount.component} has no data port to take commands`,
    };
  const taken = logicOf(doc).devices.find(
    (x) => x.kind === "door" && x.door === door,
  );
  if (taken)
    return {
      doc,
      error: `Door ${door} already has an actuator (${taken.id})`,
    };
  return addLogicDevice(doc, { kind: "door", door }, `door-${door}`);
}

const cycleError = (s: number) =>
  !Number.isFinite(s) ||
  s < SHIP_LOGIC_LIMITS.cycleMinS ||
  s > SHIP_LOGIC_LIMITS.cycleMaxS ||
  Math.abs(s * 10 - Math.round(s * 10)) > 1e-9
    ? `Cycle time is ${SHIP_LOGIC_LIMITS.cycleMinS} to ${SHIP_LOGIC_LIMITS.cycleMaxS} s in 0.1 s steps`
    : undefined;

/** Add an airlock controller (virtual: no placement); `cycleS` is one (de)pressurise stage. */
export function addAirlockController(doc: Doc, cycleS?: number): CommandResult {
  if (cycleS !== undefined) {
    const error = cycleError(cycleS);
    if (error) return { doc, error };
  }
  return addLogicDevice(
    doc,
    {
      kind: "airlock-controller",
      ...(cycleS === undefined ? {} : { cycleS: Math.round(cycleS * 10) / 10 }),
    },
    "airlock",
  );
}

/** Set (or clear, with undefined: the default stage) an airlock controller's cycle time. */
export function setControllerCycle(
  doc: Doc,
  id: string,
  cycleS: number | undefined,
): CommandResult {
  const logic = logicOf(doc);
  const d = logic.devices.find((x) => x.id === id);
  if (!d || d.kind !== "airlock-controller") return { doc };
  if (cycleS !== undefined) {
    const error = cycleError(cycleS);
    if (error) return { doc, error };
    cycleS = Math.round(cycleS * 10) / 10;
  }
  if (d.cycleS === cycleS) return { doc };
  const { cycleS: _old, ...rest } = d;
  void _old;
  const next = cycleS === undefined ? rest : { ...rest, cycleS };
  return {
    doc: withLogic(doc, {
      devices: logic.devices.map((x) => (x.id === id ? next : x)),
      links: logic.links,
    }),
  };
}

/** Remove a logic device and every wire to or from it. */
export function removeLogicDevice(doc: Doc, id: string): Doc {
  const logic = doc.logic;
  if (!logic?.devices.some((d) => d.id === id)) return doc;
  return withLogic(doc, {
    devices: logic.devices.filter((d) => d.id !== id),
    links: logic.links.filter(
      (l) => l.from.device !== id && l.to.device !== id,
    ),
  });
}

/** Default wire id, the same derivation as the prefab builders' `wire()`. */
export const logicWireId = (
  from: PrefabLogicEndpoint,
  to: PrefabLogicEndpoint,
) =>
  `w.${from.device}.${from.port}.${to.device}.${to.port}`
    .toLowerCase()
    .replace(/_/g, "-");

/**
 * Wire an output port to an input port. Refused (with the wiring validator's message) when the new
 * wire itself is wrong: missing port, wrong direction, type mismatch, self wire, duplicate, or a
 * second driver of a value input.
 */
export function addLogicWire(
  doc: Doc,
  from: PrefabLogicEndpoint,
  to: PrefabLogicEndpoint,
): CommandResult {
  const logic = logicOf(doc);
  const ids = new Set(logic.devices.map((d) => d.id));
  if (!ids.has(from.device)) return { doc, error: `No device ${from.device}` };
  if (!ids.has(to.device)) return { doc, error: `No device ${to.device}` };
  if (logic.links.length >= SHIP_LOGIC_LIMITS.links)
    return {
      doc,
      error: `A ship holds at most ${SHIP_LOGIC_LIMITS.links} wires`,
    };
  const link: PrefabLogicLink = {
    id: uniqueId(
      logic.links.map((l) => l.id),
      logicWireId(from, to),
    ),
    from: { device: from.device, port: from.port },
    to: { device: to.device, port: to.port },
  };
  const next: PrefabLogic = {
    devices: logic.devices,
    links: [...logic.links, link],
  };
  const own = validateLogicWiring(next).find(
    (i) =>
      i.severity === "error" && i.ref.kind === "link" && i.ref.id === link.id,
  );
  if (own) return { doc, error: own.message };
  return {
    doc: withLogic(doc, next),
    select: { kind: "logic", id: from.device },
  };
}

export function removeLogicWire(doc: Doc, id: string): Doc {
  const logic = doc.logic;
  if (!logic?.links.some((l) => l.id === id)) return doc;
  return withLogic(doc, {
    devices: logic.devices,
    links: logic.links.filter((l) => l.id !== id),
  });
}

/** Wires with an end on this device. */
export const deviceWires = (doc: Doc, id: string) =>
  logicOf(doc).links.filter((l) => l.from.device === id || l.to.device === id);

/** Catalogue name of a device kind. */
export const logicDeviceName = (d: Pick<PrefabLogicDevice, "kind">) =>
  SHIP_LOGIC_DEVICES[d.kind].name;

/** Move a wall button by a plan delta (re-snapped onto its wall line). */
const nudgeButton = (
  doc: Doc,
  d: PrefabLogicDevice,
  dx: number,
  dy: number,
  catalog?: PrefabComponentCatalog,
): CommandResult =>
  d.kind === "button" && d.at
    ? moveLogicButton(
        doc,
        d.id,
        [d.at[0] + dx, d.at[1] + dy] as Pt,
        undefined,
        catalog,
      )
    : {
        doc,
        error: "Only wall buttons move; door actuators follow their door",
      };

// ------------------------------------------------------------------ selection commands
export function selectionExists(
  doc: Doc,
  sel: PrefabSelection | null,
): boolean {
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
    case "mounttile":
      return !!doc.mountTiles?.some((t) => t.id === sel.id);
    case "skylight":
      return doc.skylights.some((s) => s.id === sel.id);
    case "fixture":
      return fixturesOf(doc).some((f) => f.id === sel.id);
    case "logic":
      return !!doc.logic?.devices.some((d) => d.id === sel.id);
  }
}

export function removeSelection(doc: Doc, sel: PrefabSelection): Doc {
  switch (sel.kind) {
    case "volume":
      return removeVolume(doc, sel.id);
    case "tile":
      return {
        ...doc,
        volumes: doc.volumes.map((v) =>
          v.id === sel.volume
            ? { ...v, tiles: v.tiles.filter((_, i) => i !== sel.index) }
            : v,
        ),
      };
    case "room":
      return { ...doc, rooms: doc.rooms.filter((r) => r.id !== sel.id) };
    case "edge":
      return { ...doc, edges: doc.edges.filter((e) => e.id !== sel.id) };
    case "mount":
      return { ...doc, mounts: doc.mounts.filter((m) => m.id !== sel.id) };
    case "mounttile":
      return {
        ...doc,
        mountTiles: doc.mountTiles?.filter((t) => t.id !== sel.id),
        mounts: doc.mounts.filter((m) => m.tile !== sel.id),
      };
    case "skylight":
      return {
        ...doc,
        skylights: doc.skylights.filter((s) => s.id !== sel.id),
      };
    case "fixture":
      return withFixtures(
        doc,
        fixturesOf(doc).filter((f) => f.id !== sel.id),
      );
    case "logic":
      return removeLogicDevice(doc, sel.id);
  }
}

/**
 * Move the selection by whole cells (mounts: 0.5 m steps along their grid; wall buttons re-snap
 * to the 0.25 m grid on a wall line).
 */
export function nudgeSelection(
  doc: Doc,
  sel: PrefabSelection,
  dx: number,
  dy: number,
  catalog?: PrefabComponentCatalog,
): CommandResult {
  switch (sel.kind) {
    case "logic": {
      const d = doc.logic?.devices.find((x) => x.id === sel.id);
      return d ? nudgeButton(doc, d, dx, dy, catalog) : { doc };
    }
    case "room": {
      const r = doc.rooms.find((x) => x.id === sel.id);
      if (!r) return { doc };
      const rect: PrefabRoom["rect"] = [
        r.rect[0] + dx,
        r.rect[1] + dy,
        r.rect[2] + dx,
        r.rect[3] + dy,
      ];
      const clash = doc.rooms.find(
        (o) => o.id !== r.id && roomRectsOverlap(o.rect, rect),
      );
      if (clash) return { doc, error: `Would overlap room ${clash.label}` };
      return { doc: updateRoom(doc, r.id, { rect }) };
    }
    case "mounttile": {
      const t = doc.mountTiles?.find((x) => x.id === sel.id);
      if (!t) return { doc };
      return {
        doc: updateMountTile(doc, t.id, { at: [t.at[0] + dx, t.at[1] + dy] }),
      };
    }
    case "mount": {
      const m = doc.mounts.find((x) => x.id === sel.id);
      if (!m) return { doc };
      // Tile items move with their tile.
      if (m.tile !== undefined)
        return nudgeSelection(doc, { kind: "mounttile", id: m.tile }, dx, dy);
      // Face and edge mounts slide along their face only; the face line stays fixed.
      let [mx, my] = [dx, dy];
      if (m.attach === "face" || m.attach === "edge") {
        if (m.normal === "fore" || m.normal === "aft") mx = 0;
        else my = 0;
      }
      if (mx === 0 && my === 0)
        return { doc, error: "Face mounts slide along their face" };
      return {
        doc: updateMount(doc, m.id, { at: [m.at[0] + mx, m.at[1] + my] }),
      };
    }
    case "fixture": {
      // Fixtures sit on the 0.05 m grid (arrows: 0.05 m, Shift 0.25 m).
      const f = fixturesOf(doc).find((x) => x.id === sel.id);
      if (!f) return { doc };
      return {
        doc: updateFixture(doc, f.id, { at: [f.at[0] + dx, f.at[1] + dy] }),
      };
    }
    case "skylight": {
      const s = doc.skylights.find((x) => x.id === sel.id);
      if (!s) return { doc };
      return {
        doc: updateSkylight(doc, s.id, {
          at: [
            s.at[0] + Math.sign(dx) * Math.ceil(Math.abs(dx)),
            s.at[1] + Math.sign(dy) * Math.ceil(Math.abs(dy)),
          ],
        }),
      };
    }
    case "edge": {
      const e = doc.edges.find((x) => x.id === sel.id);
      if (!e) return { doc };
      const [ix, iy] = [
        Math.sign(dx) * Math.ceil(Math.abs(dx)),
        Math.sign(dy) * Math.ceil(Math.abs(dy)),
      ];
      return {
        doc: updateEdge(doc, e.id, {
          a: [e.a[0] + ix, e.a[1] + iy],
          b: [e.b[0] + ix, e.b[1] + iy],
        }),
      };
    }
    case "tile": {
      const v = doc.volumes.find((x) => x.id === sel.volume);
      const t = v?.tiles[sel.index];
      if (!t) return { doc };
      return replaceTile(doc, sel.volume, sel.index, {
        ...t,
        x: t.x + Math.sign(dx) * Math.ceil(Math.abs(dx)),
        y: t.y + Math.sign(dy) * Math.ceil(Math.abs(dy)),
      });
    }
    case "volume": {
      const [ix, iy] = [
        Math.sign(dx) * Math.ceil(Math.abs(dx)),
        Math.sign(dy) * Math.ceil(Math.abs(dy)),
      ];
      return {
        doc: {
          ...doc,
          volumes: doc.volumes.map((v) =>
            v.id === sel.id
              ? {
                  ...v,
                  tiles: v.tiles.map((t) => ({
                    ...t,
                    x: t.x + ix,
                    y: t.y + iy,
                  })),
                }
              : v,
          ),
        },
      };
    }
  }
}

export const NEXT_FACING: Record<FaceNormal, FaceNormal> = {
  fore: "port",
  port: "aft",
  aft: "starboard",
  starboard: "fore",
};

const OPPOSITE: Record<LogicFacing, LogicFacing> = {
  fore: "aft",
  aft: "fore",
  port: "starboard",
  starboard: "port",
};

/**
 * R: turn a tile a quarter (counter-clockwise) or an interior module's facing; flip a wall button
 * to the other side of its wall.
 */
export function rotateSelection(
  doc: Doc,
  sel: PrefabSelection,
  catalog?: PrefabComponentCatalog,
): CommandResult {
  if (sel.kind === "logic") {
    const d = doc.logic?.devices.find((x) => x.id === sel.id);
    if (!d) return { doc };
    if (d.kind !== "button" || !d.at || !d.normal)
      return { doc, error: "Only wall buttons turn" };
    return moveLogicButton(doc, d.id, d.at, OPPOSITE[d.normal], catalog);
  }
  if (sel.kind === "tile") {
    const t = doc.volumes.find((v) => v.id === sel.volume)?.tiles[sel.index];
    if (!t) return { doc };
    return replaceTile(doc, sel.volume, sel.index, {
      ...t,
      rot: ((t.rot + 1) % 4) as QuarterTurn,
    });
  }
  if (sel.kind === "mount") {
    const m = doc.mounts.find((x) => x.id === sel.id);
    if (!m) return { doc };
    if (m.attach !== "interior")
      return {
        doc,
        error:
          "Only interior modules turn; face mounts take their face's normal",
      };
    return {
      doc: updateMount(doc, m.id, { normal: NEXT_FACING[m.normal ?? "fore"] }),
    };
  }
  if (sel.kind === "skylight") {
    const s = doc.skylights.find((x) => x.id === sel.id);
    if (!s) return { doc };
    return { doc: updateSkylight(doc, s.id, { size: [s.size[1], s.size[0]] }) };
  }
  if (sel.kind === "mounttile") {
    const t = doc.mountTiles?.find((x) => x.id === sel.id);
    if (!t) return { doc };
    return {
      doc: updateMountTile(doc, t.id, { facing: NEXT_FACING[t.facing] }),
    };
  }
  if (sel.kind === "fixture") {
    // Turn about the footprint centre.
    const f = fixturesOf(doc).find((x) => x.id === sel.id);
    if (!f) return { doc };
    const [w, h] = fixtureSize(f);
    return {
      doc: updateFixture(
        doc,
        f.id,
        fixtureCandidate(
          [f.at[0] + w / 2, f.at[1] + h / 2],
          f.design,
          NEXT_FACING[f.facing],
        ),
      ),
    };
  }
  return {
    doc,
    error:
      "Select a tile, interior module, mount tile, skylight, storage fixture or wall button to rotate",
  };
}

// ------------------------------------------------------------------ ids
/** Grammar element ids (volumes, rooms, edges, mounts, skylights, logic devices). */
export const ELEMENT_ID = /^[a-z0-9][a-z0-9._-]{0,79}$/;

/**
 * Rename an element. Ids are authored data: room ids become construction room ids and
 * mount ids name derived doors and sockets, so the Inspector lets authors set them exactly.
 */
export function renameElement(
  doc: Doc,
  sel: PrefabSelection,
  id: string,
): CommandResult {
  if (sel.kind === "tile") return { doc, error: "Tiles have no id" };
  if (sel.id === id) return { doc };
  if (!ELEMENT_ID.test(id))
    return {
      doc,
      error: "Ids use lower-case letters, digits, dots, dashes and underscores",
    };
  if (sel.kind === "logic") {
    const logic = doc.logic;
    if (!logic?.devices.some((d) => d.id === sel.id)) return { doc };
    if (logic.devices.some((d) => d.id === id))
      return { doc, error: `${id} is already used by another logic device` };
    // Wires keep their ids; their ends follow the device.
    const end = (e: PrefabLogicEndpoint) =>
      e.device === sel.id ? { ...e, device: id } : e;
    return {
      doc: withLogic(doc, {
        devices: logic.devices.map((d) => (d.id === sel.id ? { ...d, id } : d)),
        links: logic.links.map((l) => ({
          ...l,
          from: end(l.from),
          to: end(l.to),
        })),
      }),
      select: { kind: "logic", id },
    };
  }
  if (sel.kind === "mounttile") {
    const tiles = doc.mountTiles ?? [];
    if (!tiles.some((t) => t.id === sel.id)) return { doc };
    if (tiles.some((t) => t.id === id))
      return { doc, error: `${id} is already used by another mount tile` };
    // Linked items are renamed with their tile so they keep the <id>, <id>-a.. convention.
    const items = doc.mounts.filter((m) => m.tile === sel.id);
    const ids = tileItemIds(id, items.length);
    const clash = ids.find((x) =>
      doc.mounts.some((m) => m.id === x && m.tile !== sel.id),
    );
    if (clash) return { doc, error: `${clash} is already used by a mount` };
    return {
      doc: {
        ...doc,
        mountTiles: tiles.map((t) => (t.id === sel.id ? { ...t, id } : t)),
        mounts: doc.mounts.map((m) =>
          m.tile === sel.id ? { ...m, id: ids[items.indexOf(m)], tile: id } : m,
        ),
      },
      select: { kind: "mounttile", id },
    };
  }
  const key = (
    {
      volume: "volumes",
      room: "rooms",
      edge: "edges",
      mount: "mounts",
      skylight: "skylights",
      fixture: "fixtures",
    } as const
  )[sel.kind];
  const list = (doc[key] ?? []) as readonly { id: string }[];
  if (!list.some((x) => x.id === sel.id)) return { doc };
  if (list.some((x) => x.id === id))
    return { doc, error: `${id} is already used by another ${sel.kind}` };
  return {
    doc: {
      ...doc,
      [key]: list.map((x) => (x.id === sel.id ? { ...x, id } : x)),
    },
    select: { kind: sel.kind, id },
  };
}

/** F: reflect a tile. */
export function reflectSelection(
  doc: Doc,
  sel: PrefabSelection,
): CommandResult {
  if (sel.kind !== "tile") return { doc, error: "Select a tile to mirror" };
  const t = doc.volumes.find((v) => v.id === sel.volume)?.tiles[sel.index];
  if (!t) return { doc };
  return replaceTile(doc, sel.volume, sel.index, {
    ...t,
    reflected: !t.reflected,
  });
}
