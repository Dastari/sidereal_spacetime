/**
 * Prefab ship -> ship-systems compile (S4-1). One pure adapter from a trusted prefab binding
 * (grammar document + pinned component catalogue revision) and the ship's component damage to
 * `compileShipSystems`, shared by the world authority (private `ship_systems_state` rows) and the
 * client estimator, so the two can never disagree about the same inputs.
 *
 * - Placement ids are the placed-object ids combat damage uses (`mount:<mountId>`), never the
 *   reusable catalogue id.
 * - Every non-interior mount gets its own synthetic hardpoint at exactly its placement (the
 *   prefab grammar already validated the mount; this only restates it in ship-systems terms).
 * - Networks use bus mode (every compatible port on the ship joined), the default for prefab
 *   ships; explicit routes arrive with the Shipyard route tools.
 * - Tanks and magazines are reported full: fuel and ammunition contents are S4-3 runtime state.
 * - Roof mount tiles add their plinth/ring mass to the hull; their traverse-drive power is not a
 *   catalogue component and is not in the budget yet.
 *
 * This is a budget, not a resource simulation: nothing here moves fuel or energy or grants
 * control. Deterministic and bounded; inputs are never mutated.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { composedShipComponentCatalog } from "./component-catalogs";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import {
  SHIP_COMPONENT_CATALOG_ID,
  SHIP_COMPONENT_CATALOG_REVISIONS,
  buildShipComponentCatalog,
  type ShipComponentCatalogRevision,
} from "@sidereal/content/ship-components-source";
import {
  SHIP_SIZE_CELLS,
  SHIP_SIZE_CLASSES,
  type ShipComponentCatalog,
  type ShipComponentDefinition,
  type ShipComponentPlacement,
  type ShipHardpoint,
  type ShipHullSystemsProfile,
  type ShipSizeClass,
} from "@sidereal/content/ship-components";
import {
  placeMount,
  prefabStats,
  volumeGeometry,
  type ShipPrefabDocumentV1,
} from "@sidereal/content/ship-prefab";
import { mountTileSpec } from "@sidereal/content/ship-mount-tiles";
import { G } from "@sidereal/content/construction-grammar";
import { prefabComponentCatalogFor } from "./prefab-catalog";
import { prefabToShipMetres } from "./prefab-construction";
import {
  compileShipSystems,
  type ShipSystemsInput,
  type ShipSystemsMode,
  type ShipSystemsReport,
} from "./ship-systems";

/** Bump when the adapter's mapping changes, so stored compiles are recomputed. */
export const PREFAB_SHIP_SYSTEMS_REVISION = 1;
/** Placed-object id of a prefab mount (same as `ship_component_damage.objectId`). */
export const prefabMountObjectId = (mountId: string) => `mount:${mountId}`;

const SIZE: Record<string, ShipSizeClass> = {
  S: "SM",
  M: "MD",
  L: "LG",
  XL: "XL",
};
/** Bare-hull radiative rejection by size (kW), as in the reference fits. Proposed. */
const PASSIVE_REJECTION_KW: Record<ShipSizeClass, number> = {
  SM: 15,
  MD: 30,
  LG: 60,
  XL: 120,
};

/** The hardpoint the mount was validated against: the component's own size, or for edge
 * openings (measured by width, 2 m per size cell) the opening exactly as wide as the part. */
function hardpointSize(
  d: ShipComponentDefinition | undefined,
  attach: string,
): ShipSizeClass {
  if (!d) return "SM";
  if (attach === "edge")
    return (
      SHIP_SIZE_CLASSES.find(
        (s) => 2 * SHIP_SIZE_CELLS[s] === d.mount.cells[0],
      ) ?? d.sizeClass
    );
  return d.sizeClass;
}

const catalogs = new Map<string, ShipComponentCatalog>();
/** The full ship component catalogue for a prefab binding's pinned revision string. */
export function shipComponentCatalogFor(
  revision: string,
): ShipComponentCatalog {
  const composed = composedShipComponentCatalog(revision);
  if (composed) return composed;
  let catalog = catalogs.get(revision);
  if (!catalog) {
    const n = SHIP_COMPONENT_CATALOG_REVISIONS.find(
      (r) => revision === `${SHIP_COMPONENT_CATALOG_ID}@${r}`,
    );
    if (n === undefined)
      throw Error(`Unsupported ship component catalog ${revision}`);
    catalog = buildShipComponentCatalog(n as ShipComponentCatalogRevision);
    catalogs.set(revision, catalog);
  }
  return catalog;
}

export interface PrefabComponentCondition {
  /** `mount:<mountId>` */
  objectId: string;
  /** Damage-state performance 0..1. */
  performance: number;
}

/** The `compileShipSystems` input for a prefab ship at a catalogue revision and damage state. */
export function prefabShipSystemsInput(
  doc: ShipPrefabDocumentV1,
  catalogRevision: string,
  damage: readonly PrefabComponentCondition[] = [],
): ShipSystemsInput {
  const catalog = shipComponentCatalogFor(catalogRevision);
  const specs = prefabComponentCatalogFor(catalogRevision);
  const toShip = prefabToShipMetres(doc);
  const geoms = doc.volumes.map(volumeGeometry);
  const stats = prefabStats(doc, specs);
  const hardpoints: ShipHardpoint[] = [];
  const components: ShipComponentPlacement[] = [];
  const defs = new Map(catalog.components.map((c) => [c.id, c]));
  for (const m of doc.mounts) {
    const spec = specs.get(m.component);
    const mp = placeMount(m, spec, geoms, doc);
    const [x, y] = toShip(mp.anchor);
    const position: [number, number, number] = [x, y, mp.anchorZ / 16];
    const id = prefabMountObjectId(m.id);
    let hardpointId: string | null = null;
    if (m.attach !== "interior") {
      hardpointId = `hardpoint:${m.id}`;
      hardpoints.push({
        id: hardpointId,
        socket:
          m.attach === "face"
            ? mp.rear && spec?.attach.includes("rear")
              ? "rear"
              : "face"
            : m.attach,
        sizeClass: hardpointSize(defs.get(m.component), m.attach),
        position,
        quarterTurns: mp.quarterTurns,
        reflected: false,
      });
    }
    components.push({
      id,
      componentId: m.component,
      position,
      quarterTurns: mp.quarterTurns,
      reflected: false,
      hardpointId,
    });
  }
  const tileMassKg = (doc.mountTiles ?? []).reduce(
    (kg, t) => kg + (mountTileSpec(t.kind, t.size)?.massKg ?? 0),
    0,
  );
  const heightM = Math.max(
    0,
    ...doc.volumes.map((v) => {
      const [z0, z1] = G.heightClasses[v.height].z;
      return (z1 - z0) / 16;
    }),
  );
  const sizeClass = SIZE[doc.sizeClass] ?? "SM";
  const hull: ShipHullSystemsProfile = {
    id: `prefab:${doc.id}:r${doc.revision}`,
    sizeClass,
    massKg: stats.structureMassKg + tileMassKg,
    lengthM: stats.lengthM,
    beamM: stats.beamM,
    heightM,
    decks: doc.decks.length,
    passiveHeatRejectionKw: PASSIVE_REJECTION_KW[sizeClass],
    hardpoints,
  };
  const known = new Set(components.map((c) => c.id));
  const performance: Record<string, number> = {};
  for (const d of [...damage].sort((a, b) =>
    a.objectId < b.objectId ? -1 : a.objectId > b.objectId ? 1 : 0,
  ))
    if (known.has(d.objectId) && Number.isFinite(d.performance))
      performance[d.objectId] = Math.min(1, Math.max(0, d.performance));
  return {
    catalog,
    hull,
    components,
    ...(Object.keys(performance).length ? { performance } : {}),
  };
}

export interface PrefabShipSystemsCompile {
  input: ShipSystemsInput;
  report: ShipSystemsReport;
  /** sha256 of everything the report depends on (dirty detection, not authority). */
  inputHash: string;
  damaged: number;
  destroyed: number;
}

/** Compile a prefab ship's systems budget. Throws only on malformed prefab or catalogue input. */
export function compilePrefabShipSystems(
  doc: ShipPrefabDocumentV1,
  catalogRevision: string,
  damage: readonly PrefabComponentCondition[] = [],
): PrefabShipSystemsCompile {
  const input = prefabShipSystemsInput(doc, catalogRevision, damage);
  const performance = input.performance ?? {};
  const inputHash = bytesToHex(
    sha256(
      utf8ToBytes(
        JSON.stringify({
          adapter: PREFAB_SHIP_SYSTEMS_REVISION,
          catalog: catalogRevision,
          prefab: [doc.id, doc.revision],
          hull: input.hull,
          components: input.components,
          performance,
        }),
      ),
    ),
  );
  const values = Object.values(performance);
  return {
    input,
    report: compileShipSystems(input),
    inputHash,
    damaged: values.filter((v) => v < 1).length,
    destroyed: values.filter((v) => v <= 0).length,
  };
}

/**
 * What a placed component can deliver by the compiled budget (S4-1 interface for flight and module
 * performance; S4-1 itself gates nothing on it):
 * - `power`: supplied fraction of its power demand in `mode` after priority brownout (1 when it
 *   draws no power);
 * - `fuel`: 1 when it burns fuel and shares a fuel network with a tank that is not destroyed (or it
 *   burns none), else 0 (bus mode joins every fuel port);
 * - `performance`: its damage-state output multiplier.
 * Keys are placement ids (`mount:<mountId>`); flight fittings name the same mount as
 * `mount-<mountId>` (reversers `mount-<mountId>#reverser`).
 */
export interface PlacementAvailability {
  power: number;
  fuel: number;
  performance: number;
}
export function shipSystemsAvailability(
  compiled: Pick<PrefabShipSystemsCompile, "input" | "report">,
  mode: ShipSystemsMode = "combat",
): Record<string, PlacementAvailability> {
  const { input, report } = compiled;
  const defs = new Map(input.catalog.components.map((c) => [c.id, c]));
  const perf = (id: string) => input.performance?.[id] ?? 1;
  const componentOf = new Map(input.components.map((p) => [p.id, p]));
  const fed = new Set<string>();
  for (const network of report.networks) {
    if (network.channel !== "fuel") continue;
    const live = network.members.some((id) => {
      const d = defs.get(componentOf.get(id)?.componentId ?? "");
      return !!d && d.fluids.fuelCapacityL > 0 && perf(id) > 0;
    });
    if (live) for (const id of network.members) fed.add(id);
  }
  const supply = report.power.modes[mode].supply;
  const out: Record<string, PlacementAvailability> = {};
  for (const p of [...input.components].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )) {
    const d = defs.get(p.componentId);
    if (!d) continue;
    const burns = d.fluids.fuelActiveLps > 0 || d.fluids.fuelIdleLps > 0;
    out[p.id] = {
      power: d.power.peakKw > 0 ? (supply[p.id] ?? 0) : 1,
      fuel: burns ? (fed.has(p.id) ? 1 : 0) : 1,
      performance: perf(p.id),
    };
  }
  return out;
}
