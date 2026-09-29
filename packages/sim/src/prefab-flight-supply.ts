/**
 * Resource supply of prefab flight actuators (FLIGHT-IFCS, 2026-09-29). Pure and deterministic.
 *
 * Owner: "each thruster, while properly fueled or powered (some engines might not need traditional
 * fuel) ... No propellant or power means no thrust." Every actuator reads its component's catalogue
 * definition:
 * - a drive or RCS nozzle whose component burns propellant (`fluids.fuelActiveLps > 0`) is supplied
 *   only while at least one of the ship's fuel tanks is intact (damage performance > 0);
 * - one that draws power (`power.activeKw > 0`) is supplied only while the ship has a working
 *   generator (rated output x damage performance > 0);
 * - a propellant-free, power-free actuator is always supplied.
 * Partial brownout (generator damage below the fitted draw) already reaches actuators through the
 * fitting availability (`prefabPowerFactor`, combat-damage), so this factor is 0 or 1 and never
 * double-counts it.
 *
 * Provisional until S4-3 (tank contents) and S4-2 (network flow): tanks are treated as full and no
 * propellant or energy is debited. The result feeds `FlightDefinitionInput.supply`, where 0 keeps
 * the part's mass but cuts its thrust.
 */
import type { ShipPrefabDocumentV1 } from "@sidereal/content/ship-prefab";
import { prefabComponentDefinition } from "./prefab-deck-objects";

export interface PrefabActuatorNeeds {
  fuel: boolean;
  power: boolean;
}

/** Mount id of a prefab flight source id (`mount-<id>`, `mount-<id>#reverser`, `mount-<id>#fore`). */
export const prefabSourceMountId = (sourceId: string) =>
  sourceId.startsWith("mount-")
    ? sourceId.slice("mount-".length).split("#")[0]
    : undefined;

export interface PrefabSupplyState {
  /** Propellant reaches fuel-burning actuators (an intact tank exists). */
  fuel: boolean;
  /** A generator produces power for power-drawing actuators. */
  power: boolean;
}

/** Ship-level supply facts from the pinned document and component damage performance. */
export function prefabSupplyState(
  doc: ShipPrefabDocumentV1,
  catalogRevision: string,
  performance: (mountId: string) => number,
): PrefabSupplyState {
  let fuel = false,
    power = false;
  for (const m of doc.mounts) {
    const d = prefabComponentDefinition(m.component, catalogRevision);
    if (!d) continue;
    const p = Math.max(0, Math.min(1, performance(m.id)));
    if (d.fluids.fuelCapacityL > 0 && p > 0) fuel = true;
    if (d.power.generationKw > 0 && p > 0) power = true;
  }
  return { fuel, power };
}

/** What an actuator's component needs to produce thrust. */
export function prefabActuatorNeeds(
  componentId: string,
  catalogRevision: string,
): PrefabActuatorNeeds {
  const d = prefabComponentDefinition(componentId, catalogRevision);
  if (!d) throw Error(`Unknown component ${componentId}`);
  return {
    fuel: d.fluids.fuelActiveLps > 0,
    power: d.power.activeKw > 0,
  };
}

/**
 * Supply factor (0 or 1) per actuator source id of a prefab flight model. `sourceIds` are the
 * model's actuator fitting source ids; unknown mounts fail closed (0).
 */
export function prefabActuatorSupply(
  doc: ShipPrefabDocumentV1,
  catalogRevision: string,
  sourceIds: readonly string[],
  performance: (mountId: string) => number,
): Record<string, number> {
  const state = prefabSupplyState(doc, catalogRevision, performance);
  const mounts = new Map(doc.mounts.map((m) => [m.id, m]));
  const out: Record<string, number> = {};
  for (const sourceId of sourceIds) {
    const mount = mounts.get(prefabSourceMountId(sourceId) ?? "");
    if (!mount) {
      out[sourceId] = 0;
      continue;
    }
    const needs = prefabActuatorNeeds(mount.component, catalogRevision);
    out[sourceId] =
      (needs.fuel && !state.fuel) || (needs.power && !state.power) ? 0 : 1;
  }
  return out;
}
