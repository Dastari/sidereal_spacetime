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
