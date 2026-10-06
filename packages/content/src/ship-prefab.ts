import { bowJoinErrors, bowWalkable } from "./bow-profiles";
import { interiorArtQuarterTurns } from "./ship-furniture";
import { fleetAccessDoorClearance } from "./fleet-access-physical";
import {
  isWayfarerAccessProfile,
  wayfarerAccessInterior,
} from "./wayfarer-access-profile";
import {
  assertWayfarerPrefabContract,
  isWayfarerGameplay,
  WAYFARER_MOUNT_POSES,
  wayfarerInterior,
} from "./wayfarer-authored-gameplay";
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
  ccw,
  fullCells,
  hash01,
  insideOutline,
  insidePolygon,
  mountSizeRank,
  outlineArea,
  placedTileSize,
  placedTilePolygon,
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
  MOUNT_TILE_KINDS,
  MOUNT_SIZE_IDS,
  type MountTileKind,
} from "./construction-grammar";
import {
  FACING_RADIANS,
  mountArc,
  mountTileAccepts,
  mountTileCapacity,
  mountTileHeightTexels,
  mountTileRequired,
  mountTileSlots,
  mountTileSpec,
  type MountArc,
} from "./ship-mount-tiles";
import {
  readPrefabLogic,
  validateLogicWiring,
  type PrefabLogic,
  type PrefabLogicDevice,
} from "./ship-logic";

export const SHIP_PREFAB_SCHEMA = "sidereal.ship-prefab.v1" as const;
export const SHIP_THEME_IDS = [
  "federation",
  "riftjack",
  "aurelian",
  "industrial",
  "crystalline",
] as const;
export type ShipThemeId = (typeof SHIP_THEME_IDS)[number];
export const EMBLEM_IDS = [
  "planet",
  "skull",
  "crystal",
  "gear",
  "none",
] as const;
export type EmblemId = (typeof EMBLEM_IDS)[number];

export const SHIP_PREFAB_LIMITS = {
  bytes: 262144,
  volumes: 32,
  tilesPerVolume: 2048,
  tiles: 4096,
  rooms: 96,
  edges: 512,
  mounts: 64,
  mountTiles: 32,
  skylights: 16,
  fixtures: 32,
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
  /**
   * Roof mount tile id (top mounts only). Weapons and sensors must sit on a tile in documents
   * that carry `mountTiles`; `at` then equals the tile's `at`, and several mounts on one tile are
   * its dual/quad configuration (slot order = document order).
   */
  tile?: string;
}

/**
 * Roof mount tile (owner 2026-09-29): a special roof tile that weapons and sensors mount on.
 * `fixed` fires along `facing` within a narrow cone; `turret` rotates (rest direction `facing`)
 * but carries one size smaller. Footprint: the size's N x N cells from `at` (min corner).
 */
export interface PrefabMountTile {
  id: string;
  kind: MountTileKind;
  size: MountSizeId;
  /** Footprint min corner (0.5 m snap). */
  at: [number, number];
  /** Fixed: boresight. Turret: rest direction. */
  facing: FaceNormal;
}

export interface PrefabSkylight {
  id: string;
  at: [number, number];
  size: [number, number];
}

/**
 * Deck furniture and storage a prefab places by hand, next to the ones its room types derive.
 * Fixtures use the same authored designs, collision and dressing as room sockets, with explicit
 * furniture envelopes large enough to preserve their native source proportions.
 * Storage designs also retain their operator-bound container; only placement is authored.
 */
export const PREFAB_FIXTURE_DESIGNS = [
  "shipyard.equipment.wall-locker",
  "cargo.standard.medium",
  "shipyard.equipment.medical-bed",
  "shipyard.equipment.lounge-sofa",
  "pale-studless.table.standard",
  "pale-studless.console.standard",
  "shipyard.equipment.bridge-bank",
  "shipyard.equipment.command-console",
  "pale-studless.kitchen.standard",
] as const;
export type PrefabFixtureDesign = (typeof PREFAB_FIXTURE_DESIGNS)[number];

export interface PrefabFixture {
  id: string;
  design: PrefabFixtureDesign;
  /** Footprint min corner (m, 0.05 m snap), deck 0. */
  at: [number, number];
  /** Access side, or operator view direction for consoles, as for derived room sockets. */
  facing: FaceNormal;
}

/** Explicit fixture envelope: [width along its wall, depth, height] in texels. */
export function fixtureDesignTexels(
  design: PrefabFixtureDesign,
): [number, number, number] {
  // Explicit fleet fixtures reserve the native study furniture's full plan envelope.
  // Auto-derived room sockets retain their original grammar dimensions/live pins.
  if (design === "shipyard.equipment.lounge-sofa") return [40, 26, 14];
  if (design === "shipyard.equipment.bridge-bank") return [32, 13, 22];
  for (const spec of Object.values(G.roomTypes))
    for (const [id, w, d, h] of spec.sockets)
      if (id === design) return [w, d, h];
  throw Error(`Fixture design ${design} is not a room-grammar socket`);
}

/** Plan footprint (m) of a fixture: its width runs along the wall it backs onto. */
export function fixtureSize(
  f: Pick<PrefabFixture, "design" | "facing">,
): [number, number] {
  const [w, d] = fixtureDesignTexels(f.design);
  const along = f.facing === "port" || f.facing === "starboard";
  return along ? [w * TEXEL, d * TEXEL] : [d * TEXEL, w * TEXEL];
}

export interface PrefabMarkings {
  name: string;
  number: string;
  emblem: EmblemId;
}

export interface ShipPrefabDocumentV1 {
  /** Exact code-owned geometry profile; never caller-supplied collider data. */
  authoredGameplay?: { id: "wayfarer-authored-r001"; revision: 1 | 2 };
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
  /**
   * Roof mount tiles. Present (even empty) = the 2026-09-29 mount rules apply: weapons and sensors
   * only on roof tiles, only propulsion on side/aft faces. Absent = a legacy document (Wren r2-r4)
   * that keeps validating under the rules it was pinned with.
   */
  mountTiles?: PrefabMountTile[];
  skylights: PrefabSkylight[];
  markings: PrefabMarkings;
  /**
   * Ship logic (wiki `Systems/Ship Logic`): signal devices (wall buttons, door actuators, airlock
   * controllers) and the wires between their ports. Absent = no logic: every actuated door stays
   * shut (Wren r2-r5 and the other developer prefabs until they are authored).
   */
  logic?: PrefabLogic;
  /**
   * Hand-placed storage deck objects (`PrefabFixture`). Absent = only the room-type sockets
   * (every prefab before Wren r8).
   */
  fixtures?: PrefabFixture[];
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
  /** Manoeuvring (RCS) thrust per direction (N); RCS clusters push in four plan directions. */
  maneuverThrustN?: number;
  powerGenerationW?: number;
  powerDrawW?: number;
  heatW?: number;
  heatRejectionW?: number;
  /** Crew station this component provides (pilot seats grant flight control). */
  station?: string | null;
  berths?: number;
  /** Visual asset reference resolved by the renderer. */
  visual?: { url: string; node?: string };
  /** Main drives: thrust reverser (N) opposite the forward axis (catalog revision 3+). */
  reverseThrustN?: number;
  /** The catalogue component has a `data` service port (logic actuators need one). */
  dataPort?: boolean;
  /** Weapons and sensors: the item's own arc (deg), tracking (deg/s) and range (m). */
  arcDeg?: number;
  trackingDegPerS?: number;
  rangeM?: number;
}

export interface PrefabComponentCatalog {
  revision: string;
  get(id: string): PrefabComponentSpec | undefined;
  list(): readonly PrefabComponentSpec[];
}

export function componentCatalogFrom(
  revision: string,
  specs: readonly PrefabComponentSpec[],
): PrefabComponentCatalog {
  const map = new Map(specs.map((s) => [s.id, s]));
  return { revision, get: (id) => map.get(id), list: () => specs };
}

// ---------------------------------------------------------------- strict admission
const ID = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const LABEL = /^[A-Za-z0-9 ._/'&-]{1,32}$/;

function fail(path: string, why: string): never {
  throw Error(`Invalid ship prefab ${path}: ${why}`);
}
function obj(
  v: unknown,
  path: string,
  keys: string[],
  optional: string[] = [],
): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v))
    fail(path, "expected an object");
  const o = v as Record<string, unknown>;
  for (const k of Object.keys(o))
    if (!keys.includes(k) && !optional.includes(k))
      fail(path, `unknown field ${k}`);
  for (const k of keys) if (!(k in o)) fail(path, `missing field ${k}`);
  return o;
}
function int(
  v: unknown,
  path: string,
  lo: number = -SHIP_PREFAB_LIMITS.coordinate,
  hi: number = SHIP_PREFAB_LIMITS.coordinate,
): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < lo || v > hi)
    fail(path, `expected an integer in [${lo}, ${hi}]`);
  return v;
}
function half(v: unknown, path: string): number {
  if (
    typeof v !== "number" ||
    !Number.isFinite(v) ||
    Math.abs(v) > SHIP_PREFAB_LIMITS.coordinate ||
    !Number.isInteger(v * 2)
  )
    fail(path, "expected a coordinate on the 0.5 m grid");
  return v;
}
function fine(v: unknown, path: string): number {
  if (
    typeof v !== "number" ||
    !Number.isFinite(v) ||
    Math.abs(v) > SHIP_PREFAB_LIMITS.coordinate ||
    Math.round(v * 20) / 20 !== v
  )
    fail(path, "expected a coordinate on the 0.05 m grid");
  return v;
}
function str(v: unknown, path: string, re: RegExp): string {
  if (typeof v !== "string" || !re.test(v)) fail(path, "invalid text");
  return v;
}
function oneOf<T extends string>(
  v: unknown,
  path: string,
  values: readonly T[],
): T {
  if (typeof v !== "string" || !values.includes(v as T))
    fail(path, `expected one of ${values.join(", ")}`);
  return v as T;
}
function arr(v: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(v) || v.length > max)
    fail(path, `expected an array of at most ${max}`);
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
  const o = obj(
    value,
    "document",
    [
      "schema",
      "id",
      "name",
      "revision",
      "description",
      "faction",
      "role",
      "theme",
      "sizeClass",
      "decks",
      "volumes",
      "rooms",
      "edges",
      "mounts",
      "skylights",
      "markings",
    ],
    ["mountTiles", "logic", "fixtures", "authoredGameplay"],
  );
  if (o.schema !== SHIP_PREFAB_SCHEMA)
    fail("schema", `expected ${SHIP_PREFAB_SCHEMA}`);
  const text = (v: unknown, p: string, max: number) => {
    if (typeof v !== "string" || v.length > max || /[\u0000-\u001f]/.test(v))
      fail(p, "invalid text");
    return v;
  };
  let tileCount = 0;
  const doc: ShipPrefabDocumentV1 = {
    ...(o.authoredGameplay === undefined
      ? {}
      : {
          authoredGameplay: (() => {
            const p = obj(o.authoredGameplay, "authoredGameplay", [
              "id",
              "revision",
            ]);
            if (
              p.id !== "wayfarer-authored-r001" ||
              (p.revision !== 1 && p.revision !== 2) ||
              o.id !== "fed.m.wayfarer"
            )
              fail("authoredGameplay", "unknown profile or prefab");
            return {
              id: "wayfarer-authored-r001" as const,
              revision: p.revision as 1 | 2,
            };
          })(),
        }),
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
      return {
        index: int(r.index, `decks[${i}].index`, 0, 7),
        name: str(r.name, `decks[${i}].name`, LABEL),
      };
    }),
    volumes: arr(o.volumes, "volumes", SHIP_PREFAB_LIMITS.volumes).map(
      (v, i) => {
        const p = `volumes[${i}]`;
        const r = obj(
          v,
          p,
          ["id", "kind", "height", "deck", "tiles"],
          ["spine", "logo", "faceStyle"],
        );
        const tiles = arr(
          r.tiles,
          `${p}.tiles`,
          SHIP_PREFAB_LIMITS.tilesPerVolume,
        ).map((t, j) => {
          const q = obj(
            t,
            `${p}.tiles[${j}]`,
            ["x", "y", "shape", "rot", "reflected"],
            ["bow"],
          );
          let bow: ShapeTilePlacement["bow"];
          if (q.bow !== undefined) {
            const v = obj(q.bow, `${p}.tiles[${j}].bow`, ["step", "axis"]);
            bow = {
              step: int(v.step, "bow.step", 0, 3) as 0 | 1 | 2 | 3,
              axis: int(v.axis, "bow.axis", 0, 3) as 0 | 1 | 2 | 3,
            };
          }
          if (typeof q.reflected !== "boolean")
            fail(`${p}.tiles[${j}].reflected`, "expected boolean");
          return {
            x: int(q.x, `${p}.tiles[${j}].x`),
            y: int(q.y, `${p}.tiles[${j}].y`),
            shape: oneOf(q.shape, `${p}.tiles[${j}].shape`, SHAPE_TILE_IDS),
            rot: int(q.rot, `${p}.tiles[${j}].rot`, 0, 3) as 0 | 1 | 2 | 3,
            reflected: q.reflected,
            ...(bow ? { bow } : {}),
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
          if (typeof r.spine !== "boolean")
            fail(`${p}.spine`, "expected boolean");
          out.spine = r.spine;
        }
        if (r.logo !== undefined) {
          if (typeof r.logo !== "boolean")
            fail(`${p}.logo`, "expected boolean");
          out.logo = r.logo;
        }
        if (r.faceStyle !== undefined)
          out.faceStyle = oneOf(r.faceStyle, `${p}.faceStyle`, [
            "default",
            "windows",
          ] as const);
        return out;
      },
    ),
    rooms: arr(o.rooms, "rooms", SHIP_PREFAB_LIMITS.rooms).map((v, i) => {
      const p = `rooms[${i}]`;
      const r = obj(v, p, ["id", "label", "type", "deck", "rect"]);
      const rect = arr(r.rect, `${p}.rect`, 4).map((n, k) =>
        int(n, `${p}.rect[${k}]`),
      );
      if (rect.length !== 4 || rect[2] <= rect[0] || rect[3] <= rect[1])
        fail(`${p}.rect`, "expected [x0, y0, x1, y1] with x1 > x0, y1 > y0");
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
      const type = oneOf(r.type, `${p}.type`, EDGE_TYPE_IDS);
      // Exterior runs (canopy) join two hull outline vertices in any direction; lattice edges are axis-aligned.
      if (
        G.edgeTypes[type].exterior
          ? a[0] === b[0] && a[1] === b[1]
          : (a[0] !== b[0]) === (a[1] !== b[1])
      )
        fail(
          p,
          G.edgeTypes[type].exterior
            ? "canopy run needs two distinct outline vertices"
            : "edge must be axis-aligned with non-zero length",
        );
      return {
        id: str(r.id, `${p}.id`, ID),
        deck: int(r.deck, `${p}.deck`, 0, 7),
        a,
        b,
        type,
      };
    }),
    mounts: arr(o.mounts, "mounts", SHIP_PREFAB_LIMITS.mounts).map((v, i) => {
      const p = `mounts[${i}]`;
      const r = obj(
        v,
        p,
        ["id", "component", "attach", "at"],
        ["normal", "z", "tile"],
      );
      const at = arr(r.at, `${p}.at`, 2);
      if (at.length !== 2) fail(`${p}.at`, "expected [x, y]");
      const m: PrefabMount = {
        id: str(r.id, `${p}.id`, ID),
        component: str(
          r.component,
          `${p}.component`,
          /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/,
        ),
        attach: oneOf(r.attach, `${p}.attach`, [
          "top",
          "face",
          "edge",
          "interior",
        ] as const),
        at: [half(at[0], `${p}.at[0]`), half(at[1], `${p}.at[1]`)],
      };
      if (r.normal !== undefined)
        m.normal = oneOf(r.normal, `${p}.normal`, FACE_NORMALS);
      if (r.z !== undefined) m.z = int(r.z, `${p}.z`, -64, 128);
      if ((m.attach === "face" || m.attach === "edge") && !m.normal)
        fail(p, `${m.attach} mounts need a normal`);
      if (m.attach === "edge" && m.z !== undefined)
        fail(p, "edge mounts take no z");
      if (m.attach === "top" && (m.normal !== undefined || m.z !== undefined))
        fail(p, "top mounts take no normal or z");
      if (m.attach === "interior" && m.z !== undefined)
        fail(p, "interior mounts take no z");
      if (r.tile !== undefined) {
        m.tile = str(r.tile, `${p}.tile`, ID);
        if (m.attach !== "top") fail(p, "only top mounts sit on a mount tile");
        if (!Array.isArray(o.mountTiles))
          fail(p, "tile mounts need the document's mountTiles");
      }
      return m;
    }),
    ...(o.mountTiles === undefined
      ? {}
      : {
          mountTiles: arr(
            o.mountTiles,
            "mountTiles",
            SHIP_PREFAB_LIMITS.mountTiles,
          ).map((v, i) => {
            const p = `mountTiles[${i}]`;
            const r = obj(v, p, ["id", "kind", "size", "at", "facing"]);
            const at = arr(r.at, `${p}.at`, 2);
            if (at.length !== 2) fail(`${p}.at`, "expected [x, y]");
            const t: PrefabMountTile = {
              id: str(r.id, `${p}.id`, ID),
              kind: oneOf(r.kind, `${p}.kind`, MOUNT_TILE_KINDS),
              size: oneOf(r.size, `${p}.size`, MOUNT_SIZE_IDS),
              at: [half(at[0], `${p}.at[0]`), half(at[1], `${p}.at[1]`)],
              facing: oneOf(r.facing, `${p}.facing`, FACE_NORMALS),
            };
            if (!mountTileSpec(t.kind, t.size))
              fail(p, `there is no ${t.size} ${t.kind} mount tile`);
            return t;
          }),
        }),
    skylights: arr(o.skylights, "skylights", SHIP_PREFAB_LIMITS.skylights).map(
      (v, i) => {
        const p = `skylights[${i}]`;
        const r = obj(v, p, ["id", "at", "size"]);
        const at = arr(r.at, `${p}.at`, 2);
        const size = arr(r.size, `${p}.size`, 2);
        const s: [number, number] = [
          int(size[0], `${p}.size[0]`, 2, 3),
          int(size[1], `${p}.size[1]`, 2, 3),
        ];
        return {
          id: str(r.id, `${p}.id`, ID),
          at: [int(at[0], `${p}.at[0]`), int(at[1], `${p}.at[1]`)],
          size: s,
        };
      },
    ),
    markings: (() => {
      const r = obj(o.markings, "markings", ["name", "number", "emblem"]);
      return {
        name: str(r.name, "markings.name", /^[A-Z0-9 ._/-]{0,16}$/),
        number: str(r.number, "markings.number", /^[A-Z0-9 ._/-]{0,10}$/),
        emblem: oneOf(r.emblem, "markings.emblem", EMBLEM_IDS),
      };
    })(),
  };
  if (o.logic !== undefined) doc.logic = readPrefabLogic(o.logic);
  if (o.fixtures !== undefined)
    doc.fixtures = arr(o.fixtures, "fixtures", SHIP_PREFAB_LIMITS.fixtures).map(
      (v, i) => {
        const p = `fixtures[${i}]`;
        const r = obj(v, p, ["id", "design", "at", "facing"]);
        const at = arr(r.at, `${p}.at`, 2);
        if (at.length !== 2) fail(`${p}.at`, "expected [x, y]");
        return {
          id: str(r.id, `${p}.id`, ID),
          design: oneOf(r.design, `${p}.design`, PREFAB_FIXTURE_DESIGNS),
          at: [fine(at[0], `${p}.at[0]`), fine(at[1], `${p}.at[1]`)],
          facing: oneOf(r.facing, `${p}.facing`, FACE_NORMALS),
        };
      },
    );
  if (tileCount > SHIP_PREFAB_LIMITS.tiles) fail("volumes", "too many tiles");
  uniq(
    doc.volumes.map((v) => v.id),
    "volumes",
  );
  uniq(
    doc.rooms.map((v) => v.id),
    "rooms",
  );
  uniq(
    doc.edges.map((v) => v.id),
    "edges",
  );
  uniq(
    doc.mounts.map((v) => v.id),
    "mounts",
  );
  uniq(
    doc.skylights.map((v) => v.id),
    "skylights",
  );
  if (doc.fixtures)
    uniq(
      doc.fixtures.map((v) => v.id),
      "fixtures",
    );
  if (doc.mountTiles) {
    uniq(
      doc.mountTiles.map((v) => v.id),
      "mountTiles",
    );
    const tiles = new Set(doc.mountTiles.map((t) => t.id));
    for (const m of doc.mounts)
      if (m.tile !== undefined && !tiles.has(m.tile))
        fail(`mounts.${m.id}`, `unknown mount tile ${m.tile}`);
  }
  if (isWayfarerGameplay(doc)) assertWayfarerPrefabContract(doc);
  return doc;
}

export function parseShipPrefabJson(json: string): ShipPrefabDocumentV1 {
  if (json.length > SHIP_PREFAB_LIMITS.bytes)
    throw Error("Ship prefab exceeds the size limit");
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
  const outline = u.outers.length
    ? { outer: u.outers[0], holes: u.holes }
    : null;
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
    area:
      u.outers.reduce((s, o) => s + outlineArea({ outer: o, holes: [] }), 0) -
      (outline
        ? outline.holes.reduce(
            (s, h) => s + outlineArea({ outer: h, holes: [] }),
            0,
          )
        : 0),
    bounds: xs.length
      ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
      : [0, 0, 0, 0],
  };
}

export function prefabBounds(
  geoms: readonly VolumeGeometry[],
): [number, number, number, number] {
  const b = geoms.filter((g) => g.volume.tiles.length).map((g) => g.bounds);
  if (!b.length) return [0, 0, 0, 0];
  return [
    Math.min(...b.map((v) => v[0])),
    Math.min(...b.map((v) => v[1])),
    Math.max(...b.map((v) => v[2])),
    Math.max(...b.map((v) => v[3])),
  ];
}

/** Ship origin used by rendering and authority: centre of the structure bounding box. */
export function prefabOrigin(doc: ShipPrefabDocumentV1): [number, number] {
  if (isWayfarerGameplay(doc)) return [0, 0];
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

const FORWARD_QT: Record<FaceNormal, 0 | 1 | 2 | 3> = {
  fore: 0,
  port: 1,
  aft: 2,
  starboard: 3,
};
const OPPOSITE_FACING: Record<FaceNormal, FaceNormal> = {
  fore: "aft",
  aft: "fore",
  port: "starboard",
  starboard: "port",
};
const OUTWARD_QT: Record<FaceNormal, 0 | 1 | 2 | 3> = {
  aft: 0,
  starboard: 1,
  fore: 2,
  port: 3,
};

/** Plan extents (X, Y) of a footprint whose component frame is turned by qt. */
function planExtent(cells: [number, number], qt: number): [number, number] {
  return qt % 2 ? [cells[0], cells[1]] : [cells[1], cells[0]];
}

export interface MountTilePlacement {
  tile: PrefabMountTile;
  /** Plan footprint [x0, y0, x1, y1] (m). */
  rect: [number, number, number, number];
  /** Tile centre (m); the Blender kit piece origin. */
  centre: [number, number];
  /** Roof plane and top interface plane (texels). Items stand on z[1]. */
  z: [number, number];
  /** Kit piece rotation (degrees, counter-clockwise): the piece's +Y is its boresight. */
  rotDeg: number;
  /** Roof volume the tile stands on (highest volume under its centre). */
  host: string | null;
}

/** Kit piece rotation per facing: piece +Y (boresight) -> plan direction. */
const TILE_ROT_DEG: Record<FaceNormal, number> = {
  port: 0,
  aft: 90,
  starboard: 180,
  fore: 270,
};

export function placeMountTile(
  tile: PrefabMountTile,
  geoms: readonly VolumeGeometry[],
): MountTilePlacement {
  const n = G.mountSizes[tile.size].cells;
  const [x, y] = tile.at;
  const centre: [number, number] = [x + n / 2, y + n / 2];
  let host: VolumeGeometry | null = null;
  for (const g of geoms)
    if (
      g.outline &&
      insideOutline(g.outline, centre[0], centre[1]) &&
      (!host || g.z[1] > host.z[1])
    )
      host = g;
  const z0 = host ? host.z[1] : G.deck.roofTexels;
  return {
    tile,
    rect: [x, y, x + n, y + n],
    centre,
    z: [z0, z0 + mountTileHeightTexels(tile.kind)],
    rotDeg: TILE_ROT_DEG[tile.facing],
    host: host?.volume.id ?? null,
  };
}

/** Mounts carried by a tile, in slot order (document order). */
export function tileMounts(
  doc: Pick<ShipPrefabDocumentV1, "mounts">,
  tileId: string,
): PrefabMount[] {
  return doc.mounts.filter((m) => m.tile === tileId);
}

/** Tile context for placing tile mounts: the document's tiles and mounts. */
export type MountTileContext = Pick<
  ShipPrefabDocumentV1,
  "mounts" | "mountTiles"
> &
  Partial<Pick<ShipPrefabDocumentV1, "id" | "authoredGameplay">>;

export function placeMount(
  mount: PrefabMount,
  spec: PrefabComponentSpec | undefined,
  geoms: readonly VolumeGeometry[],
  ctx?: MountTileContext,
): MountPlacement {
  if (ctx?.id && isWayfarerGameplay(ctx as ShipPrefabDocumentV1)) {
    const accessOuter =
      isWayfarerAccessProfile(ctx as ShipPrefabDocumentV1) &&
      (mount.id === "personnel-outer" || mount.id === "cargo-outer");
    const nativePose = WAYFARER_MOUNT_POSES[mount.id];
    const accessRcs =
      isWayfarerAccessProfile(ctx as ShipPrefabDocumentV1) &&
      mount.id === "rcs-stern-p" &&
      mount.attach === "face" &&
      mount.normal === "port";
    const pose =
      (accessRcs && nativePose
        ? { ...nativePose, at: mount.at }
        : nativePose) ??
      (accessOuter && mount.attach === "edge"
        ? { at: mount.at, z: 0.1875, quarterTurns: 3 as const }
        : undefined);
    if (!pose) throw Error(`Unknown authored Wayfarer mount ${mount.id}`);
    const width = spec?.cells[0] ?? 1,
      depth = spec?.cells[1] ?? 1;
    return {
      mount,
      spec,
      rect: [
        pose.at[0] - (accessOuter ? width : depth) / 2,
        pose.at[1] - (accessOuter ? depth : width) / 2,
        pose.at[0] + (accessOuter ? width : depth) / 2,
        pose.at[1] + (accessOuter ? depth : width) / 2,
      ],
      z: [pose.z * 16, pose.z * 16 + (spec?.heightTexels ?? 16)],
      quarterTurns: pose.quarterTurns,
      anchor: [...pose.at],
      anchorZ: pose.z * 16,
      host: "hull",
      rear: mount.normal === "aft",
    };
  }
  const tile =
    mount.tile !== undefined
      ? ctx?.mountTiles?.find((t) => t.id === mount.tile)
      : undefined;
  if (tile && mount.attach === "top")
    return placeTileMount(mount, spec, tile, geoms, ctx!);
  const fallback = spec ? G.mountSizes[spec.sizeClass].cells : 1;
  const cells: [number, number] = spec
    ? [Math.max(spec.cells[0], 1), Math.max(spec.cells[1], 1)]
    : [fallback, fallback];
  const heightT = spec?.heightTexels ?? cells[0] * 16;
  if (mount.attach === "top" || mount.attach === "interior") {
    const qt = mount.attach === "top" ? 0 : FORWARD_QT[mount.normal ?? "fore"];
    const [ex, ey] = planExtent(cells, qt);
    const [x, y] = mount.at;
    const rect: [number, number, number, number] = [x, y, x + ex, y + ey];
    const anchor: [number, number] = [x + ex / 2, y + ey / 2];
    if (mount.attach === "interior")
      return {
        mount,
        spec,
        rect,
        z: [G.deck.floorTopTexels, G.deck.floorTopTexels + heightT],
        quarterTurns: qt,
        anchor,
        anchorZ: G.deck.floorTopTexels,
        host: null,
        rear: false,
      };
    let host: VolumeGeometry | null = null;
    for (const g of geoms)
      if (
        g.outline &&
        insideOutline(g.outline, anchor[0], anchor[1]) &&
        (!host || g.z[1] > host.z[1])
      )
        host = g;
    const z0 = host ? host.z[1] : G.deck.roofTexels;
    return {
      mount,
      spec,
      rect,
      z: [z0, z0 + heightT],
      quarterTurns: 0,
      anchor,
      anchorZ: z0,
      host: host?.volume.id ?? null,
      rear: false,
    };
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
      if (
        mount.at[along] - width / 2 >= flo - 1e-6 &&
        mount.at[along] + width / 2 <= fhi + 1e-6
      )
        host = g;
    }
    if (host) break;
  }
  const band = host?.z ?? G.heightClasses.deck.z;
  const z0 =
    mount.attach === "edge"
      ? G.deck.floorTopTexels
      : (mount.z ?? band[0] + Math.floor((band[1] - band[0] - heightT) / 2));
  return {
    mount,
    spec,
    rect,
    z: [z0, z0 + heightT],
    quarterTurns: OUTWARD_QT[normal],
    anchor: [mount.at[0], mount.at[1]],
    anchorZ: z0 + heightT / 2,
    host: host?.volume.id ?? null,
    rear: normal === "aft",
  };
}

/**
 * An item on a roof mount tile: it stands on the tile's top plane at its slot, turned so its
 * forward (+Y) points along the tile facing (the boresight or turret rest direction).
 */
function placeTileMount(
  mount: PrefabMount,
  spec: PrefabComponentSpec | undefined,
  tile: PrefabMountTile,
  geoms: readonly VolumeGeometry[],
  ctx: MountTileContext,
): MountPlacement {
  const tp = placeMountTile(tile, geoms);
  const on = tileMounts(ctx, tile.id);
  const slots = mountTileSlots(tile.size, on.length);
  const slot = slots[Math.max(0, on.indexOf(mount))] ?? [0, 0];
  const b = FACING_RADIANS[tile.facing];
  // Tile frame: along = boresight, across = its left (counter-clockwise).
  const ax = Math.cos(b),
    ay = Math.sin(b);
  const anchor: [number, number] = [
    tp.centre[0] + slot[1] * ax - slot[0] * ay,
    tp.centre[1] + slot[1] * ay + slot[0] * ax,
  ];
  const qt = FORWARD_QT[tile.facing];
  const cells: [number, number] = spec
    ? [Math.max(spec.cells[0], 1), Math.max(spec.cells[1], 1)]
    : [1, 1];
  const [ex, ey] = planExtent(cells, qt);
  const heightT = spec?.heightTexels ?? cells[0] * 16;
  const z0 = tp.z[1];
  return {
    mount,
    spec,
    rect: [
      anchor[0] - ex / 2,
      anchor[1] - ey / 2,
      anchor[0] + ex / 2,
      anchor[1] + ey / 2,
    ],
    z: [z0, z0 + heightT],
    quarterTurns: qt,
    anchor,
    anchorZ: z0,
    host: tp.host,
    rear: false,
  };
}

/** Fire (or sensor) arc of every tile-mounted weapon and sensor. Recorded for ship-weapon fire. */
export interface PrefabMountArc extends MountArc {
  mount: string;
  tile: string;
  component: string;
  category: string;
  /** Plan position of the item (m, prefab frame). */
  at: [number, number];
  rangeM: number;
  /** Linked items fire together; this is the number on the tile. */
  linked: number;
}

export function prefabMountArcs(
  doc: ShipPrefabDocumentV1,
  catalog: PrefabComponentCatalog,
): PrefabMountArc[] {
  if (!doc.mountTiles) return [];
  const geoms = doc.volumes.map(volumeGeometry);
  const out: PrefabMountArc[] = [];
  for (const tile of doc.mountTiles) {
    const on = tileMounts(doc, tile.id);
    for (const m of on) {
      const spec = catalog.get(m.component);
      if (!spec) continue;
      const arc = mountArc(tile.kind, tile.size, tile.facing, spec);
      out.push({
        ...arc,
        mount: m.id,
        tile: tile.id,
        component: m.component,
        category: spec.category,
        at: placeMount(m, spec, geoms, doc).anchor,
        rangeM: spec.rangeM ?? 0,
        linked: on.length,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------- approach zones
/** Door jamb kept inside each end of a 2 m door module (1.5 m clear opening). */
export const DOOR_JAMB_M = 0.25;
/** Keep-clear depth in front of a door's clear opening on each walkable side: one 0.6 m body plus margin. */
export const DOOR_APPROACH_DEPTH_M = 0.7;
/** Pilot approach: 0.875 m aft of the station (sim `prefabPilotPose`), kept clear as a square. */
/** Furniture may clip an approach zone corner by this much before it is moved. */
export const SOCKET_APPROACH_TOLERANCE_M = 0.1;
export const PILOT_APPROACH_OFFSET_M = 0.875;
export const PILOT_APPROACH_HALF_M = 0.4;
type Rect4 = [number, number, number, number];
export interface ApproachZone {
  /** Door id, or "pilot-approach". */
  id: string;
  /** Plan rectangle [x0, y0, x1, y1] (m). */
  rect: [number, number, number, number];
}
/** True when two plan rectangles share positive area (touching edges do not overlap). */
export function planRectsOverlap(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number],
  eps = 1e-6,
): boolean {
  return (
    a[0] < b[2] - eps &&
    b[0] < a[2] - eps &&
    a[1] < b[3] - eps &&
    b[1] < a[3] - eps
  );
}
/**
 * Plan rectangles that must stay walkable so furniture can never seal a door or the pilot seat:
 * the clear opening of every axis-aligned door extended DOOR_APPROACH_DEPTH_M into each side that
 * has floor (exterior hatches: the inside only), plus the pilot approach square.
 */
export function deckApproachZones(
  doors: readonly DerivedDoor[],
  station: readonly [number, number] | null,
  walkable: (x: number, y: number) => boolean,
): ApproachZone[] {
  const zones: ApproachZone[] = [];
  for (const d of doors) {
    const horizontal = Math.abs(d.a[1] - d.b[1]) < 1e-9;
    const vertical = Math.abs(d.a[0] - d.b[0]) < 1e-9;
    if (horizontal === vertical) continue;
    const along = horizontal ? 0 : 1;
    const lo = Math.min(d.a[along], d.b[along]) + DOOR_JAMB_M;
    const hi = Math.max(d.a[along], d.b[along]) - DOOR_JAMB_M;
    if (hi <= lo) continue;
    const line = horizontal ? d.a[1] : d.a[0];
    const mid = (lo + hi) / 2;
    for (const side of [-1, 1]) {
      const probe = line + side * 0.5;
      if (!(horizontal ? walkable(mid, probe) : walkable(probe, mid))) continue;
      const n0 = Math.min(line, line + side * DOOR_APPROACH_DEPTH_M);
      const n1 = Math.max(line, line + side * DOOR_APPROACH_DEPTH_M);
      zones.push({
        id: d.id,
        rect: horizontal ? [lo, n0, hi, n1] : [n0, lo, n1, hi],
      });
    }
  }
  if (station) {
    const x = station[0] - PILOT_APPROACH_OFFSET_M;
    const y = station[1];
    zones.push({
      id: "pilot-approach",
      rect: [
        x - PILOT_APPROACH_HALF_M,
        y - PILOT_APPROACH_HALF_M,
        x + PILOT_APPROACH_HALF_M,
        y + PILOT_APPROACH_HALF_M,
      ],
    });
  }
  return zones;
}

// ---------------------------------------------------------------- interior derivation
export interface DerivedFloor {
  cell: [number, number];
  /** Exact supported rectangle for native boundary fragments; otherwise a 1m cell. */
  extentM?: readonly [number, number];
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
  /** Code-owned native profile clear width; absent retains the generic jamb rule. */
  clearWidthM?: number;
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
  /** Id of the hand-placed `doc.fixtures` entry; absent for room-type furniture. */
  fixture?: string;
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
  exteriorSlopes: { a: Pt; b: Pt; room: string | null; glass?: boolean }[];
  partitions: DerivedEdge[];
  doors: DerivedDoor[];
  posts: Pt[];
  sockets: DerivedSocket[];
  lights: {
    room: string;
    at: [number, number];
    colour: [number, number, number];
    area: number;
  }[];
  labels: { room: string; text: string; at: [number, number] }[];
  compartments: DerivedCompartment[];
  /** Pilot station (control seat centre, metres) when a control room exists. */
  station: { at: [number, number]; room: string } | null;
}

/**
 * Outline segments covered by canopy edges (type "canopy"): each runs counter-clockwise along the
 * loop from vertex a to vertex b. Axis segments are split into whole metres like exterior walls.
 */
export function canopySegments(
  doc: ShipPrefabDocumentV1,
  loop: readonly Pt[],
): [Pt, Pt][] {
  const out: [Pt, Pt][] = [];
  const at = (p: readonly number[]) =>
    loop.findIndex(
      (q) => Math.abs(q[0] - p[0]) < 1e-6 && Math.abs(q[1] - p[1]) < 1e-6,
    );
  for (const e of doc.edges) {
    if (!G.edgeTypes[e.type]?.exterior) continue;
    const ia = at(e.a);
    const ib = at(e.b);
    if (ia < 0 || ib < 0 || ia === ib) continue;
    for (let i = ia; i !== ib; i = (i + 1) % loop.length) {
      const p = loop[i];
      const q = loop[(i + 1) % loop.length];
      const axis = Math.abs(p[0] - q[0]) < 1e-9 || Math.abs(p[1] - q[1]) < 1e-9;
      const whole = [p, q].every(
        (v) =>
          Math.abs(v[0] - Math.round(v[0])) < 1e-9 &&
          Math.abs(v[1] - Math.round(v[1])) < 1e-9,
      );
      if (axis && whole) out.push(...unitSegments(p, q));
      else out.push([p, q]);
    }
  }
  return out;
}

const ekey = (a: Pt, b: Pt) => {
  const [p, q] =
    a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]) ? [a, b] : [b, a];
  return `${p[0]},${p[1]}|${q[0]},${q[1]}`;
};

function unitSegments(a: Pt, b: Pt): [Pt, Pt][] {
  const out: [Pt, Pt][] = [];
  const L = Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]));
  const d: Pt = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  for (let u = 0; u < L; u++)
    out.push([
      [a[0] + d[0] * u, a[1] + d[1] * u],
      [a[0] + d[0] * (u + 1), a[1] + d[1] * (u + 1)],
    ]);
  return out;
}

/** Rooms and the cells they own on the deck volume (rect clipped to the outline). */
export function roomCells(
  room: PrefabRoom,
  outline: Outline,
): [number, number][] {
  const out: [number, number][] = [];
  const [x0, y0, x1, y1] = room.rect;
  for (let x = x0; x < x1; x++)
    for (let y = y0; y < y1; y++) {
      const pts: Pt[] = [
        [x + 0.5, y + 0.5],
        [x + 0.1, y + 0.1],
        [x + 0.9, y + 0.1],
        [x + 0.1, y + 0.9],
        [x + 0.9, y + 0.9],
      ];
      if (pts.some(([px, py]) => insideOutline(outline, px, py)))
        out.push([x, y]);
    }
  return out;
}

export function deckVolume(
  doc: ShipPrefabDocumentV1,
  deck = 0,
): VolumeGeometry | null {
  const g = doc.volumes
    .filter(
      (v) =>
        v.kind === "hull" &&
        v.deck === deck &&
        G.heightClasses[v.height].walkable,
    )
    .map(volumeGeometry);
  return g.find((x) => x.outline) ?? null;
}

export function deriveInterior(
  doc: ShipPrefabDocumentV1,
  deck = 0,
  catalog?: PrefabComponentCatalog,
): DerivedInterior {
  if (isWayfarerGameplay(doc)) {
    const native = wayfarerInterior(deck);
    return isWayfarerAccessProfile(doc)
      ? wayfarerAccessInterior(native)
      : native;
  }
  const empty: DerivedInterior = {
    deck,
    volume: null,
    floors: [],
    exteriorWalls: [],
    exteriorSlopes: [],
    partitions: [],
    doors: [],
    posts: [],
    sockets: [],
    lights: [],
    labels: [],
    compartments: [],
    station: null,
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
      // Low roof bands remain part of the pressure room, but are not standing floors.
      if (
        vg.volume.tiles.some(
          (t) =>
            t.bow &&
            !bowWalkable(t, vg.volume.height) &&
            insidePolygon(placedTilePolygon(t), x + 0.5, y + 0.5),
        )
      )
        continue;
      floors.push({
        cell: [x, y],
        kind: G.roomTypes[room.type].floor,
        room: room.id,
        partial: !full.has(k),
      });
    }
  const roomAt = (x: number, y: number) =>
    cellRoom.get(`${Math.floor(x)},${Math.floor(y)}`) ?? null;

  // Exterior walls along the outline (outer + holes), inward. Canopy runs are glazed and seal.
  const glassRuns = [outline.outer, ...outline.holes].flatMap((loop) =>
    canopySegments(doc, loop),
  );
  const glass = {
    has: (a: Pt, b: Pt) =>
      glassRuns.some(([p, q]) => {
        const [dx, dy] = [q[0] - p[0], q[1] - p[1]];
        const L2 = dx * dx + dy * dy;
        const on = (v: Pt) =>
          Math.abs(dx * (v[1] - p[1]) - dy * (v[0] - p[0])) <
            1e-6 * Math.sqrt(L2) &&
          (dx * (v[0] - p[0]) + dy * (v[1] - p[1])) / L2 > -1e-6 &&
          (dx * (v[0] - p[0]) + dy * (v[1] - p[1])) / L2 < 1 + 1e-6;
        return L2 > 1e-9 && on(a) && on(b);
      }),
  };
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
      if (
        !axis ||
        Math.abs(p[0] - Math.round(p[0])) > 1e-9 ||
        Math.abs(p[1] - Math.round(p[1])) > 1e-9
      ) {
        const mid: Pt = [
          (p[0] + q[0]) / 2 + left[0] * 0.3,
          (p[1] + q[1]) / 2 + left[1] * 0.3,
        ];
        exteriorSlopes.push({
          a: p,
          b: q,
          room: roomAt(mid[0], mid[1])?.id ?? null,
          glass: glass.has(p, q),
        });
        continue;
      }
      for (const [a, b] of unitSegments(p, q)) {
        const mid: Pt = [
          (a[0] + b[0]) / 2 + left[0] * 0.5,
          (a[1] + b[1]) / 2 + left[1] * 0.5,
        ];
        const room = roomAt(mid[0], mid[1]);
        const styles = room
          ? G.roomTypes[room.type].walls
          : (["wall"] as WallVariantId[]);
        const variant =
          hash01("ext2", a[0], a[1]) < 0.7
            ? styles[Math.floor(hash01("ext", a[0], a[1]) * styles.length)]
            : "wall";
        exteriorKeys.add(ekey(a, b));
        const glazed = glass.has(a, b);
        exteriorWalls.push({
          a,
          b,
          type: glazed ? "canopy" : "wall.full",
          variant: glazed ? "glazed" : variant,
          rooms: [room?.id ?? null, null],
          exterior: true,
        });
      }
    }
  }

  // Edge features on this deck, split into unit segments.
  const features = doc.edges.filter((e) => e.deck === deck);
  const doorFeatures = features.filter((e) => G.edgeTypes[e.type].door);
  const overrideFeatures = features.filter((e) => !G.edgeTypes[e.type].door);
  const doorKeys = new Map<string, PrefabEdge>();
  for (const e of doorFeatures)
    for (const [a, b] of unitSegments(e.a, e.b)) doorKeys.set(ekey(a, b), e);
  const overrideKeys = new Map<string, PrefabEdge>();
  for (const e of overrideFeatures)
    for (const [a, b] of unitSegments(e.a, e.b))
      overrideKeys.set(ekey(a, b), e);

  // Partitions: unit edges between two different room cells (or a room and a void cell) inside the hull.
  const partitions: DerivedEdge[] = [];
  const vertexDirs = new Map<string, string[]>();
  const addDir = (v: Pt, d: string) => {
    const k = `${v[0]},${v[1]}`;
    if (!vertexDirs.has(k)) vertexDirs.set(k, []);
    vertexDirs.get(k)!.push(d);
  };
  const seen = new Set<string>();
  const cells = [...cellRoom.keys()]
    .map((k) => k.split(",").map(Number) as [number, number])
    .sort((m, n) => m[0] - n[0] || m[1] - n[1]);
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
      if (
        !insideOutline(outline, mid[0] + normal[0], mid[1] + normal[1]) ||
        !insideOutline(outline, mid[0] - normal[0], mid[1] - normal[1])
      )
        continue;
      if (doorKeys.has(k)) {
        addDir(a, "door");
        addDir(b, "door");
        continue;
      }
      const ov = overrideKeys.get(k);
      const types = [here.type, other?.type].filter(Boolean) as RoomTypeId[];
      const host = types.filter((t) => t !== "corridor")[0] ?? types[0];
      const styles = G.roomTypes[host].walls;
      let variant =
        styles[Math.floor(hash01("part", a[0], a[1]) * styles.length)];
      if (types.includes("corridor") && hash01("cl", a[0], a[1]) < 0.35)
        variant = "light";
      const type: EdgeTypeId = ov ? ov.type : "wall.full";
      if (type === "open") continue;
      partitions.push({
        a,
        b,
        type,
        variant,
        rooms: [here.id, other?.id ?? null],
        exterior: false,
      });
      addDir(a, a[1] === b[1] ? "h" : "v");
      addDir(b, a[1] === b[1] ? "h" : "v");
    }
  }

  const doors: DerivedDoor[] = doorFeatures.map((e) => {
    const [a, b] = [e.a as Pt, e.b as Pt];
    const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const n: Pt = a[1] === b[1] ? [0, 0.5] : [0.5, 0];
    const r1 = roomAt(
      mid[0] + n[0] - (a[1] === b[1] ? 0.5 : 0),
      mid[1] + n[1] - (a[1] === b[1] ? 0 : 0.5),
    );
    const r2 = roomAt(
      mid[0] - n[0] - (a[1] === b[1] ? 0.5 : 0),
      mid[1] - n[1] - (a[1] === b[1] ? 0 : 0.5),
    );
    const exterior = unitSegments(a, b).every(([p, q]) =>
      exteriorKeys.has(ekey(p, q)),
    );
    return {
      id: e.id,
      a,
      b,
      type: e.type,
      rooms: [r1?.id ?? null, r2?.id ?? null],
      exterior,
    };
  });
  // Edge mounts (exterior airlocks, cargo doors) open the exterior wall they sit on.
  for (const m of doc.mounts) {
    if (m.attach !== "edge" || !m.normal) continue;
    const spec = catalog?.get(m.component);
    const width = spec ? Math.max(1, spec.cells[0]) : 2;
    const along = m.normal === "fore" || m.normal === "aft" ? 1 : 0;
    const a: Pt =
      along === 1
        ? [m.at[0], m.at[1] - width / 2]
        : [m.at[0] - width / 2, m.at[1]];
    const b: Pt =
      along === 1
        ? [m.at[0], m.at[1] + width / 2]
        : [m.at[0] + width / 2, m.at[1]];
    const [nx, ny] = NORMAL_VECTOR[m.normal];
    const inside = roomAt(
      (a[0] + b[0]) / 2 - nx * 0.5,
      (a[1] + b[1]) / 2 - ny * 0.5,
    );
    const cargo =
      (spec?.category ?? "").includes("cargo") ||
      m.component.startsWith("cargo-door");
    doors.push({
      id: m.id,
      a,
      b,
      type: cargo ? "door.blast" : "door.airlock",
      rooms: [inside?.id ?? null, null],
      exterior: true,
      ...(fleetAccessDoorClearance(doc, m.id)
        ? { clearWidthM: fleetAccessDoorClearance(doc, m.id)!.clearWidthM }
        : {}),
    });
  }
  // Doors on the exterior replace the wall segments they occupy.
  const exteriorDoorKeys = new Set(
    doors
      .filter((d) => d.exterior)
      .flatMap((d) => unitSegments(d.a, d.b).map(([p, q]) => ekey(p, q))),
  );
  const exteriorFinal = exteriorWalls.filter(
    (w) => !exteriorDoorKeys.has(ekey(w.a, w.b)),
  );

  const posts: Pt[] = [];
  for (const [k, dirs] of [...vertexDirs.entries()].sort()) {
    const walls = dirs.filter((d) => d !== "door");
    // Posts only where three or four walls meet (T and X junctions): straight runs, L corners,
    // wall ends and door jambs stay clean so the deck reads as rooms, not a colonnade.
    if (walls.length < 3) continue;
    posts.push(k.split(",").map(Number) as unknown as Pt);
  }

  // Sockets, lights and labels per room.
  const sockets: DerivedSocket[] = [];
  const lights: DerivedInterior["lights"] = [];
  const labels: DerivedInterior["labels"] = [];
  let station: DerivedInterior["station"] = null;
  const [ox0, , ox1] = vg.bounds;
  for (const room of rooms) {
    const own = floors
      .filter((f) => f.room === room.id && !f.partial)
      .map((f) => f.cell);
    if (!own.length) continue;
    const x0 = Math.min(...own.map((c) => c[0]));
    const y0 = Math.min(...own.map((c) => c[1]));
    const x1 = Math.max(...own.map((c) => c[0])) + 1;
    const y1 = Math.max(...own.map((c) => c[1])) + 1;
    const spec = G.roomTypes[room.type];
    const area = floors.filter((f) => f.room === room.id).length;
    lights.push({
      room: room.id,
      at: [(x0 + x1) / 2, (y0 + y1) / 2],
      colour: spec.light,
      area,
    });
    labels.push({
      room: room.id,
      text: room.label,
      at: [(x0 + x1) / 2, (y0 + y1) / 2],
    });
    if (spec.control) {
      // Control rooms: the pilot seat faces fore on the room's centre line near the bow end;
      // consoles sit ahead of it (their operator looks fore) and banks behind it (worked from the
      // room side, so their operator looks aft). See the facing convention in ship-furniture.ts.
      const cy = (y0 + y1) / 2;
      const bowward = x1 > (ox0 + ox1) / 2;
      const seatX = bowward ? x1 - 1.6 : x0 + 1.0;
      for (const [designId, w, d, h] of spec.sockets) {
        const sw = w * TEXEL;
        const sd = d * TEXEL;
        let at: [number, number];
        if (designId.endsWith("pilot-seat")) at = [seatX - sd / 2, cy - sw / 2];
        else if (designId.endsWith("command-console"))
          at = [Math.min(seatX + 0.55, x1 - 0.3 - sd), cy - sw / 2];
        else at = [Math.max(x0 + 0.3, seatX - 1.4 - sd), cy - sw / 2];
        if (at[0] < x0 + 0.2 || at[0] + sd > x1 - 0.2 || sw > y1 - y0 - 0.4)
          continue;
        const control = designId.endsWith("pilot-seat");
        const behindSeat = !control && !designId.endsWith("command-console");
        sockets.push({
          designId,
          room: room.id,
          at,
          size: [sd, sw],
          heightTexels: h,
          facing: behindSeat ? "aft" : "fore",
          control,
        });
        if (control)
          station = { at: [at[0] + sd / 2, at[1] + sw / 2], room: room.id };
      }
      continue;
    }
    // Other rooms: along the longest side without a door, facing into the room.
    const doorSides = new Set<string>();
    for (const d of doors) {
      if (!d.rooms.includes(room.id)) continue;
      if (d.a[1] === d.b[1])
        doorSides.add(
          Math.abs(d.a[1] - y0) < Math.abs(d.a[1] - y1) ? "south" : "north",
        );
      else
        doorSides.add(
          Math.abs(d.a[0] - x0) < Math.abs(d.a[0] - x1) ? "west" : "east",
        );
    }
    const sidesAll = [
      { side: "north", len: x1 - x0, facing: "starboard" as FaceNormal },
      { side: "south", len: x1 - x0, facing: "port" as FaceNormal },
      { side: "west", len: y1 - y0, facing: "fore" as FaceNormal },
      { side: "east", len: y1 - y0, facing: "aft" as FaceNormal },
    ];
    const free = sidesAll.filter((s) => !doorSides.has(s.side));
    const pick = (free.length ? free : sidesAll).sort(
      (m, n) => n.len - m.len,
    )[0];
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
      sockets.push({
        designId,
        room: room.id,
        at,
        size,
        heightTexels: h,
        // Fixtures open into the room; a wall console's operator looks at the wall.
        facing:
          interiorArtQuarterTurns(designId) === 2
            ? OPPOSITE_FACING[pick.facing]
            : pick.facing,
        control: false,
      });
      u += sw + 0.3;
      if (centred) break;
    }
  }

  // Pressure compartments: rooms joined by non-sealing edges (half walls, open edges).
  const parent = new Map(rooms.map((r) => [r.id, r.id]));
  const find = (x: string): string =>
    parent.get(x) === x ? x : find(parent.get(x)!);
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
  const compartments = [...groups.values()].map((rs, i) => ({
    id: `compartment-${i + 1}`,
    rooms: rs,
  }));

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

  // One object per footprint: a room-type socket gives way to an interior module that occupies
  // it (the engineering reactor socket under a mounted reactor, the quarters bunk under a bunk
  // module, the command console under a helm). Every consumer (dresser, collision, stats) sees
  // the same set, so nothing is drawn or counted twice.
  const moduleRects = catalog
    ? doc.mounts
        .filter((m) => m.attach === "interior" && catalog.get(m.component))
        .map((m) => placeMount(m, catalog.get(m.component), []).rect)
    : [];
  // Hand-placed storage fixtures stand exactly where authored: never dropped under a module or
  // nudged (validateShipPrefab reports one that blocks a door, button or module). Room-type
  // furniture gives way to them.
  const fixtureSockets: DerivedSocket[] = [];
  if (deck === 0)
    for (const f of doc.fixtures ?? []) {
      const size = fixtureSize(f);
      const room = roomAt(f.at[0] + size[0] / 2, f.at[1] + size[1] / 2);
      if (!room) continue;
      fixtureSockets.push({
        designId: f.design,
        room: room.id,
        at: [f.at[0], f.at[1]],
        size,
        heightTexels: fixtureDesignTexels(f.design)[2],
        facing: f.facing,
        control: false,
        fixture: f.id,
      });
    }
  const fixtureRects = fixtureSockets.map((s): Rect4 => [
    s.at[0],
    s.at[1],
    s.at[0] + s.size[0],
    s.at[1] + s.size[1],
  ]);
  const freeSockets = sockets.filter((s) => {
    const r = [s.at[0], s.at[1], s.at[0] + s.size[0], s.at[1] + s.size[1]];
    return ![...moduleRects, ...fixtureRects].some(
      (q) => r[0] < q[2] && q[0] < r[2] && r[1] < q[3] && q[1] < r[3],
    );
  });

  // Room furniture never stands in a door or pilot approach: those sockets are skipped so the
  // dressed deck and the authoritative walking obstacles (sim/prefab-deck-objects) agree.
  const approaches = deckApproachZones(
    doors,
    station?.at ?? null,
    (x, y) => roomAt(x, y) !== null,
  );
  const socketRect = (s: DerivedSocket, dx = 0, dy = 0): Rect4 => [
    s.at[0] + dx,
    s.at[1] + dy,
    s.at[0] + s.size[0] + dx,
    s.at[1] + s.size[1] + dy,
  ];
  const clearSockets: DerivedSocket[] = [];
  for (const s of freeSockets) {
    const blocked = (r: Rect4) =>
      approaches.some((z) => planRectsOverlap(z.rect, r)) ||
      clearSockets.some((o) => planRectsOverlap(socketRect(o), r)) ||
      fixtureRects.some((q) => planRectsOverlap(q, r)) ||
      // Never nudged onto an interior module (e.g. the helm console the pilot sits at).
      moduleRects.some((q) => planRectsOverlap(q, r));
    if (
      s.control ||
      // A corner intruding by at most SOCKET_APPROACH_TOLERANCE_M still leaves the doorway
      // walkable; placed sockets (and their bound containers) stay where they were.
      !approaches.some((z) =>
        planRectsOverlap(z.rect, socketRect(s), SOCKET_APPROACH_TOLERANCE_M),
      )
    ) {
      clearSockets.push(s);
      continue;
    }
    // Nudge the smallest distance out of the approach zones, staying 0.2 m inside the room.
    const own = floors.filter((f) => f.room === s.room).map((f) => f.cell);
    const bounds: Rect4 = [
      Math.min(...own.map((c) => c[0])) + 0.2,
      Math.min(...own.map((c) => c[1])) + 0.2,
      Math.max(...own.map((c) => c[0])) + 0.8,
      Math.max(...own.map((c) => c[1])) + 0.8,
    ];
    const r = socketRect(s);
    const shifts = approaches
      .filter((z) => planRectsOverlap(z.rect, r))
      .flatMap((z) => [
        [z.rect[0] - r[2], 0],
        [z.rect[2] - r[0], 0],
        [0, z.rect[1] - r[3]],
        [0, z.rect[3] - r[1]],
      ])
      .sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
    for (const [dx, dy] of shifts) {
      const q = socketRect(s, dx, dy);
      if (
        q[0] < bounds[0] - 1e-9 ||
        q[1] < bounds[1] - 1e-9 ||
        q[2] > bounds[2] + 1e-9 ||
        q[3] > bounds[3] + 1e-9 ||
        blocked(q)
      )
        continue;
      clearSockets.push({ ...s, at: [q[0] + 0, q[1] + 0] });
      break;
    }
  }

  return {
    deck,
    volume: vg.volume.id,
    floors,
    exteriorWalls: exteriorFinal,
    exteriorSlopes,
    partitions,
    doors,
    posts,
    sockets: [...clearSockets, ...fixtureSockets],
    lights,
    labels,
    compartments,
    station,
  };
}

// ---------------------------------------------------------------- validation
export type PrefabIssueRef =
  | { kind: "document" }
  | { kind: "volume"; id: string; tile?: number }
  | { kind: "room"; id: string }
  | { kind: "edge"; id: string }
  | { kind: "mount"; id: string }
  | { kind: "tile"; id: string }
  | { kind: "skylight"; id: string }
  | { kind: "logic"; id: string }
  | { kind: "fixture"; id: string };

export interface PrefabIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  ref: PrefabIssueRef;
}

const rectsOverlap = (a: readonly number[], b: readonly number[]) =>
  a[0] < b[2] - 1e-9 &&
  b[0] < a[2] - 1e-9 &&
  a[1] < b[3] - 1e-9 &&
  b[1] < a[3] - 1e-9;

/** A roof footprint must lie on the hull roof at one height (0.25 m sampling). */
function roofFootprintIssue(
  rect: readonly number[],
  geoms: readonly VolumeGeometry[],
): { code: string; message: string } | null {
  const [x0, y0, x1, y1] = rect;
  let hostZ: number | null = null;
  for (let x = x0 + 0.125; x < x1; x += 0.25)
    for (let y = y0 + 0.125; y < y1; y += 0.25) {
      let z: number | null = null;
      for (const g of geoms)
        if (g.outline && insideOutline(g.outline, x, y))
          z = Math.max(z ?? -1, g.z[1]);
      if (z === null)
        return { code: "off-hull", message: "footprint leaves the hull roof" };
      if (hostZ !== null && z !== hostZ)
        return { code: "uneven", message: "footprint spans two roof heights" };
      hostZ = z;
    }
  return null;
}

const SIZE_NUMBER: Record<MountSizeId, number> = { SM: 0, MD: 1, LG: 2, XL: 3 };
/** "a size-2 (LG) turret mount holds 1 x MD or 2 x SM" for validation messages. */
export function mountTileCapacityText(
  kind: MountTileKind,
  size: MountSizeId,
): string {
  const configs = [1, 2, 4]
    .map((n) => [n, mountTileCapacity(kind, size, n)] as const)
    .filter(([, s]) => s)
    .map(([n, s]) => `${n} x ${s} (size ${SIZE_NUMBER[s!]})`);
  return `a size-${SIZE_NUMBER[size]} (${size}) ${kind} mount holds ${configs.join(" or ")}`;
}

/** Validate one roof mount tile and the items on it. */
export function validateMountTile(
  doc: ShipPrefabDocumentV1,
  tile: PrefabMountTile,
  catalog: PrefabComponentCatalog,
  geoms: readonly VolumeGeometry[] = doc.volumes.map(volumeGeometry),
): PrefabIssue[] {
  const issues: PrefabIssue[] = [];
  const ref = { kind: "tile" as const, id: tile.id };
  const push = (severity: "error" | "warning", code: string, message: string) =>
    issues.push({ severity, code, message, ref });
  const label = `${tile.size} ${tile.kind} mount`;
  const size = G.blueprintSizeClasses[doc.sizeClass];
  if (mountSizeRank(tile.size) > mountSizeRank(size.maxMount))
    push(
      "error",
      "tile.size-class",
      `A size-${doc.sizeClass} blueprint allows mounts up to ${size.maxMount}; this is ${tile.size}`,
    );
  const tp = placeMountTile(tile, geoms);
  const roof = roofFootprintIssue(tp.rect, geoms);
  if (roof) push("error", `tile.${roof.code}`, `${label} ${roof.message}`);
  for (const s of doc.skylights)
    if (
      rectsOverlap(tp.rect, [
        s.at[0],
        s.at[1],
        s.at[0] + s.size[0],
        s.at[1] + s.size[1],
      ])
    )
      push("error", "tile.skylight", `${label} overlaps skylight ${s.id}`);
  for (const o of doc.mountTiles ?? [])
    if (
      o.id !== tile.id &&
      rectsOverlap(tp.rect, placeMountTile(o, geoms).rect)
    )
      push("error", "tile.overlap", `${label} overlaps mount tile ${o.id}`);
  const items = tileMounts(doc, tile.id);
  if (!items.length) {
    push("warning", "tile.empty", `${label} carries nothing`);
    return issues;
  }
  const specs = items.map((m) => catalog.get(m.component));
  if (new Set(items.map((m) => m.component)).size > 1)
    push(
      "error",
      "tile.mixed",
      `Linked items on one mount must be identical (${[...new Set(items.map((m) => m.component))].join(", ")})`,
    );
  const max = mountTileCapacity(tile.kind, tile.size, items.length);
  if (!max)
    push(
      "error",
      "tile.config",
      `${items.length} items do not fit: ${mountTileCapacityText(tile.kind, tile.size)}`,
    );
  else
    for (const sp of specs)
      if (
        sp &&
        !mountTileAccepts(tile.kind, tile.size, items.length, sp.sizeClass)
      ) {
        push(
          "error",
          "tile.item-size",
          `${sp.label} is ${sp.sizeClass}: ${mountTileCapacityText(tile.kind, tile.size)}${tile.kind === "turret" ? " (turret mounts carry one size smaller)" : ""}`,
        );
        break;
      }
  return issues;
}

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
  const err = (code: string, message: string) =>
    issues.push({ severity: "error", code, message, ref });
  const spec = catalog.get(mount.component);
  if (!spec) {
    err("mount.unknown-component", `Unknown component ${mount.component}`);
    return issues;
  }
  const size = G.blueprintSizeClasses[doc.sizeClass];
  if (mountSizeRank(spec.sizeClass) > mountSizeRank(size.maxMount))
    err(
      "mount.size-class",
      `${spec.label} is ${spec.sizeClass}; a size-${doc.sizeClass} blueprint allows up to ${size.maxMount}`,
    );
  const place = placeMount(mount, spec, geoms, doc);
  // 2026-09-29 mount rules (documents with `mountTiles`): weapons and sensors only on roof mount
  // tiles; only propulsion on side/aft faces (edge openings are hull doors, not mounts).
  const strict = doc.mountTiles !== undefined;
  const onTile = mount.tile !== undefined;
  if (onTile) {
    const tile = doc.mountTiles?.find((t) => t.id === mount.tile);
    if (!tile) {
      err("mount.tile-unknown", `Mount tile ${mount.tile} does not exist`);
      return issues;
    }
    if (!mountTileRequired(spec.category))
      err(
        "mount.tile-category",
        `${spec.label} is not a weapon or sensor; mount tiles carry only weapons and sensors`,
      );
    if (!spec.attach.includes("top"))
      err("mount.attach", `${spec.label} cannot mount on the roof`);
    if (mount.at[0] !== tile.at[0] || mount.at[1] !== tile.at[1])
      err(
        "mount.tile-at",
        `${spec.label} must share its tile's position (${tile.at.join(", ")})`,
      );
    // The tile validates its own roof footprint, overlaps and size configuration.
    return issues;
  }
  if (strict && mount.attach === "top" && mountTileRequired(spec.category))
    err(
      "mount.tile-required",
      `${spec.label} must sit on a roof mount tile (fixed or turret)`,
    );
  if (strict && mount.attach === "face" && spec.category !== "propulsion")
    err(
      "mount.side-engines-only",
      `Only engines mount on side or aft faces; move ${spec.label} to the roof`,
    );
  if (mount.attach === "interior") {
    if (!spec.attach.includes("interior"))
      err("mount.attach", `${spec.label} is not an interior module`);
    const deck = deckVolume(doc, 0);
    if (!deck?.outline)
      err("mount.no-deck", "Interior modules need a walkable deck");
    else {
      const cellRoom = new Map<string, string>();
      for (const room of doc.rooms)
        for (const [x, y] of roomCells(room, deck.outline))
          if (!cellRoom.has(`${x},${y}`)) cellRoom.set(`${x},${y}`, room.id);
      const full = new Set(
        fullCells(deck.outline).map(([x, y]) => `${x},${y}`),
      );
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
      if (outside)
        err(
          "mount.off-floor",
          `${spec.label} must sit on whole floor cells inside a room`,
        );
      else if (rooms.size > 1)
        err("mount.two-rooms", `${spec.label} straddles a room boundary`);
    }
  } else if (mount.attach === "edge") {
    if (!spec.attach.includes("edge"))
      err(
        "mount.attach",
        `${spec.label} is not an exterior opening (edge) component`,
      );
    const deck = deckVolume(doc, 0);
    const along = mount.normal === "fore" || mount.normal === "aft" ? 1 : 0;
    if (
      !Number.isInteger(mount.at[1 - along]) ||
      !Number.isInteger(mount.at[along] - spec.cells[0] / 2)
    )
      err("mount.edge-grid", `${spec.label} must span whole wall cells`);
    if (!deck?.outline || place.host !== deck.volume.id)
      err(
        "mount.edge-face",
        `${spec.label} must sit on a straight face of the walkable deck hull`,
      );
    else {
      const interior = deriveInterior(doc, 0, catalog);
      const door = interior.doors.find((d) => d.id === mount.id);
      if (!door?.rooms[0])
        err("mount.edge-room", `${spec.label} must open into a room`);
    }
  } else if (mount.attach === "top") {
    if (!spec.attach.includes("top"))
      err("mount.attach", `${spec.label} cannot mount on a top hardpoint`);
    for (const t of doc.mountTiles ?? [])
      if (rectsOverlap(place.rect, placeMountTile(t, geoms).rect))
        err("mount.overlap", `Overlaps mount tile ${t.id}`);
    const [x0, y0, x1, y1] = place.rect;
    let hostZ: number | null = null;
    for (let x = x0 + 0.125; x < x1; x += 0.25)
      for (let y = y0 + 0.125; y < y1; y += 0.25) {
        let z: number | null = null;
        for (const g of geoms)
          if (g.outline && insideOutline(g.outline, x, y))
            z = Math.max(z ?? -1, g.z[1]);
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
      if (
        rectsOverlap(place.rect, [
          s.at[0],
          s.at[1],
          s.at[0] + s.size[0],
          s.at[1] + s.size[1],
        ])
      )
        err("mount.skylight", `${spec.label} overlaps skylight ${s.id}`);
  } else {
    const rear = mount.normal === "aft";
    if (
      !spec.attach.includes("face") &&
      !(rear && spec.attach.includes("rear"))
    )
      err(
        "mount.attach",
        `${spec.label} cannot mount on ${rear ? "a rear" : "a side"} face`,
      );
    if (!place.host)
      err(
        "mount.off-face",
        `${spec.label} must sit fully on one straight hull face`,
      );
    else {
      const g = geoms.find((v) => v.volume.id === place.host)!;
      const overhang =
        Math.max(0, g.z[0] - place.z[0]) + Math.max(0, place.z[1] - g.z[1]);
      // Grammar rule (r007, low-profile decks): rear drives are nacelles and may overhang the
      // face band freely; side and fore face mounts may overhang it by at most 0.625 m in total.
      const allowed = rear ? Infinity : 10;
      if (overhang > allowed)
        err(
          "mount.face-height",
          `${spec.label} is taller than the ${g.volume.height} face (rear drives may overhang freely, others by 0.625 m)`,
        );
      // The face must be exposed: nothing else occupies the strip just outside it.
      const [nx, ny] = NORMAL_VECTOR[mount.normal!];
      const mid: Pt = [mount.at[0] + nx * 0.3, mount.at[1] + ny * 0.3];
      for (const o of geoms)
        if (
          o !== g &&
          o.outline &&
          insideOutline(o.outline, mid[0], mid[1]) &&
          o.z[0] < place.z[1] &&
          place.z[0] < o.z[1]
        )
          err(
            "mount.face-covered",
            `${spec.label} face is covered by volume ${o.volume.id}`,
          );
    }
  }
  for (const o of others) {
    if (o.tile !== undefined) continue;
    const ospec = catalog.get(o.component);
    const op = placeMount(o, ospec, geoms, doc);
    const lineKind = (a: string) => (a === "edge" ? "face" : a);
    if (lineKind(o.attach) !== lineKind(mount.attach)) continue;
    const onFace = mount.attach === "face" || mount.attach === "edge";
    if (onFace && o.normal !== mount.normal) continue;
    if (
      onFace &&
      Math.abs(
        o.at[o.normal === "fore" || o.normal === "aft" ? 0 : 1] -
          mount.at[mount.normal === "fore" || mount.normal === "aft" ? 0 : 1],
      ) > 1e-6
    )
      continue;
    const zOverlap = place.z[0] < op.z[1] && op.z[0] < place.z[1];
    if (rectsOverlap(place.rect, op.rect) && (!onFace || zOverlap))
      err("mount.overlap", `Overlaps mount ${o.id}`);
  }
  return issues;
}

export function validateShipPrefab(
  doc: ShipPrefabDocumentV1,
  catalog: PrefabComponentCatalog,
): PrefabIssue[] {
  if (isWayfarerGameplay(doc)) {
    try {
      assertWayfarerPrefabContract(doc);
    } catch {
      return [
        {
          severity: "error",
          code: "authored.source",
          message: "Authored profile requires the exact registered source",
          ref: { kind: "document" },
        },
      ];
    }
    if (!/^ship-components-v1@4(?:\+[0-9a-f]{16})?$/.test(catalog.revision))
      return [
        {
          severity: "error",
          code: "authored.catalog",
          message:
            "Authored Wayfarer requires a component catalogue based on revision 4",
          ref: { kind: "document" },
        },
      ];
    return doc.mounts
      .filter((m) => !catalog.get(m.component))
      .map((m) => ({
        severity: "error" as const,
        code: "mount.unknown",
        message: `Unknown ${m.component}`,
        ref: { kind: "mount" as const, id: m.id },
      }));
  }
  const issues: PrefabIssue[] = [];
  const push = (
    severity: "error" | "warning",
    code: string,
    message: string,
    ref: PrefabIssueRef,
  ) => issues.push({ severity, code, message, ref });
  const size = G.blueprintSizeClasses[doc.sizeClass];
  const docRef = { kind: "document" as const };
  if (doc.decks.length !== 1 || doc.decks[0].index !== 0)
    push(
      "error",
      "decks.launch",
      "Launch ships have exactly one deck (index 0)",
      docRef,
    );
  const geoms = doc.volumes.map(volumeGeometry);
  if (!doc.volumes.some((v) => v.kind === "hull"))
    push(
      "error",
      "volumes.none",
      "A ship needs at least one hull volume",
      docRef,
    );
  for (const g of geoms) {
    const v = g.volume;
    const ref = { kind: "volume" as const, id: v.id };
    for (const pair of bowJoinErrors(v.tiles, v.height))
      push("error", "bow.profile-join", `Bow socket mismatch ${pair}`, ref);
    if (!v.tiles.length)
      push("error", "volume.empty", `Volume ${v.id} has no tiles`, ref);
    if (!G.heightClasses[v.height].kinds.includes(v.kind))
      push(
        "error",
        "volume.height",
        `${v.height} is not a ${v.kind} height class`,
        ref,
      );
    if (v.deck !== 0)
      push("error", "volume.deck", "Launch ships use deck 0 only", ref);
    if (g.islands > 1)
      push(
        "error",
        "volume.islands",
        `Volume ${v.id} is ${g.islands} separate pieces; split it into volumes`,
        ref,
      );
    for (const [i, j] of tileOverlaps(v.tiles))
      push("error", "volume.overlap", `Tiles ${i} and ${j} overlap`, {
        kind: "volume",
        id: v.id,
        tile: j,
      });
  }
  const [bx0, by0, bx1, by1] = prefabBounds(geoms);
  if (bx1 - bx0 > size.maxCells[0] || by1 - by0 > size.maxCells[1])
    push(
      "error",
      "size.extent",
      `Structure is ${bx1 - bx0} x ${by1 - by0} m; size ${doc.sizeClass} allows ${size.maxCells[0]} x ${size.maxCells[1]} m`,
      docRef,
    );
  // A roof mount tile is one hardpoint however many linked items it carries. Edge openings
  // (airlocks, cargo doors, docking ports) are hull doors, not hardpoint mounts (Roof Mounts rule,
  // 2026-09-29), so they do not count against the size-class budget.
  const hardpoints =
    doc.mounts.filter(
      (m) =>
        m.attach !== "interior" && m.attach !== "edge" && m.tile === undefined,
    ).length + (doc.mountTiles?.length ?? 0);
  if (hardpoints > size.maxMounts)
    push(
      "error",
      "size.mounts",
      `Size ${doc.sizeClass} allows ${size.maxMounts} hardpoint mounts (has ${hardpoints})`,
      docRef,
    );

  // Rooms.
  const deck = deckVolume(doc, 0);
  const claimed = new Map<string, string>();
  for (const room of doc.rooms) {
    const ref = { kind: "room" as const, id: room.id };
    if (!deck?.outline) {
      push(
        "error",
        "room.no-deck",
        "Rooms need a walkable deck-class hull volume",
        ref,
      );
      continue;
    }
    const cells = roomCells(room, deck.outline);
    if (!cells.length)
      push(
        "error",
        "room.outside",
        `${room.label} is outside the deck hull`,
        ref,
      );
    for (const [x, y] of cells) {
      const k = `${x},${y}`;
      if (claimed.has(k)) {
        push(
          "error",
          "room.overlap",
          `${room.label} overlaps room ${claimed.get(k)}`,
          ref,
        );
        break;
      }
      claimed.set(k, room.id);
    }
    const [x0, y0, x1, y1] = room.rect;
    if (
      room.type === "corridor" &&
      Math.min(x1 - x0, y1 - y0) < G.deck.minCorridorCells
    )
      push(
        "error",
        "room.corridor-width",
        `Corridors must be at least ${G.deck.minCorridorCells} cells wide`,
        ref,
      );
    else if (Math.min(x1 - x0, y1 - y0) < 2 && room.type !== "cockpit")
      push("warning", "room.narrow", `${room.label} is under 2 m wide`, ref);
  }
  if (!doc.rooms.some((r) => G.roomTypes[r.type].control))
    push(
      "error",
      "rooms.control",
      "A ship needs a bridge or cockpit room for its pilot station",
      docRef,
    );

  // Edges.
  const interior = deriveInterior(doc, 0, catalog);
  const partitionKeys = new Set(interior.partitions.map((p) => ekey(p.a, p.b)));
  const exteriorKeys = new Set(
    [...interior.exteriorWalls].map((p) => ekey(p.a, p.b)),
  );
  for (const d of interior.doors)
    if (d.exterior)
      for (const [a, b] of unitSegments(d.a, d.b)) exteriorKeys.add(ekey(a, b));
  const roomEdgeKeys = new Set<string>();
  if (deck?.outline)
    for (const room of doc.rooms)
      for (const [x, y] of roomCells(room, deck.outline))
        for (const [a, b] of [
          [
            [x, y],
            [x + 1, y],
          ],
          [
            [x, y + 1],
            [x + 1, y + 1],
          ],
          [
            [x, y],
            [x, y + 1],
          ],
          [
            [x + 1, y],
            [x + 1, y + 1],
          ],
        ] as [Pt, Pt][])
          roomEdgeKeys.add(ekey(a, b));
  const edgeClaims = new Map<string, string>();
  const outerLoop = deck?.outline ? ccw(deck.outline.outer) : [];
  for (const e of doc.edges) {
    const ref = { kind: "edge" as const, id: e.id };
    const spec = G.edgeTypes[e.type];
    if (spec.exterior) {
      // Canopy runs follow the hull outline between two of its vertices (any direction).
      const on = (p: readonly number[]) =>
        outerLoop.some(
          (q) => Math.abs(q[0] - p[0]) < 1e-6 && Math.abs(q[1] - p[1]) < 1e-6,
        );
      if (!on(e.a) || !on(e.b) || (e.a[0] === e.b[0] && e.a[1] === e.b[1]))
        push(
          "error",
          "edge.canopy-placement",
          `${spec.label} must run along the deck hull outline between two of its vertices`,
          ref,
        );
      continue;
    }
    const segs = unitSegments(e.a, e.b);
    if (spec.door && segs.length !== 2)
      push(
        "error",
        "edge.door-module",
        "Doors span exactly two cells (2 m module)",
        ref,
      );
    for (const [a, b] of segs) {
      const k = ekey(a, b);
      if (edgeClaims.has(k))
        push(
          "error",
          "edge.overlap",
          `Overlaps edge ${edgeClaims.get(k)}`,
          ref,
        );
      edgeClaims.set(k, e.id);
    }
    const allExterior = segs.every(([a, b]) => exteriorKeys.has(ekey(a, b)));
    const onRooms = segs.every(
      ([a, b]) => roomEdgeKeys.has(ekey(a, b)) && !exteriorKeys.has(ekey(a, b)),
    );
    if (allExterior)
      push(
        "error",
        "edge.exterior",
        "Exterior openings are edge mounts (airlock or cargo-door components), not edges",
        ref,
      );
    else if (!onRooms)
      push(
        "error",
        "edge.placement",
        `${spec.label} must lie on room boundaries inside the hull`,
        ref,
      );
    if (
      !spec.door &&
      !allExterior &&
      onRooms &&
      !segs.every(
        ([a, b]) => partitionKeys.has(ekey(a, b)) || e.type === "open",
      )
    )
      push(
        "warning",
        "edge.inside-room",
        `${spec.label} lies inside one room`,
        ref,
      );
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
          const at = (x: number, y: number) =>
            claimed.get(`${Math.floor(x)},${Math.floor(y)}`) ?? null;
          link(
            at(mid[0] + n[0], mid[1] + n[1]),
            at(mid[0] - n[0], mid[1] - n[1]),
          );
        }
    const seen = new Set([control.id]);
    const queue = [control.id];
    while (queue.length)
      for (const n of adj.get(queue.shift()!) ?? [])
        if (!seen.has(n)) (seen.add(n), queue.push(n));
    for (const r of doc.rooms)
      if (!seen.has(r.id))
        push(
          "warning",
          "room.unreachable",
          `${r.label} cannot be reached from ${control.label}`,
          { kind: "room", id: r.id },
        );
  }
  if (control && !interior.station)
    push(
      "error",
      "rooms.station",
      `${control.label} is too small for a pilot seat`,
      { kind: "room", id: control.id },
    );

  // Mounts and skylights.
  for (const m of doc.mounts)
    issues.push(...validateMount(doc, m, catalog, geoms));
  for (const t of doc.mountTiles ?? [])
    issues.push(...validateMountTile(doc, t, catalog, geoms));
  for (const s of doc.skylights) {
    const ref = { kind: "skylight" as const, id: s.id };
    const hostOk = geoms.some(
      (g) =>
        g.outline &&
        g.volume.kind === "hull" &&
        [
          [0.1, 0.1],
          [s.size[0] - 0.1, 0.1],
          [0.1, s.size[1] - 0.1],
          [s.size[0] - 0.1, s.size[1] - 0.1],
        ].every(([dx, dy]) =>
          insideOutline(g.outline!, s.at[0] + dx, s.at[1] + dy),
        ),
    );
    if (!hostOk)
      push(
        "error",
        "skylight.off-roof",
        "Skylights sit fully on a hull roof",
        ref,
      );
  }
  const stats = prefabStats(doc, catalog);
  if (stats.thrustN <= 0)
    push(
      "warning",
      "flight.no-thrust",
      "No engines: the ship cannot fly",
      docRef,
    );
  else if (
    !doc.mounts.some(
      (m) => (catalog.get(m.component)?.maneuverThrustN ?? 0) > 0,
    )
  )
    push(
      "warning",
      "flight.no-maneuver",
      "No RCS thrusters: the ship cannot brake, strafe or turn in place",
      docRef,
    );
  if (stats.powerBalanceW < 0)
    push(
      "warning",
      "power.deficit",
      `Power deficit of ${Math.round(-stats.powerBalanceW / 1000)} kW`,
      docRef,
    );
  if (stats.heatBalanceW > 0)
    push(
      "warning",
      "heat.surplus",
      `Heat surplus of ${Math.round(stats.heatBalanceW / 1000)} kW`,
      docRef,
    );
  if (doc.logic)
    for (const i of validatePrefabLogic(doc, catalog))
      push(i.severity, i.code, i.message, { kind: "logic", id: i.id });
  for (const i of validatePrefabFixtures(doc, catalog))
    push(i.severity, i.code, i.message, { kind: "fixture", id: i.id });
  return issues;
}

// ---------------------------------------------------------------- storage fixtures
/** Fixtures keep this much floor between them and the walls of their room (m). */
export const FIXTURE_WALL_GAP_M = 0.2;
/** Keep-clear zone in front of an interior wall button: half width and depth from its surface (m). */
export const BUTTON_APPROACH_HALF_M = 0.3;
export const BUTTON_APPROACH_DEPTH_M = 0.7;

/** Plan rectangle in front of an interior wall button where the presser stands. */
export function buttonApproachRect(
  place: Pick<LogicWallPlacement, "surface" | "normal">,
): [number, number, number, number] {
  const [sx, sy] = place.surface;
  const [nx, ny] = place.normal;
  const ex = sx + nx * BUTTON_APPROACH_DEPTH_M,
    ey = sy + ny * BUTTON_APPROACH_DEPTH_M;
  const hx = nx === 0 ? BUTTON_APPROACH_HALF_M : 0,
    hy = ny === 0 ? BUTTON_APPROACH_HALF_M : 0;
  return [
    Math.min(sx, ex) - hx,
    Math.min(sy, ey) - hy,
    Math.max(sx, ex) + hx,
    Math.max(sy, ey) + hy,
  ];
}

/**
 * Fixture issues: each hand-placed storage object stands on full floor inside one room, clear of
 * its walls, and never in a door or pilot approach, a wall button's standing zone, an interior
 * module or another fixture (so it can never seal a door, the airlock cycle or a button).
 */
export function validatePrefabFixtures(
  doc: ShipPrefabDocumentV1,
  catalog?: PrefabComponentCatalog,
): {
  severity: "error" | "warning";
  code: string;
  message: string;
  id: string;
}[] {
  const fixtures = doc.fixtures ?? [];
  if (!fixtures.length) return [];
  const out: ReturnType<typeof validatePrefabFixtures> = [];
  const push = (code: string, message: string, id: string) =>
    out.push({ severity: "error", code, message, id });
  const interior = deriveInterior(doc, 0, catalog);
  const zones = deckApproachZones(
    interior.doors,
    interior.station?.at ?? null,
    (x, y) =>
      interior.floors.some(
        (f) => f.cell[0] === Math.floor(x) && f.cell[1] === Math.floor(y),
      ),
  );
  const modules = catalog
    ? doc.mounts
        .filter((m) => m.attach === "interior" && catalog.get(m.component))
        .map((m) => ({
          id: m.id,
          rect: placeMount(m, catalog.get(m.component), []).rect as Rect4,
        }))
    : [];
  const buttons = (doc.logic?.devices ?? []).flatMap((d) => {
    if (d.kind !== "button") return [];
    const place = logicWallPlacement(doc, d, catalog);
    return "error" in place || place.side !== "interior"
      ? []
      : [{ id: d.id, rect: buttonApproachRect(place) }];
  });
  const rects = new Map<string, Rect4>();
  for (const f of fixtures) {
    const socket = interior.sockets.find((s) => s.fixture === f.id);
    const [w, h] = fixtureSize(f);
    const r: Rect4 = [f.at[0], f.at[1], f.at[0] + w, f.at[1] + h];
    rects.set(f.id, r);
    const room = socket && doc.rooms.find((x) => x.id === socket.room);
    const own = room
      ? interior.floors.filter((c) => c.room === room.id && !c.partial)
      : [];
    const onFloor =
      !!room &&
      [...Array(Math.ceil(r[2] - 1e-9) - Math.floor(r[0]))].every((_, i) =>
        [...Array(Math.ceil(r[3] - 1e-9) - Math.floor(r[1]))].every((_, j) =>
          own.some(
            (c) =>
              c.cell[0] === Math.floor(r[0]) + i &&
              c.cell[1] === Math.floor(r[1]) + j,
          ),
        ),
      );
    if (!room || !onFloor) {
      push(
        "fixture.room",
        `${f.id} must stand on full floor inside one room`,
        f.id,
      );
      continue;
    }
    const g = FIXTURE_WALL_GAP_M - 1e-9;
    if (
      r[0] < room.rect[0] + g ||
      r[1] < room.rect[1] + g ||
      r[2] > room.rect[2] - g ||
      r[3] > room.rect[3] - g
    )
      push(
        "fixture.wall",
        `${f.id} must keep ${FIXTURE_WALL_GAP_M} m from the walls of ${room.id}`,
        f.id,
      );
    for (const z of zones)
      if (planRectsOverlap(z.rect, r))
        push(
          "fixture.approach",
          `${f.id} blocks the ${z.id === "pilot-approach" ? "pilot seat" : `door ${z.id}`} approach`,
          f.id,
        );
    for (const b of buttons)
      if (planRectsOverlap(b.rect, r))
        push("fixture.button", `${f.id} blocks wall button ${b.id}`, f.id);
    for (const m of modules)
      if (planRectsOverlap(m.rect, r))
        push("fixture.module", `${f.id} overlaps module ${m.id}`, f.id);
    for (const [other, q] of rects)
      if (other !== f.id && planRectsOverlap(q, r))
        push("fixture.overlap", `${f.id} overlaps fixture ${other}`, f.id);
  }
  return out;
}

// ---------------------------------------------------------------- ship logic placement
/** Where a wall logic device sits and is used from (prefab plan metres). */
export interface LogicWallPlacement {
  /** Point on the wall's lattice line. */
  at: Pt;
  /** Unit plan normal of the side the panel faces. */
  normal: Pt;
  /** interior: pressed from a room aboard; exterior: pressed from space (EVA). */
  side: "interior" | "exterior";
  /** hull: the exterior shell (inner shell face or outer hull face); partition: a room wall. */
  wall: "hull" | "partition";
  /** Panel surface point (the device's back face). */
  surface: Pt;
  /** Room the panel faces (interior devices). */
  room: string | null;
}
/** Surface offsets from the lattice line: inner shell face, partition face, outer hull face. */
export const LOGIC_WALL_OFFSET_M = {
  shell: 0.25,
  partition: 0.07,
  exterior: 0.02,
} as const;

const onSegment = (p: Pt, a: Pt, b: Pt) => {
  const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  if (Math.abs(cross) > 1e-6) return false;
  const t =
    ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) /
    Math.max(1e-12, (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2);
  return t >= -1e-9 && t <= 1 + 1e-9;
};

/**
 * Placement of a wall device, or the reason it is not on a usable wall. A wall device sits on an
 * axis-aligned lattice line: on the hull outline facing out (exterior), on the hull outline facing
 * into a room (the inner shell), or on a room boundary facing into a room (a partition). Never on
 * a door opening.
 */
export function logicWallPlacement(
  doc: ShipPrefabDocumentV1,
  device: Pick<PrefabLogicDevice, "at" | "normal">,
  catalog?: PrefabComponentCatalog,
): LogicWallPlacement | { error: string } {
  if (!device.at || !device.normal)
    return { error: "needs a wall point and a facing" };
  const deck = deckVolume(doc, 0);
  if (!deck?.outline) return { error: "the ship has no walkable deck" };
  const n = NORMAL_VECTOR[device.normal];
  const at: Pt = [device.at[0], device.at[1]];
  const axis = n[0] !== 0 ? 0 : 1;
  if (!Number.isInteger(at[axis]))
    return { error: "must sit on a wall line (whole metre across its facing)" };
  const probe = (d: number): Pt => [at[0] + n[0] * d, at[1] + n[1] * d];
  const front = probe(0.3),
    back = probe(-0.3);
  const inDeck = (p: Pt) => insideOutline(deck.outline!, p[0], p[1]);
  const anyHull = (p: Pt) =>
    doc.volumes.some((v) => {
      const g = volumeGeometry(v);
      return !!g.outline && insideOutline(g.outline, p[0], p[1]);
    });
  const roomAt = (p: Pt) =>
    doc.rooms.find(
      (r) =>
        r.deck === 0 &&
        p[0] > r.rect[0] &&
        p[0] < r.rect[2] &&
        p[1] > r.rect[1] &&
        p[1] < r.rect[3] &&
        inDeck(p),
    )?.id ?? null;
  const interior = deriveInterior(doc, 0, catalog);
  for (const door of interior.doors)
    if (onSegment(at, door.a, door.b))
      return { error: "sits on a door opening" };
  const shift = (d: number): Pt => [at[0] + n[0] * d, at[1] + n[1] * d];
  if (!inDeck(front)) {
    if (!inDeck(back)) return { error: "is not on the hull wall" };
    if (anyHull(front))
      return { error: "faces another hull part (not open space)" };
    return {
      at,
      normal: [n[0], n[1]],
      side: "exterior",
      wall: "hull",
      surface: shift(LOGIC_WALL_OFFSET_M.exterior),
      room: null,
    };
  }
  const room = roomAt(front);
  if (!room) return { error: "does not face into a room" };
  if (!inDeck(back))
    return {
      at,
      normal: [n[0], n[1]],
      side: "interior",
      wall: "hull",
      surface: shift(LOGIC_WALL_OFFSET_M.shell),
      room,
    };
  const behind = roomAt(back);
  if (behind === room) return { error: "is not on a wall (open floor)" };
  const open = doc.edges.some(
    (e) =>
      (e.type === "open" || e.type === "window") && onSegment(at, e.a, e.b),
  );
  if (open) return { error: "sits on an open edge" };
  return {
    at,
    normal: [n[0], n[1]],
    side: "interior",
    wall: "partition",
    surface: shift(LOGIC_WALL_OFFSET_M.partition),
    room,
  };
}

/** Logic issues of a document: wiring (`validateLogicWiring`) plus doors and placement. */
export function validatePrefabLogic(
  doc: ShipPrefabDocumentV1,
  catalog: PrefabComponentCatalog,
): {
  severity: "error" | "warning";
  code: string;
  message: string;
  id: string;
}[] {
  const logic = doc.logic;
  if (!logic) return [];
  const out = validateLogicWiring(logic).map((i) => ({
    severity: i.severity,
    code: i.code,
    message: i.message,
    id: i.ref.id,
  }));
  const push = (
    severity: "error" | "warning",
    code: string,
    message: string,
    id: string,
  ) => out.push({ severity, code, message, id });
  const interior = deriveInterior(doc, 0, catalog);
  const devices = new Map(logic.devices.map((d) => [d.id, d]));
  const doorOf = (deviceId: string) => {
    const d = devices.get(deviceId);
    return d?.kind === "door"
      ? interior.doors.find((x) => x.id === d.door)
      : undefined;
  };
  for (const d of logic.devices) {
    if (d.kind === "door") {
      const door = interior.doors.find((x) => x.id === d.door);
      if (!door) {
        push(
          "error",
          "logic.door.unknown",
          `${d.id}: no door ${d.door} on the deck`,
          d.id,
        );
        continue;
      }
      if (door.type === "door.forcefield")
        push(
          "error",
          "logic.door.forcefield",
          `${d.id}: a forcefield has no leaves to actuate`,
          d.id,
        );
      const mount = doc.mounts.find((m) => m.id === d.door);
      if (mount && !catalog.get(mount.component)?.dataPort)
        push(
          "error",
          "logic.door.no-data-port",
          `${d.id}: ${mount.component} has no data port to take commands`,
          d.id,
        );
    } else if (d.kind === "button") {
      const place = logicWallPlacement(doc, d, catalog);
      if ("error" in place)
        push("error", "logic.button.placement", `${d.id} ${place.error}`, d.id);
    } else if (d.kind === "airlock-controller") {
      const target = (port: string) =>
        logic.links.find((l) => l.from.device === d.id && l.from.port === port)
          ?.to.device;
      const inner = target("inner"),
        outer = target("outer");
      const outerDoor = outer ? doorOf(outer) : undefined;
      const innerDoor = inner ? doorOf(inner) : undefined;
      if (outer && !outerDoor?.exterior)
        push(
          "error",
          "logic.airlock.outer",
          `${d.id}: the outer door must be an exterior door`,
          d.id,
        );
      if (inner && (!innerDoor || innerDoor.exterior))
        push(
          "error",
          "logic.airlock.inner",
          `${d.id}: the inner door must be an interior door`,
          d.id,
        );
      if (innerDoor && outerDoor) {
        const chamber = innerDoor.rooms.filter((r) => r !== null);
        if (!outerDoor.rooms.some((r) => r !== null && chamber.includes(r)))
          push(
            "error",
            "logic.airlock.chamber",
            `${d.id}: the inner and outer doors must open into the same chamber room`,
            d.id,
          );
      }
    }
  }
  return out;
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
  /** Roof mount tiles by kind and their own mass (included in componentMassKg). */
  mountTiles: { fixed: number; turret: number; massKg: number };
  crew: number;
  cargoCells: number;
}

/** Mass of a floor cell and a wall unit (kg): light-alloy decking and partitions. Proposed, not balance-approved. */
const FLOOR_KG_PER_M2 = 40;
const WALL_KG_PER_M = 60;

export function prefabStats(
  doc: ShipPrefabDocumentV1,
  catalog: PrefabComponentCatalog,
): PrefabStats {
  const geoms = doc.volumes.map(volumeGeometry);
  const [x0, y0, x1, y1] = prefabBounds(geoms);
  let structureMassKg = 0;
  let hullAreaM2 = 0;
  for (const g of geoms) {
    hullAreaM2 += g.area;
    structureMassKg +=
      g.area * G.heightClasses[g.volume.height].massPerM2 * 1000;
  }
  const interior = deriveInterior(doc, 0, catalog);
  const deckAreaM2 = interior.floors.reduce(
    (sum, floor) =>
      sum + (floor.extentM ? floor.extentM[0] * floor.extentM[1] : 1),
    0,
  );
  structureMassKg += deckAreaM2 * FLOOR_KG_PER_M2;
  structureMassKg +=
    (interior.partitions.length + interior.exteriorWalls.length) *
    WALL_KG_PER_M;
  const mountsBySize: Record<MountSizeId, number> = {
    SM: 0,
    MD: 0,
    LG: 0,
    XL: 0,
  };
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
    mountsByCategory[spec.category] =
      (mountsByCategory[spec.category] ?? 0) + 1;
    componentMassKg += spec.massKg;
    if (spec.thrustN && m.attach === "face" && m.normal === "aft")
      thrustN += spec.thrustN;
    pg += spec.powerGenerationW ?? 0;
    pd += spec.powerDrawW ?? 0;
    hg += spec.heatW ?? 0;
    hd += spec.heatRejectionW ?? 0;
    berths += spec.berths ?? 0;
  }
  // Roof mount tiles: plinth/ring mass; turret traverse drives draw power and make heat.
  const mountTiles = { fixed: 0, turret: 0, massKg: 0 };
  for (const t of doc.mountTiles ?? []) {
    const ts = mountTileSpec(t.kind, t.size);
    if (!ts) continue;
    mountTiles[t.kind]++;
    mountTiles.massKg += ts.massKg;
    componentMassKg += ts.massKg;
    pd += ts.powerKw * 1000;
    hg += ts.heatKw * 1000;
  }
  const massKg = structureMassKg + componentMassKg;
  const bunks = interior.sockets.filter((s) =>
    s.designId.endsWith("crew-bunk"),
  ).length;
  return {
    lengthM: x1 - x0,
    beamM: y1 - y0,
    hullAreaM2,
    deckAreaM2,
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
    mountTiles,
    crew: Math.max(1, berths + bunks * 2),
    cargoCells: interior.floors.filter(
      (f) => doc.rooms.find((r) => r.id === f.room)?.type === "cargo",
    ).length,
  };
}

/** Empty document for the editor's "new prefab" action. */
export function blankShipPrefab(
  id: string,
  name: string,
  sizeClass: BlueprintSizeClassId = "S",
  theme: ShipThemeId = "federation",
): ShipPrefabDocumentV1 {
  const tiles: ShapeTilePlacement[] = [];
  for (let x = 0; x < 8; x++)
    for (let y = 0; y < 4; y++)
      tiles.push({ x, y, shape: "square", rot: 0, reflected: false });
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
    volumes: [
      {
        id: "hull",
        kind: "hull",
        height: "deck",
        deck: 0,
        tiles,
        spine: false,
      },
    ],
    rooms: [
      {
        id: "bridge",
        label: "BRIDGE",
        type: "bridge",
        deck: 0,
        rect: [4, 0, 8, 4],
      },
    ],
    edges: [],
    mounts: [],
    mountTiles: [],
    skylights: [],
    markings: {
      name: name.toUpperCase().slice(0, 16),
      number: "",
      emblem: "none",
    },
  };
}

/** Unused export guard so tree-shaking keeps the helpers referenced by tests. */
export const __prefabInternals = { unitSegments, ekey, insidePolygon };
