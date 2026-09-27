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
import { G, outlineArea, type Pt } from "@sidereal/content/construction-grammar";
import {
  deriveInterior,
  placeMount,
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

export const PREFAB_FLIGHT_CATALOG_ID = "prefab-physical-v1";
/** RCS nozzle push directions as game-frame quarter turns (0 pushes fore). */
const RCS_DIRECTIONS: [string, number][] = [["fore", 0], ["port", 1], ["aft", 2], ["starboard", 3]];
export const PREFAB_FLIGHT_REVISION = 1;
const FLOOR_KG_PER_M2 = 40;
const WALL_KG_PER_M = 60;

export const prefabStructureDefinitionId = (docId: string, volumeId: string) => `prefab-structure:${docId}:${volumeId}`;
export const prefabInteriorDefinitionId = (docId: string) => `prefab-interior:${docId}`;
export const prefabComponentDefinitionId = (componentId: string) => `prefab-component:${componentId}`;
export const prefabFittingDefinitionId = (componentId: string) => `prefab-fitting:${componentId}`;

/** Source ids of placed flight parts (stable per prefab; instance ids come from `identity`). */
export const prefabPartSourceId = {
  structure: (volumeId: string) => `structure-${volumeId}`,
  interior: () => "interior",
  mount: (mountId: string) => `mount-${mountId}`,
};

type Role = "actuator" | "computer" | "mass" | "rcs";
export function componentFlightRole(spec: PrefabComponentSpec, attach: string): Role {
  if (spec.category === "propulsion" && (spec.thrustN ?? 0) > 0 && attach === "face") return "actuator";
  if (spec.category === "propulsion" && (spec.maneuverThrustN ?? 0) > 0) return "rcs";
  if (spec.id.startsWith("computer-core.")) return "computer";
  return "mass";
}

function componentDefinition(spec: PrefabComponentSpec, role: Role): FlightPhysicalDefinition {
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
  fittings: { sourceId: string; definitionId: string; definitionRevision: number; role: "actuator" | "computer" }[];
  hull: FlightHullDefinition;
  /** Pilot station in ship-local metres. */
  station: [number, number] | null;
}

/** Everything flight needs from the grammar data, before instance identities exist. */
export function prefabFlightModel(doc: ShipPrefabDocumentV1, components: PrefabComponentCatalog): PrefabFlightModel {
  const toShip = prefabToShipMetres(doc);
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
    for (const [loop, sign] of [[g.outline.outer, 1], ...g.outline.holes.map((h) => [h, 1] as const)] as [readonly Pt[], number][]) {
      for (let i = 0; i < loop.length; i++) {
        const p = loop[i];
        const q = loop[(i + 1) % loop.length];
        const cross = (p[0] * q[1] - q[0] * p[1]) * sign;
        a += cross;
        cx += (p[0] + q[0]) * cross;
        cy += (p[1] + q[1]) * cross;
      }
    }
    const centroid: Pt = a !== 0 ? [cx / (3 * a), cy / (3 * a)] : [(g.bounds[0] + g.bounds[2]) / 2, (g.bounds[1] + g.bounds[3]) / 2];
    const [w, h] = [g.bounds[2] - g.bounds[0], g.bounds[3] - g.bounds[1]];
    const id = prefabStructureDefinitionId(doc.id, g.volume.id);
    defs.set(id, { id, revision: PREFAB_FLIGHT_REVISION, kind: "structure", massKg, centroid: [0, 0], inertiaKgM2: (massKg * (w * w + h * h)) / 12 });
    const [sx, sy] = toShip(centroid);
    parts.push({ sourceId: prefabPartSourceId.structure(g.volume.id), id: prefabPartSourceId.structure(g.volume.id), definitionId: id, revision: PREFAB_FLIGHT_REVISION, position: [sx, sy, 0], rotation: 0, flipped: false });
  }
  const interior = deriveInterior(doc, 0, components);
  if (interior.floors.length) {
    const massKg = interior.floors.length * FLOOR_KG_PER_M2 + (interior.partitions.length + interior.exteriorWalls.length) * WALL_KG_PER_M;
    const cx = interior.floors.reduce((s, f) => s + f.cell[0] + 0.5, 0) / interior.floors.length;
    const cy = interior.floors.reduce((s, f) => s + f.cell[1] + 0.5, 0) / interior.floors.length;
    const id = prefabInteriorDefinitionId(doc.id);
    const [x0, y0, x1, y1] = prefabBounds(geoms);
    defs.set(id, { id, revision: PREFAB_FLIGHT_REVISION, kind: "structure", massKg, centroid: [0, 0], inertiaKgM2: (massKg * ((x1 - x0) ** 2 + (y1 - y0) ** 2)) / 24 });
    const [sx, sy] = toShip([cx, cy]);
    parts.push({ sourceId: prefabPartSourceId.interior(), id: prefabPartSourceId.interior(), definitionId: id, revision: PREFAB_FLIGHT_REVISION, position: [sx, sy, 0], rotation: 0, flipped: false });
  }
  const fittings: PrefabFlightModel["fittings"] = [];
  for (const m of doc.mounts) {
    const spec = components.get(m.component);
    if (!spec) throw Error(`Unknown component ${m.component}`);
    const role = componentFlightRole(spec, m.attach);
    const def = componentDefinition(spec, role);
    defs.set(def.id, def);
    const mp = placeMount(m, spec, geoms);
    const [sx, sy] = toShip(mp.anchor);
    const sourceId = prefabPartSourceId.mount(m.id);
    parts.push({ sourceId, id: sourceId, definitionId: def.id, revision: PREFAB_FLIGHT_REVISION, position: [sx, sy, (mp.anchorZ / 16)], rotation: (mp.quarterTurns * Math.PI) / 2, flipped: false });
    if (role === "actuator" || role === "computer")
      fittings.push({ sourceId, definitionId: prefabFittingDefinitionId(spec.id), definitionRevision: PREFAB_FLIGHT_REVISION, role });
    if (role === "rcs") {
      // Four massless nozzles (fore, port, aft, starboard) on the cluster; the cluster part
      // above carries the mass. Each nozzle is its own placed part and fitting row.
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
        parts.push({ sourceId: id, id, definitionId: nozzle.id, revision: PREFAB_FLIGHT_REVISION, position: [sx, sy, mp.anchorZ / 16], rotation: (quarter * Math.PI) / 2, flipped: false });
        fittings.push({ sourceId: id, definitionId: nozzle.fittingDefinitionId, definitionRevision: PREFAB_FLIGHT_REVISION, role: "actuator" });
      });
    }
  }
  const [x0, y0, x1, y1] = prefabBounds(geoms);
  const beam = y1 - y0;
  const length = x1 - x0;
  const radius = Math.max(1, beam / 2);
  const hull: FlightHullDefinition = { id: `prefab-hull:${doc.id}`, revision: PREFAB_FLIGHT_REVISION, radius, halfLength: Math.max(0, length / 2 - radius), center: [0, 0] };
  const station = interior.station ? toShip(interior.station.at) : null;
  return {
    catalog: { id: PREFAB_FLIGHT_CATALOG_ID, revision: PREFAB_FLIGHT_REVISION, definitions: [...defs.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) },
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
  state: { fittings: readonly FlightFitting[]; cargo?: readonly FlightCargoMass[]; crew?: readonly FlightCrewMass[]; supply?: Readonly<Record<string, number>> },
): FlightDefinitionInput {
  return {
    parts: model.parts.map(({ sourceId, ...p }) => ({ ...p, id: identity(sourceId) })),
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
export const prefabPlacedObjectId = (shipId: string, sourceId: string) => `${shipId}:${sourceId}`;

export interface PrefabFlightInstance {
  id: string;
  revision: bigint;
  blueprintSha256: string;
  documentJson: string;
  spawnDeckId: string;
  name: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Parse and admit a prefab construction document; returns the prefab and its catalog. */
export function prefabDocumentOf(documentJson: string) {
  readConstructionDraft(documentJson);
  const doc = JSON.parse(documentJson) as { prefab?: { catalog: string; document: ShipPrefabDocumentV1 } };
  if (!doc.prefab) throw Error("Prefab construction document required");
  return { document: readShipPrefab(doc.prefab.document), catalog: prefabComponentCatalogFor(doc.prefab.catalog) };
}

/** Bounded memo: walking marks a ship dirty every tick, so the model is reused per source. */
const MODEL_MEMO = new Map<string, PrefabFlightModel>();
export function prefabFlightModelFor(key: string, documentJson: string): PrefabFlightModel {
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
  if (instance.revision !== 1n) throw Error("Unrefitted prefab instance required");
  if (instance.documentJson.length > 1_048_576) throw Error("Bounded construction source required");
  const model = prefabFlightModelFor(`${instance.id}:${instance.blueprintSha256}`, instance.documentJson);
  if (!model.station) throw Error("Prefab pilot station required");
  const computers = model.fittings.filter((f) => f.role === "computer").sort((a, b) => (a.sourceId < b.sourceId ? -1 : 1));
  const actuators = model.fittings.filter((f) => f.role === "actuator");
  if (!computers.length || !actuators.length) throw Error("Prefab flight needs a computer core and thrust");
  validateSpacePoint(placement);
  if (!placement.systemId || placement.systemId.length > 160 || placement.serverTick < 0n)
    throw Error("Valid server-selected system sample required");
  if (reservedIds.length > 16384) throw Error("Flight identity budget exceeded");
  const used = new Set([instance.id, ...reservedIds].map((s) => s.toLowerCase()));
  const fresh = () => {
    const id = allocate();
    if (!UUID.test(id) || used.has(id.toLowerCase())) throw Error("Fresh flight UUID required");
    used.add(id.toLowerCase());
    return id;
  };
  const shipId = instance.id;
  const parts = new Map(model.parts.map((p) => [p.sourceId, p]));
  const definitions = new Map(model.catalog.definitions.map((d) => [d.id, d]));
  const computerPart = parts.get(computers[0].sourceId)!;
  const computerDefinition = definitions.get(computerPart.definitionId) as ComputerDefinition;
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
    const axis: [number, number] = [c * d.forceAxis[0] - s * d.forceAxis[1], s * d.forceAxis[0] + c * d.forceAxis[1]];
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
