import {
  isWayfarerGameplay,
  WAYFARER_MAIN_NOZZLE,
} from "@sidereal/content/wayfarer-authored-gameplay";
/**
 * Flight definition for prefab ships, compiled from grammar data and component stats
 * (docs/shipyard_player_builder_design.md §8.3: "Flight compiles from part definitions,
 * which removes the Wayfarer-hash gate"). Pure and deterministic.
 *
 * Mass: every hull volume is a placed structure part (area x height-class mass/m2) at its
 * plan centroid; decks/walls are one interior part; every mounted component is a placed part
 * with its catalog mass. Main engines (propulsion "main", aft faces) and manoeuvre thrusters
 * become IFCS actuators; computer cores become flight computers.
 *
 * Frame: ship-local game metres (x starboard, y fore), centred on `prefabOrigin`. Component
 * rotation is its quarter turns (counter-clockwise) in that frame; a component's +Y is its
 * forward axis, so a rear engine at quarter turn 0 pushes the ship fore.
 */
import {
  G,
  outlineArea,
  type Pt,
} from "@sidereal/content/construction-grammar";
import { mountTileSpec } from "@sidereal/content/ship-mount-tiles";
import {
  deriveInterior,
  placeMount,
  placeMountTile,
  prefabBounds,
  volumeGeometry,
  type PrefabComponentCatalog,
  type PrefabComponentSpec,
  type ShipPrefabDocumentV1,
} from "@sidereal/content/ship-prefab";
import type {
  ActuatorDefinition,
  ComputerDefinition,
  FlightCargoMass,
  FlightCrewMass,
  FlightDefinitionCatalog,
  FlightDefinitionInput,
  FlightFitting,
  FlightHullDefinition,
  FlightPhysicalDefinition,
  FlightPlacedPart,
  PhysicalPartDefinition,
} from "./flight-definition";
import { prefabToShipMetres } from "./prefab-construction";
import { flightDefinitionCatalogHash } from "./flight-definition";
import { readConstructionDraft } from "./construction-transactions";
import { prefabComponentCatalogFor } from "./prefab-catalog";
import { spatialCell, validateSpacePoint } from "./spatial-cells";
import { readShipPrefab } from "@sidereal/content/ship-prefab";
import { BASE_FLIGHT_PROFILE } from "@sidereal/content/physical-definitions";
import type { FlightProfile } from "./ifcs";

export const PREFAB_FLIGHT_CATALOG_ID = "prefab-physical-v1";
/** RCS nozzle push directions as game-frame quarter turns (0 pushes fore). */
const RCS_DIRECTIONS: [string, number][] = [
  ["fore", 0],
  ["port", 1],
  ["aft", 2],
  ["starboard", 3],
];
export const PREFAB_FLIGHT_REVISION = 1;
/**
 * IFCS profile for prefab ships (owner 2026-09-29: starter-size ships must feel snappy, and the
 * snappiness must be earned by real thruster placement: "the player's controls is a 'this is my
 * intention to get the ship facing here and going at this speed' and the IFCS computer ... works
 * out what percentage of what engines to fire").
 *
 * The profile holds only flight-computer limits and loop gains; it never moves the ship. Every
 * change of heading and velocity comes from the allocated actuator wrench (`solveFlight`), so each
 * ship's compiled thrust envelope (its drives, reversers and RCS nozzles at their real positions
 * against its mass and inertia, cargo and crew included) decides how hard it actually accelerates,
 * turns and stops. M/L hulls with proportionally smaller drives stay heavy while S hulls reach the
 * caps.
 * - maxAcceleration 8 m/s^2 and maxAngularAcceleration 1.5 rad/s^2 are computer ceilings above
 *   every prefab's envelope; maxAngularSpeed 1.1 rad/s (63 deg/s) is the full-stick yaw-rate
 *   setpoint, reached only when the ship's torque authority can spin it up and stop it.
 * - velocityGain 2 and angularGain 6 tighten the hold/stop response (time constants 0.5 s and
 *   heading capture 1.5 /s) without overshoot (critical-damping rule in `desiredWrench`).
 * Speed limits stay the Wayfarer values (30 m/s forward, 12 m/s reverse). Proposed, not approved.
 */
export const PREFAB_FLIGHT_PROFILE: FlightProfile = Object.freeze({
  ...BASE_FLIGHT_PROFILE,
  velocityGain: 2,
  headingGain: 2,
  angularGain: 6,
  maxAcceleration: 8,
  maxAngularAcceleration: 1.5,
  maxAngularSpeed: 1.1,
});
/**
 * Component catalogue revision from which RCS clusters compile as quads (FLIGHT-IFCS, catalogue
 * revision 4): a face-mounted cluster fires only nozzles whose exhaust clears the hull (outward
 * and both ways along the face; the nozzle that would exhaust into the hull does not exist), and
 * every nozzle acts at its exit point. Main-drive reversers act at the drive's nozzle exit.
 * Earlier catalogue revisions keep their pinned model so live instances derive the same flight
 * definition hash.
 */
export const PREFAB_QUAD_RCS_CATALOG_REVISION = 4;
/** Quad nozzle exits in the cluster frame (m): outward depth of the outward nozzle, outward
 * depth and half-span of the along-face nozzles. Matches the rcs.sm/rcs.md art contract. */
const RCS_QUAD_GEOMETRY: Record<
  string,
  { depth: number; side: number; half: number }
> = {
  SM: { depth: 0.5, side: 0.35, half: 0.375 },
  MD: { depth: 1.0, side: 0.7, half: 0.625 },
};
/** Code revision of a catalogue pin; a registry-composed pin (`@4+hash`) reports its base. */
export const catalogRevisionNumber = (revision: string) => {
  const at = revision.match(/@(\d+)(?:\+[0-9a-f]{16})?$/);
  return at ? Number(at[1]) : 0;
};
const FLOOR_KG_PER_M2 = 40;
/** Ship-frame unit push direction of game quarter turn `q` (0 fore, 1 port, 2 aft, 3 starboard). */
const quarterVector = (q: number): [number, number] =>
  (
    [
      [0, 1],
      [-1, 0],
      [0, -1],
      [1, 0],
    ] as const
  )[q % 4].slice() as [number, number];
const r6 = (v: number) => Math.round(v * 1e6) / 1e6 + 0;
const WALL_KG_PER_M = 60;

export const prefabStructureDefinitionId = (docId: string, volumeId: string) =>
  `prefab-structure:${docId}:${volumeId}`;
export const prefabInteriorDefinitionId = (docId: string) =>
  `prefab-interior:${docId}`;
export const prefabComponentDefinitionId = (componentId: string) =>
  `prefab-component:${componentId}`;
export const prefabFittingDefinitionId = (componentId: string) =>
  `prefab-fitting:${componentId}`;

/** Source ids of placed flight parts (stable per prefab; instance ids come from `identity`). */
export const prefabPartSourceId = {
  structure: (volumeId: string) => `structure-${volumeId}`,
  interior: () => "interior",
  mount: (mountId: string) => `mount-${mountId}`,
  tile: (tileId: string) => `tile-${tileId}`,
};
export const prefabMountTileDefinitionId = (kind: string, size: string) =>
  `prefab-mount-tile:${kind}.${size}`;

type Role = "actuator" | "computer" | "mass" | "rcs";
export function componentFlightRole(
  spec: PrefabComponentSpec,
  attach: string,
): Role {
  if (
    spec.category === "propulsion" &&
    (spec.thrustN ?? 0) > 0 &&
    attach === "face"
  )
    return "actuator";
  if (spec.category === "propulsion" && (spec.maneuverThrustN ?? 0) > 0)
    return "rcs";
  if (spec.id.startsWith("computer-core.")) return "computer";
  return "mass";
}

function componentDefinition(
  spec: PrefabComponentSpec,
  role: Role,
): FlightPhysicalDefinition {
  const size = Math.max(spec.cells[0], spec.cells[1]);
  const base: PhysicalPartDefinition = {
    id: prefabComponentDefinitionId(spec.id),
    revision: PREFAB_FLIGHT_REVISION,
    kind: role === "mass" || role === "rcs" ? "component" : role,
    massKg: spec.massKg,
    centroid: [0, 0],
    inertiaKgM2: (spec.massKg * size * size) / 6,
  };
  if (role === "actuator") {
    const length = Math.max(1, spec.heightTexels / 16) * 1.6;
    const a: ActuatorDefinition = {
      ...base,
      kind: "actuator",
      fittingDefinitionId: prefabFittingDefinitionId(spec.id),
      maxThrustN: spec.thrustN!,
      forceAxis: [0, 1],
      mountOffset: [0, 0],
      nozzleOffset: [0, -length],
      nozzleHeight: 0,
    };
    return a;
  }
  if (role === "computer") {
    const c: ComputerDefinition = {
      ...base,
      kind: "computer",
      fittingDefinitionId: prefabFittingDefinitionId(spec.id),
      requiredPowerW: Math.max(1, spec.powerDrawW ?? 500),
    };
    return c;
  }
  return base;
}

export interface PrefabFlightModel {
  catalog: FlightDefinitionCatalog;
  /** Placed parts keyed by prefab source id (identity applied later). */
  parts: (FlightPlacedPart & { sourceId: string })[];
  /** Components that need installed fitting rows (actuators and computers). */
  fittings: {
    sourceId: string;
    definitionId: string;
    definitionRevision: number;
    role: "actuator" | "computer";
  }[];
  hull: FlightHullDefinition;
  /** Pilot station in ship-local metres. */
  station: [number, number] | null;
}

/** Everything flight needs from the grammar data, before instance identities exist. */
export function prefabFlightModel(
  doc: ShipPrefabDocumentV1,
  components: PrefabComponentCatalog,
): PrefabFlightModel {
  const toShip = prefabToShipMetres(doc);
  const quadRcs =
    catalogRevisionNumber(components.revision) >=
    PREFAB_QUAD_RCS_CATALOG_REVISION;
  const geoms = doc.volumes.map(volumeGeometry);
  const defs = new Map<string, FlightPhysicalDefinition>();
  const parts: PrefabFlightModel["parts"] = [];
  for (const g of geoms) {
    if (!g.outline) continue;
    const area = outlineArea(g.outline);
    const massKg = area * G.heightClasses[g.volume.height].massPerM2 * 1000;
    // Area centroid of the outline (holes subtract).
    let cx = 0;
    let cy = 0;
    let a = 0;
    for (const [loop, sign] of [
      [g.outline.outer, 1],
      ...g.outline.holes.map((h) => [h, 1] as const),
    ] as [readonly Pt[], number][]) {
      for (let i = 0; i < loop.length; i++) {
        const p = loop[i];
        const q = loop[(i + 1) % loop.length];
        const cross = (p[0] * q[1] - q[0] * p[1]) * sign;
        a += cross;
        cx += (p[0] + q[0]) * cross;
        cy += (p[1] + q[1]) * cross;
      }
    }
    const centroid: Pt =
      a !== 0
        ? [cx / (3 * a), cy / (3 * a)]
        : [(g.bounds[0] + g.bounds[2]) / 2, (g.bounds[1] + g.bounds[3]) / 2];
    const [w, h] = [g.bounds[2] - g.bounds[0], g.bounds[3] - g.bounds[1]];
    const id = prefabStructureDefinitionId(doc.id, g.volume.id);
    defs.set(id, {
      id,
      revision: PREFAB_FLIGHT_REVISION,
      kind: "structure",
      massKg,
      centroid: [0, 0],
      inertiaKgM2: (massKg * (w * w + h * h)) / 12,
    });
    const [sx, sy] = toShip(centroid);
    parts.push({
      sourceId: prefabPartSourceId.structure(g.volume.id),
      id: prefabPartSourceId.structure(g.volume.id),
      definitionId: id,
      revision: PREFAB_FLIGHT_REVISION,
      position: [sx, sy, 0],
      rotation: 0,
      flipped: false,
    });
  }
  const interior = deriveInterior(doc, 0, components);
  if (interior.floors.length) {
    const massKg =
      interior.floors.length * FLOOR_KG_PER_M2 +
      (interior.partitions.length + interior.exteriorWalls.length) *
        WALL_KG_PER_M;
    const cx =
      interior.floors.reduce((s, f) => s + f.cell[0] + 0.5, 0) /
      interior.floors.length;
    const cy =
      interior.floors.reduce((s, f) => s + f.cell[1] + 0.5, 0) /
      interior.floors.length;
    const id = prefabInteriorDefinitionId(doc.id);
    const [x0, y0, x1, y1] = prefabBounds(geoms);
    defs.set(id, {
      id,
      revision: PREFAB_FLIGHT_REVISION,
      kind: "structure",
      massKg,
      centroid: [0, 0],
      inertiaKgM2: (massKg * ((x1 - x0) ** 2 + (y1 - y0) ** 2)) / 24,
    });
    const [sx, sy] = toShip([cx, cy]);
    parts.push({
      sourceId: prefabPartSourceId.interior(),
      id: prefabPartSourceId.interior(),
      definitionId: id,
      revision: PREFAB_FLIGHT_REVISION,
      position: [sx, sy, 0],
      rotation: 0,
      flipped: false,
    });
  }
  const fittings: PrefabFlightModel["fittings"] = [];
  for (const m of doc.mounts) {
    const spec = components.get(m.component);
    if (!spec) throw Error(`Unknown component ${m.component}`);
    const role = componentFlightRole(spec, m.attach);
    const def = componentDefinition(spec, role);
    if (isWayfarerGameplay(doc) && role === "actuator") {
      const actuator = def as ActuatorDefinition;
      actuator.nozzleOffset = [0, -WAYFARER_MAIN_NOZZLE.offset];
      actuator.nozzleHeight = WAYFARER_MAIN_NOZZLE.height;
    }

    defs.set(def.id, def);
    const mp = placeMount(m, spec, geoms, doc);
    const [sx, sy] = toShip(mp.anchor);
    const sourceId = prefabPartSourceId.mount(m.id);
    parts.push({
      sourceId,
      id: sourceId,
      definitionId: def.id,
      revision: PREFAB_FLIGHT_REVISION,
      position: [sx, sy, mp.anchorZ / 16],
      rotation: (mp.quarterTurns * Math.PI) / 2,
      flipped: false,
    });
    if (role === "actuator" || role === "computer")
      fittings.push({
        sourceId,
        definitionId: prefabFittingDefinitionId(spec.id),
        definitionRevision: PREFAB_FLIGHT_REVISION,
        role,
      });
    if (role === "actuator" && (spec.reverseThrustN ?? 0) > 0) {
      // Thrust reverser (catalog revision 3+): a massless actuator on the same drive pushing
      // opposite its forward axis, so the drive brakes as well as accelerates.
      const reverser: ActuatorDefinition = {
        id: `${prefabComponentDefinitionId(spec.id)}#reverser`,
        revision: PREFAB_FLIGHT_REVISION,
        kind: "actuator",
        massKg: 0,
        centroid: [0, 0],
        inertiaKgM2: 0,
        fittingDefinitionId: `${prefabFittingDefinitionId(spec.id)}#reverser`,
        maxThrustN: spec.reverseThrustN!,
        forceAxis: [0, 1],
        mountOffset: [0, 0],
        // From catalogue revision 4 the reverser acts at the drive's nozzle exit (its local +Y
        // is the drive's aft); earlier revisions keep their pinned offset.
        nozzleOffset: quadRcs
          ? [
              0,
              isWayfarerGameplay(doc)
                ? WAYFARER_MAIN_NOZZLE.offset
                : Math.max(1, spec.heightTexels / 16) * 1.6,
            ]
          : [0, -0.3],
        nozzleHeight: isWayfarerGameplay(doc) ? WAYFARER_MAIN_NOZZLE.height : 0,
      };
      defs.set(reverser.id, reverser);
      const id = `${sourceId}#reverser`;
      parts.push({
        sourceId: id,
        id,
        definitionId: reverser.id,
        revision: PREFAB_FLIGHT_REVISION,
        position: [sx, sy, mp.anchorZ / 16],
        rotation: ((mp.quarterTurns + 2) * Math.PI) / 2,
        flipped: false,
      });
      fittings.push({
        sourceId: id,
        definitionId: reverser.fittingDefinitionId,
        definitionRevision: PREFAB_FLIGHT_REVISION,
        role: "actuator",
      });
    }
    if (role === "rcs" && quadRcs && m.attach === "face") {
      // Quad cluster (catalogue revision 4+): three nozzles whose exhaust clears the hull, each a
      // massless placed part at its exit point (the cluster part above carries the mass).
      const g = RCS_QUAD_GEOMETRY[spec.sizeClass] ?? RCS_QUAD_GEOMETRY.MD;
      const nozzle: ActuatorDefinition = {
        id: `${prefabComponentDefinitionId(spec.id)}#quad-nozzle`,
        revision: PREFAB_FLIGHT_REVISION,
        kind: "actuator",
        massKg: 0,
        centroid: [0, 0],
        inertiaKgM2: 0,
        fittingDefinitionId: `${prefabFittingDefinitionId(spec.id)}#quad-nozzle`,
        maxThrustN: spec.maneuverThrustN!,
        forceAxis: [0, 1],
        mountOffset: [0, 0],
        nozzleOffset: [0, 0],
        nozzleHeight: 0,
      };
      defs.set(nozzle.id, nozzle);
      const q = mp.quarterTurns;
      // Ship-frame unit vectors: `inward` is the cluster's +Y (into the hull), `along` its +X.
      const inward = quarterVector(q);
      const along = quarterVector(q + 3);
      const exits: [number, number, number][] = [
        // Pushes inward: exhausts straight out of the face.
        [q, sx - inward[0] * g.depth, sy - inward[1] * g.depth],
        // Pushes along +X: exhausts along -X from the -X side of the head.
        [
          (q + 3) % 4,
          sx - inward[0] * g.side - along[0] * g.half,
          sy - inward[1] * g.side - along[1] * g.half,
        ],
        [
          (q + 1) % 4,
          sx - inward[0] * g.side + along[0] * g.half,
          sy - inward[1] * g.side + along[1] * g.half,
        ],
      ];
      for (const [quarter, nx, ny] of exits) {
        const id = `${sourceId}#${RCS_DIRECTIONS[quarter][0]}`;
        parts.push({
          sourceId: id,
          id,
          definitionId: nozzle.id,
          revision: PREFAB_FLIGHT_REVISION,
          position: [r6(nx), r6(ny), mp.anchorZ / 16],
          rotation: (quarter * Math.PI) / 2,
          flipped: false,
        });
        fittings.push({
          sourceId: id,
          definitionId: nozzle.fittingDefinitionId,
          definitionRevision: PREFAB_FLIGHT_REVISION,
          role: "actuator",
        });
      }
    } else if (role === "rcs") {
      // Legacy (catalogue revisions 1-3): four massless nozzles (fore, port, aft, starboard) at
      // the cluster anchor. Kept unchanged so pinned instances derive the same definition hash.
      const nozzle: ActuatorDefinition = {
        id: `${prefabComponentDefinitionId(spec.id)}#nozzle`,
        revision: PREFAB_FLIGHT_REVISION,
        kind: "actuator",
        massKg: 0,
        centroid: [0, 0],
        inertiaKgM2: 0,
        fittingDefinitionId: `${prefabFittingDefinitionId(spec.id)}#nozzle`,
        maxThrustN: spec.maneuverThrustN!,
        forceAxis: [0, 1],
        mountOffset: [0, 0],
        nozzleOffset: [0, -0.3],
        nozzleHeight: 0,
      };
      defs.set(nozzle.id, nozzle);
      RCS_DIRECTIONS.forEach(([name, quarter]) => {
        const id = `${sourceId}#${name}`;
        parts.push({
          sourceId: id,
          id,
          definitionId: nozzle.id,
          revision: PREFAB_FLIGHT_REVISION,
          position: [sx, sy, mp.anchorZ / 16],
          rotation: (quarter * Math.PI) / 2,
          flipped: false,
        });
        fittings.push({
          sourceId: id,
          definitionId: nozzle.fittingDefinitionId,
          definitionRevision: PREFAB_FLIGHT_REVISION,
          role: "actuator",
        });
      });
    }
  }
  // Roof mount tiles: plinths and turret rings carry mass (their items are mounts above).
  for (const t of doc.mountTiles ?? []) {
    const ts = mountTileSpec(t.kind, t.size);
    if (!ts) throw Error(`Unknown mount tile ${t.kind} ${t.size}`);
    const tp = placeMountTile(t, geoms);
    const id = prefabMountTileDefinitionId(t.kind, t.size);
    const n = tp.rect[2] - tp.rect[0];
    defs.set(id, {
      id,
      revision: PREFAB_FLIGHT_REVISION,
      kind: "component",
      massKg: ts.massKg,
      centroid: [0, 0],
      inertiaKgM2: (ts.massKg * n * n) / 6,
    });
    const [sx, sy] = toShip(tp.centre);
    const sourceId = prefabPartSourceId.tile(t.id);
    parts.push({
      sourceId,
      id: sourceId,
      definitionId: id,
      revision: PREFAB_FLIGHT_REVISION,
      position: [sx, sy, tp.z[0] / 16],
      rotation: 0,
      flipped: false,
    });
  }
  const [x0, y0, x1, y1] = prefabBounds(geoms);
  const beam = y1 - y0;
  const length = x1 - x0;
  const radius = Math.max(1, beam / 2);
  const hull: FlightHullDefinition = {
    id: `prefab-hull:${doc.id}`,
    revision: PREFAB_FLIGHT_REVISION,
    radius,
    halfLength: Math.max(0, length / 2 - radius),
    center: [0, 0],
  };
  const station = interior.station ? toShip(interior.station.at) : null;
  return {
    catalog: {
      id: PREFAB_FLIGHT_CATALOG_ID,
      revision: PREFAB_FLIGHT_REVISION,
      definitions: [...defs.values()].sort((a, b) =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
      ),
    },
    parts: parts.sort((a, b) => (a.sourceId < b.sourceId ? -1 : 1)),
    fittings,
    hull,
    station,
  };
}

/**
 * Assemble the IFCS input for a spawned prefab instance. `identity(sourceId)` maps prefab
 * source ids to the instance's placed-object ids; `fittings` are the authoritative fitting
 * rows (installed/powered/availability) read from the world.
 */
export function prefabFlightInput(
  model: PrefabFlightModel,
  identity: (sourceId: string) => string,
  state: {
    fittings: readonly FlightFitting[];
    cargo?: readonly FlightCargoMass[];
    crew?: readonly FlightCrewMass[];
    supply?: Readonly<Record<string, number>>;
  },
): FlightDefinitionInput {
  return {
    parts: model.parts.map(({ sourceId, ...p }) => ({
      ...p,
      id: identity(sourceId),
    })),
    fittings: state.fittings,
    cargo: state.cargo ?? [],
    crew: state.crew ?? [],
    catalog: model.catalog,
    hull: model.hull,
    ...(state.supply ? { supply: state.supply } : {}),
  };
}

// ---------------------------------------------------------------- installation plan
export const PREFAB_FLIGHT_DEFINITION = "prefab-flight-v1";

/** Placed-object id of a prefab flight part on a spawned ship. */
export const prefabPlacedObjectId = (shipId: string, sourceId: string) =>
  `${shipId}:${sourceId}`;

export interface PrefabFlightInstance {
  id: string;
  revision: bigint;
  blueprintSha256: string;
  documentJson: string;
  spawnDeckId: string;
  name: string;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Parse and admit a prefab construction document; returns the prefab and its catalog. */
export function prefabDocumentOf(documentJson: string) {
  readConstructionDraft(documentJson);
  const doc = JSON.parse(documentJson) as {
    prefab?: { catalog: string; document: ShipPrefabDocumentV1 };
  };
  if (!doc.prefab) throw Error("Prefab construction document required");
  return {
    document: readShipPrefab(doc.prefab.document),
    catalog: prefabComponentCatalogFor(doc.prefab.catalog),
  };
}

/** Bounded memo: walking marks a ship dirty every tick, so the model is reused per source. */
const MODEL_MEMO = new Map<string, PrefabFlightModel>();
export function prefabFlightModelFor(
  key: string,
  documentJson: string,
): PrefabFlightModel {
  const hit = MODEL_MEMO.get(key);
  if (hit) return hit;
  const { document, catalog } = prefabDocumentOf(documentJson);
  const model = prefabFlightModel(document, catalog);
  if (MODEL_MEMO.size >= 64) MODEL_MEMO.clear();
  MODEL_MEMO.set(key, model);
  return model;
}

/**
 * Dormant flight installation for a spawned prefab instance, in the same shape as
 * `planQualifiedConstructionFlight` so the existing writer, tables and activation apply.
 * Pins: definitionId = PREFAB_FLIGHT_DEFINITION and definitionSha256 = the prefab physical
 * catalog hash, which the resolver compares with the compiled definition hash.
 */
export function planPrefabConstructionFlight(
  instance: PrefabFlightInstance,
  placement: { systemId: string; x: number; y: number; serverTick: bigint },
  allocate: () => string,
  reservedIds: readonly string[] = [],
) {
  // Game-owned prefab instances are never refitted: every revision holds a trusted prefab source
  // (revision 1 at assignment; an operator in-place prefab upgrade installs the next one).
  if (instance.revision < 1n)
    throw Error("Positive prefab instance revision required");
  if (instance.documentJson.length > 1_048_576)
    throw Error("Bounded construction source required");
  const model = prefabFlightModelFor(
    `${instance.id}:${instance.blueprintSha256}`,
    instance.documentJson,
  );
  if (!model.station) throw Error("Prefab pilot station required");
  const computers = model.fittings
    .filter((f) => f.role === "computer")
    .sort((a, b) => (a.sourceId < b.sourceId ? -1 : 1));
  const actuators = model.fittings.filter((f) => f.role === "actuator");
  if (!computers.length || !actuators.length)
    throw Error("Prefab flight needs a computer core and thrust");
  validateSpacePoint(placement);
  if (
    !placement.systemId ||
    placement.systemId.length > 160 ||
    placement.serverTick < 0n
  )
    throw Error("Valid server-selected system sample required");
  if (reservedIds.length > 16384)
    throw Error("Flight identity budget exceeded");
  const used = new Set(
    [instance.id, ...reservedIds].map((s) => s.toLowerCase()),
  );
  const fresh = () => {
    const id = allocate();
    if (!UUID.test(id) || used.has(id.toLowerCase()))
      throw Error("Fresh flight UUID required");
    used.add(id.toLowerCase());
    return id;
  };
  const shipId = instance.id;
  const parts = new Map(model.parts.map((p) => [p.sourceId, p]));
  const definitions = new Map(model.catalog.definitions.map((d) => [d.id, d]));
  const computerPart = parts.get(computers[0].sourceId)!;
  const computerDefinition = definitions.get(
    computerPart.definitionId,
  ) as ComputerDefinition;
  const station = {
    id: fresh(),
    shipId,
    deckId: instance.spawnDeckId,
    placedObjectId: prefabPlacedObjectId(shipId, "station"),
    consolePlacedObjectId: prefabPlacedObjectId(shipId, computers[0].sourceId),
    localX: model.station[0],
    localY: model.station[1],
    occupantId: undefined as string | undefined,
    operational: false,
  };
  const computer = {
    id: fresh(),
    shipId,
    placedObjectId: station.consolePlacedObjectId,
    sourceDeviceId: computers[0].sourceId,
    definitionId: computerDefinition.fittingDefinitionId,
    definitionRevision: computerDefinition.revision,
    installed: true,
    powered: true,
  };
  const planned = actuators.map((f) => {
    const part = parts.get(f.sourceId)!;
    const d = definitions.get(part.definitionId) as ActuatorDefinition;
    const c = Math.cos(part.rotation);
    const s = Math.sin(part.rotation);
    const axis: [number, number] = [
      c * d.forceAxis[0] - s * d.forceAxis[1],
      s * d.forceAxis[0] + c * d.forceAxis[1],
    ];
    return {
      id: fresh(),
      shipId,
      placedObjectId: prefabPlacedObjectId(shipId, f.sourceId),
      sourceDeviceId: f.sourceId,
      definitionId: d.fittingDefinitionId,
      definitionRevision: d.revision,
      x: part.position[0],
      y: part.position[1],
      rotation: Math.atan2(-axis[0], axis[1]),
      maxThrustN: d.maxThrustN,
      availability: 1,
    };
  });
  const cell = spatialCell(placement);
  return {
    definitionId: PREFAB_FLIGHT_DEFINITION,
    definitionSha256: flightDefinitionCatalogHash(model.catalog),
    instanceId: instance.id,
    instanceRevision: instance.revision,
    blueprintSha256: instance.blueprintSha256,
    ship: {
      id: shipId,
      name: instance.name,
      revision: 1n,
      x: placement.x,
      y: placement.y,
      vx: 0,
      vy: 0,
      heading: 0,
      omega: 0,
      massKg: 0,
      thrustN: 0,
      turnAcceleration: 0,
      tick: placement.serverTick,
    },
    motion: {
      shipId,
      systemId: placement.systemId,
      x: placement.x,
      y: placement.y,
      vx: 0,
      vy: 0,
      heading: 0,
      omega: 0,
      serverTick: placement.serverTick,
      cellX: BigInt(cell.cellX),
      cellY: BigInt(cell.cellY),
    },
    station,
    computer,
    actuators: planned,
    provenance: "versioned-placed-part-installation" as const,
    routedPowerFuelImplemented: false as const,
    armorRatingImplemented: false as const,
    actorMutationRequired: false as const,
    cargoMutationRequired: false as const,
    activation: "installed-dormant" as const,
  };
}
