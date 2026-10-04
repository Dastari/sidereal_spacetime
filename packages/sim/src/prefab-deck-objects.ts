import {
  effectiveWayfarerObjects,
  type FurnishingOverrides,
} from "@sidereal/content/wayfarer-furnishings";
import {
  isWayfarerAccessProfile,
  wayfarerAccessObjects,
  WAYFARER_ACCESS_PHYSICAL,
  WAYFARER_ACCESS_MODULES,
} from "@sidereal/content/wayfarer-access-profile";
import {
  isWayfarerGameplay,
  WAYFARER_GAMEPLAY_OBJECTS,
  WAYFARER_STORAGE_OBJECTS,
  WAYFARER_BED_OBJECTS,
  wayfarerStorageDesign,
  wayfarerConsoleFootprints,
} from "@sidereal/content/wayfarer-authored-gameplay";
/**
 * Placed objects of a prefab ship, derived from its grammar data and the component catalog:
 * interior modules (reactor, bunk, consoles...), room furniture sockets (lockers, crates...),
 * exterior hardpoint components (drives, turrets, radiators...) and doors.
 *
 * One derivation feeds three consumers so they cannot drift apart:
 * - walking authority: `prefabDeckObstacles` (convex ship-local footprints for `compileDeckCollision`);
 * - beam authority: `prefab-beam.ts` (objects tall enough to stop a chest-height beam);
 * - inspection: object ids, catalog ids and boxes for picking and the details panel.
 *
 * Frames: plan metres (+X fore, +Y port, +Z up; z from the ship's texel datum) and ship-local game
 * metres (x starboard, y fore) via `prefabToShipMetres`. Interior components use their catalog
 * envelope (`mount.envelopeM`), not the whole-cell hardpoint rectangle; room sockets use their
 * derived footprint. Pure and deterministic.
 */
import { G, type Pt } from "@sidereal/content/construction-grammar";
import {
  PILOT_APPROACH_OFFSET_M,
  deckApproachZones,
  deriveInterior,
  placeMount,
  planRectsOverlap,
  prefabOrigin,
  readShipPrefab,
  volumeGeometry,
  type DerivedDoor,
  type MountPlacement,
  type PrefabComponentCatalog,
  type ShipPrefabDocumentV1,
} from "@sidereal/content/ship-prefab";
import {
  shipComponentIndex,
  shipMountRotation,
  type ShipComponentDefinition,
  type ShipMountSocket,
  type ShipVec3,
} from "@sidereal/content/ship-components";
import {
  SHIP_COMPONENT_CATALOG_REVISION,
  SHIP_COMPONENT_CATALOG_REVISIONS,
  buildShipComponentCatalog,
} from "@sidereal/content/ship-components-source";
import type { DeckObstacle } from "./construction-collision";
import { prefabComponentCatalogFor } from "./prefab-catalog";
import { composedShipComponentCatalog } from "./component-catalogs";

const TEXEL = 1 / 16;
type Rect = [number, number, number, number];

export type PrefabObjectKind = "component" | "furniture" | "door";
export type PrefabObjectView = "deck" | "flight" | "both";

export interface PrefabShipObject {
  /** Stable placed-object id within the ship: `mount:<id>`, `socket:<room>:<n>` or `door:<id>`. */
  id: string;
  kind: PrefabObjectKind;
  /** Catalog component id (mounts only); the reusable asset id, separate from `id`. */
  componentId: string | null;
  /** Art-library design id (room furniture only). */
  designId: string | null;
  /** Prefab mount / edge id. */
  sourceId: string;
  attach: "interior" | "top" | "face" | "edge" | "socket" | "door";
  room: string | null;
  /** Which dressed view shows the object (mirrors `dressShip`). */
  view: PrefabObjectView;
  /** Axis-aligned box in plan metres. */
  min: [number, number, number];
  max: [number, number, number];
  /** Blocks walking on the deck. */
  blocks: boolean;
  /** Control station the object provides (seat you sit at), if any. */
  station: string | null;
}

const componentIndexes = new Map<
  string,
  ReadonlyMap<string, ShipComponentDefinition>
>();
/**
 * Full catalog definition of a component at the prefab's catalog revision (default: current).
 * The prefab catalog adapter drops envelopes and most stats; instances spawned against an older
 * revision keep reading that revision.
 */
export function prefabComponentDefinition(
  id: string,
  catalogRevision?: string,
): ShipComponentDefinition | undefined {
  if (catalogRevision) {
    const composed = composedShipComponentCatalog(catalogRevision);
    if (composed) return composed.components.find((c) => c.id === id);
  }
  const at = catalogRevision?.match(/@(\d+)$/);
  const revision = (
    at ? Number(at[1]) : SHIP_COMPONENT_CATALOG_REVISION
  ) as (typeof SHIP_COMPONENT_CATALOG_REVISIONS)[number];
  const key = String(revision);
  let index = componentIndexes.get(key);
  if (!index) {
    if (!SHIP_COMPONENT_CATALOG_REVISIONS.includes(revision)) return undefined;
    index = shipComponentIndex(buildShipComponentCatalog(revision));
    componentIndexes.set(key, index);
  }
  return index.get(id);
}

const mul = (m: readonly (readonly number[])[], v: ShipVec3): ShipVec3 => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
];

function socketOf(p: MountPlacement): ShipMountSocket {
  const a = p.mount.attach;
  return a === "face" ? (p.rear ? "rear" : "face") : a;
}

/** Envelope box of a placed component in plan metres (authored frame -> socket -> placement). */
export function mountBox(
  p: MountPlacement,
  def: ShipComponentDefinition | undefined,
): { min: [number, number, number]; max: [number, number, number] } {
  if (!def)
    return {
      min: [p.rect[0], p.rect[1], p.z[0] * TEXEL],
      max: [p.rect[2], p.rect[3], p.z[1] * TEXEL],
    };
  const [lo, hi] = def.mount.envelopeM;
  const r = shipMountRotation(def.mount.frame, socketOf(p));
  const qt = p.quarterTurns;
  const c = [1, 0, -1, 0][qt];
  const s = [0, 1, 0, -1][qt];
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const x of [lo[0], hi[0]])
    for (const y of [lo[1], hi[1]])
      for (const z of [lo[2], hi[2]]) {
        const v = mul(r, [x, y, z]);
        // Component frame at quarter turn 0: +Y forward -> plan +X (fore), +X -> plan -Y (starboard).
        const px = v[1];
        const py = -v[0];
        const w: [number, number, number] = [
          p.anchor[0] + c * px - s * py,
          p.anchor[1] + s * px + c * py,
          p.anchorZ * TEXEL + v[2],
        ];
        for (let i = 0; i < 3; i++) {
          min[i] = Math.min(min[i], w[i]);
          max[i] = Math.max(max[i], w[i]);
        }
      }
  const round = (n: number) => Math.round(n * 1e6) / 1e6 + 0;
  return {
    min: min.map(round) as typeof min,
    max: max.map(round) as typeof max,
  };
}

function doorBox(d: DerivedDoor): {
  min: [number, number, number];
  max: [number, number, number];
} {
  const t = 0.125;
  const x0 = Math.min(d.a[0], d.b[0]);
  const x1 = Math.max(d.a[0], d.b[0]);
  const y0 = Math.min(d.a[1], d.b[1]);
  const y1 = Math.max(d.a[1], d.b[1]);
  const floor = G.deck.floorTopTexels * TEXEL;
  return {
    min: [x0 - (x0 === x1 ? t : 0), y0 - (y0 === y1 ? t : 0), floor],
    max: [x1 + (x0 === x1 ? t : 0), y1 + (y0 === y1 ? t : 0), floor + 2.2],
  };
}

const cache = new WeakMap<ShipPrefabDocumentV1, PrefabShipObject[]>();
const nativeObjects = (
  doc: ShipPrefabDocumentV1,
  furnishings: FurnishingOverrides,
) => {
  const objects = effectiveWayfarerObjects(furnishings);
  return isWayfarerAccessProfile(doc)
    ? wayfarerAccessObjects(objects)
    : objects;
};

/**
 * Every placed object of the ship (deck 0). Interior components block walking unless they are the
 * pilot station itself (the seat pose stands inside the console); room furniture blocks unless it
 * is a control seat. Exterior components and doors never block deck walking.
 */
export function prefabShipObjects(
  doc: ShipPrefabDocumentV1,
  catalog: PrefabComponentCatalog,
  furnishings: FurnishingOverrides = {},
): PrefabShipObject[] {
  if (isWayfarerGameplay(doc))
    return nativeObjects(doc, furnishings).map((o) => ({
      id:
        o.object === "Cockpit_command_station"
          ? "mount:helm"
          : `socket:${o.object}`,
      kind:
        o.object === "Cockpit_command_station"
          ? ("component" as const)
          : ("furniture" as const),
      componentId:
        o.object === "Cockpit_command_station" ? "console.navigation.sm" : null,
      designId: WAYFARER_STORAGE_OBJECTS.some((id) => id === o.object)
        ? wayfarerStorageDesign(o.object)
        : WAYFARER_BED_OBJECTS.some((id) => id === o.object)
          ? "shipyard.equipment.crew-bunk"
          : o.piece,
      sourceId: o.object === "Cockpit_command_station" ? "helm" : o.object,
      attach:
        o.object === "Cockpit_command_station"
          ? ("interior" as const)
          : ("socket" as const),
      room: o.room,
      view: "deck" as const,
      min: o.min,
      max: o.max,
      blocks:
        o.max[2] > 0.3 &&
        o.min[2] < 1.9875 &&
        o.object !== "Cockpit_command_station" &&
        o.object !== "Cockpit_pilot_chair",
      station: o.object === "Cockpit_command_station" ? "pilot" : null,
    }));
  const hit = cache.get(doc);
  if (hit) return hit;
  const interior = deriveInterior(doc, 0, catalog);
  const geoms = doc.volumes.map(volumeGeometry);
  const deckId = interior.volume;
  const bow = doc.volumes.some((v) => v.tiles.some((t) => t.bow));
  const station = interior.station?.at ?? null;
  const cellRoom = new Map(
    interior.floors.map((f) => [`${f.cell[0]},${f.cell[1]}`, f.room]),
  );
  const roomAt = (x: number, y: number) =>
    cellRoom.get(`${Math.floor(x)},${Math.floor(y)}`) ?? null;
  const out: PrefabShipObject[] = [];
  for (const m of doc.mounts) {
    const spec = catalog.get(m.component);
    const p = placeMount(m, spec, geoms, doc);
    const def = prefabComponentDefinition(m.component, catalog.revision);
    const box = mountBox(p, def);
    const isStation =
      m.attach === "interior" &&
      !!station &&
      station[0] >= box.min[0] - 1e-9 &&
      station[0] <= box.max[0] + 1e-9 &&
      station[1] >= box.min[1] - 1e-9 &&
      station[1] <= box.max[1] + 1e-9;
    out.push({
      id: `mount:${m.id}`,
      kind: "component",
      componentId: m.component,
      designId: null,
      sourceId: m.id,
      attach: m.attach,
      room: m.attach === "interior" ? roomAt(p.anchor[0], p.anchor[1]) : null,
      // Mirrors dressShip's view tags.
      view:
        m.attach === "interior"
          ? bow && m.component.startsWith("console.")
            ? "both"
            : "deck"
          : (m.attach === "top" && p.host === deckId) || m.attach === "edge"
            ? "flight"
            : "both",
      min: box.min,
      max: box.max,
      blocks: m.attach === "interior" && !isStation,
      station: spec?.station ?? null,
    });
  }
  const floor = G.deck.floorTopTexels * TEXEL;
  const perRoom = new Map<string, number>();
  for (const s of interior.sockets) {
    const r: Rect = [
      s.at[0],
      s.at[1],
      s.at[0] + s.size[0],
      s.at[1] + s.size[1],
    ];
    const n = perRoom.get(s.room) ?? 0;
    perRoom.set(s.room, n + 1);
    out.push({
      id: `socket:${s.room}:${n}`,
      kind: "furniture",
      componentId: null,
      designId: s.designId,
      sourceId: `${s.room}:${n}`,
      attach: "socket",
      room: s.room,
      view: "deck",
      min: [r[0], r[1], floor],
      max: [r[2], r[3], floor + s.heightTexels * TEXEL],
      blocks: !s.control,
      station: s.control ? "pilot" : null,
    });
  }
  for (const d of interior.doors) {
    const box = doorBox(d);
    out.push({
      id: `door:${d.id}`,
      kind: "door",
      componentId: null,
      designId: null,
      sourceId: d.id,
      attach: "door",
      room: d.rooms[0],
      view: "deck",
      min: box.min,
      max: box.max,
      blocks: false,
      station: null,
    });
  }
  cache.set(doc, out);
  return out;
}

/** Clip `r` out of zone `z` along the cheapest of four half-planes; null if too little remains. */
function trimOutOf(r: Rect, z: Rect): Rect | null {
  if (!planRectsOverlap(r, z)) return r;
  const options: Rect[] = [
    [r[0], r[1], Math.min(r[2], z[0]), r[3]],
    [Math.max(r[0], z[2]), r[1], r[2], r[3]],
    [r[0], r[1], r[2], Math.min(r[3], z[1])],
    [r[0], Math.max(r[1], z[3]), r[2], r[3]],
  ].filter((o) => o[2] - o[0] >= 0.1 && o[3] - o[1] >= 0.1) as Rect[];
  if (!options.length) return null;
  const area = (o: Rect) => (o[2] - o[0]) * (o[3] - o[1]);
  return options.sort((a, b) => area(b) - area(a))[0];
}

export interface PrefabDeckBlocker {
  objectId: string;
  definitionId: string;
  /** Walking footprint in plan metres after approach-zone trimming. */
  rect: Rect;
  /** True when a door or pilot approach forced the footprint smaller than the envelope. */
  trimmed: boolean;
}

/**
 * Walking footprints of blocking objects. Authored modules that intrude on a door or pilot
 * approach zone are trimmed out of it (never sealing a door or the helm), and the trim is
 * reported so authoring can fix the layout.
 */
export function prefabDeckBlockers(
  doc: ShipPrefabDocumentV1,
  catalog: PrefabComponentCatalog,
): PrefabDeckBlocker[] {
  if (isWayfarerGameplay(doc))
    return prefabShipObjects(doc, catalog)
      .filter((o) => o.blocks)
      .map((o) => ({
        objectId: o.id,
        definitionId: o.componentId ?? o.designId ?? o.kind,
        rect: [o.min[0], o.min[1], o.max[0], o.max[1]] as Rect,
        trimmed: false,
      }));
  const interior = deriveInterior(doc, 0, catalog);
  const cellRoom = new Set(
    interior.floors.map((f) => `${f.cell[0]},${f.cell[1]}`),
  );
  const zones = deckApproachZones(
    interior.doors,
    interior.station?.at ?? null,
    (x, y) => cellRoom.has(`${Math.floor(x)},${Math.floor(y)}`),
  );
  const out: PrefabDeckBlocker[] = [];
  for (const o of prefabShipObjects(doc, catalog)) {
    if (!o.blocks) continue;
    let rect: Rect | null = [o.min[0], o.min[1], o.max[0], o.max[1]];
    for (const z of zones) {
      if (!rect) break;
      rect = trimOutOf(rect, z.rect);
    }
    if (!rect) continue;
    out.push({
      objectId: o.id,
      definitionId: o.componentId ?? o.designId ?? o.kind,
      rect,
      trimmed:
        rect[0] !== o.min[0] ||
        rect[1] !== o.min[1] ||
        rect[2] !== o.max[0] ||
        rect[3] !== o.max[1],
    });
  }
  return out;
}

/** Plan rectangle -> counter-clockwise ship-local polygon (x starboard, y fore). */
export function planRectToShip(
  doc: ShipPrefabDocumentV1,
  r: readonly [number, number, number, number],
): [number, number][] {
  const [ox, oy] = prefabOrigin(doc);
  const x0 = -(r[3] - oy) + 0;
  const x1 = -(r[1] - oy) + 0;
  const y0 = r[0] - ox + 0;
  const y1 = r[2] - ox + 0;
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
}

/** Ship-local walking obstacles for `compileDeckCollision` (definition = catalog/design id). */
export function prefabDeckObstacles(
  doc: ShipPrefabDocumentV1,
  catalog: PrefabComponentCatalog,
  furnishings: FurnishingOverrides = {},
): DeckObstacle[] {
  if (isWayfarerGameplay(doc)) {
    const toShip = ([x, y]: readonly number[]): [number, number] => [
      -y + 0,
      x + 0,
    ];
    const obstacles: DeckObstacle[] = nativeObjects(doc, furnishings)
      .filter(
        (o) =>
          o.max[2] > 0.3 &&
          o.min[2] < 1.9875 &&
          o.object !== "Cockpit_command_station" &&
          o.object !== "Cockpit_pilot_chair",
      )
      .flatMap((o) => {
        const replacements = isWayfarerAccessProfile(doc)
          ? (
              WAYFARER_ACCESS_PHYSICAL.collisionReplacements as Record<
                string,
                number[][]
              >
            )[o.object]
          : undefined;
        if (replacements)
          return replacements.map((r, i) => ({
            id: `prefab-socket:${o.object}:${i}`,
            definitionId: o.piece,
            vertices: planRectToShip(doc, r as Rect),
          }));
        return [
          {
            id: `prefab-socket:${o.object}`,
            definitionId: o.piece,
            vertices: o.footprint.map(toShip),
          },
        ];
      });
    if (isWayfarerAccessProfile(doc)) {
      for (const source of WAYFARER_ACCESS_PHYSICAL.newBlockers)
        obstacles.push({
          id: `prefab-access:${source.id}`,
          definitionId: "wayfarer.access.bulkhead",
          vertices: planRectToShip(doc, source.rect as Rect),
        });
      for (const [object, rects] of Object.entries(
        WAYFARER_ACCESS_PHYSICAL.collisionReplacements,
      ))
        if (object.startsWith("WALL_near_") || object.startsWith("LINER_near_"))
          rects.forEach((r, i) =>
            obstacles.push({
              id: `prefab-access:${object}:${i}`,
              definitionId: "wayfarer.access.native-cut",
              vertices: planRectToShip(doc, r as Rect),
            }),
          );
      for (const module of WAYFARER_ACCESS_MODULES)
        for (const [side, y] of [
          ["outer", 7],
          ["inner", 3],
        ] as const) {
          const variant =
            module.id === "cargo"
              ? "cargo.4m"
              : side === "inner"
                ? "personnel.reverse"
                : "personnel";
          const sign = side === "outer" ? 1 : -1;
          for (const [i, source] of WAYFARER_ACCESS_PHYSICAL.frameBlockers[
            variant
          ].entries()) {
            const corners = [source.min[0], source.max[0]].flatMap((x) =>
              [source.min[1], source.max[1]].map((dy) => [
                module.center + sign * x,
                y + sign * dy,
              ]),
            );
            obstacles.push({
              id: `prefab-access-frame:${module.id}:${side}:${i}`,
              definitionId: "wayfarer.access.frame",
              vertices: planRectToShip(doc, [
                Math.min(...corners.map((p) => p[0])),
                Math.min(...corners.map((p) => p[1])),
                Math.max(...corners.map((p) => p[0])),
                Math.max(...corners.map((p) => p[1])),
              ]),
            });
          }
        }
    }
    wayfarerConsoleFootprints().forEach((polygon, i) =>
      obstacles.push({
        id: `prefab-mount:helm:${i}`,
        definitionId: "console.navigation.sm",
        vertices: polygon.map(toShip),
      }),
    );
    // Unique baked cockpit bulkhead is not a reusable source piece. Its physical segments
    // retain the .63m door half-clearance rather than substituting a full solid envelope.
    for (const [i, r] of [
      [0, [4.42, -5.5, 5.08, -0.63]],
      [1, [4.42, 0.63, 5.08, 5.5]],
    ] as [number, Rect][])
      obstacles.push({
        id: `prefab-bulkhead:${i}`,
        definitionId: "wayfarer.bulkhead",
        vertices: planRectToShip(doc, r),
      });
    return obstacles;
  }
  return prefabDeckBlockers(doc, catalog).map((b) => ({
    id: `prefab-${b.objectId}`,
    definitionId: b.definitionId.slice(0, 128),
    vertices: planRectToShip(doc, b.rect),
  }));
}

/**
 * Walking obstacles of a trusted prefab construction document (a source blueprint or a spawned,
 * UUID-remapped instance: object ids come from the embedded grammar, which remapping keeps).
 * Undefined for any non-prefab document. Launch prefabs are single-deck, so the obstacles belong
 * to the one playable deck.
 */
export function prefabConstructionObstacles(
  document: {
    prefab?: unknown;
  },
  furnishings: FurnishingOverrides = {},
): DeckObstacle[] | undefined {
  const binding = document.prefab as
    { document?: unknown; catalog?: unknown } | undefined;
  if (!binding || typeof binding !== "object") return undefined;
  return prefabDeckObstacles(
    readShipPrefab(binding.document),
    prefabComponentCatalogFor(String(binding.catalog)),
    furnishings,
  );
}

/** Preferred spawn of a prefab construction document: the pilot approach (ship-local metres). */
export function prefabConstructionSpawnPreference(document: {
  prefab?: unknown;
}): [number, number][] {
  const binding = document.prefab as
    { document?: unknown; catalog?: unknown } | undefined;
  if (!binding || typeof binding !== "object") return [];
  const doc = readShipPrefab(binding.document);
  const station = deriveInterior(
    doc,
    0,
    prefabComponentCatalogFor(String(binding.catalog)),
  ).station;
  if (!station) return [];
  const [ox, oy] = prefabOrigin(doc);
  return [
    [
      -(station.at[1] - oy) + 0,
      station.at[0] - PILOT_APPROACH_OFFSET_M - ox + 0,
    ],
  ];
}

/** Ship-local game metres -> plan metres (inverse of `prefabToShipMetres`). */
export function shipToPlanMetres(
  doc: ShipPrefabDocumentV1,
): (p: readonly [number, number]) => Pt {
  const [ox, oy] = prefabOrigin(doc);
  return ([x, y]) => [y + ox + 0, -x + oy + 0];
}
