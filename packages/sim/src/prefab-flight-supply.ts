/**
 * Resource supply of prefab flight actuators (FLIGHT-IFCS, 2026-09-29). Pure and deterministic.
 *
 * Owner: "each thruster, while properly fueled or powered (some engines might not need traditional
 * fuel) ... No propellant or power means no thrust." One rule with the ship-systems budget: every
 * actuator reads its placement's availability from the S4-1 compile (`shipSystemsAvailability`):
 * - a drive or RCS nozzle whose component burns propellant is supplied only while it shares a fuel
 *   network with a fuel tank that is not destroyed;
 * - one that draws power is supplied only while the ship's generation reaches it (a destroyed or
 *   missing reactor leaves none);
 * - a propellant-free, power-free actuator is always supplied (the Aurelian resonance drive burns
 *   no propellant).
 * The factor is 0 or 1. Partial brownout (generator damage below the fitted draw) reaches actuators
 * through the fitting availability (`prefabPowerFactor`, combat damage) until S4-2 replaces it, so
 * this factor never double-counts it.
 *
 * Provisional until S4-3 (tank contents): tanks count as full and no propellant or energy is
 * debited. The result feeds `FlightDefinitionInput.supply`, where 0 keeps the part's mass but cuts
 * its thrust.
 */
import type { ShipPrefabDocumentV1 } from "@sidereal/content/ship-prefab";
import {
  compilePrefabShipSystems,
  shipSystemsAvailability,
  type PrefabComponentCondition,
} from "./prefab-ship-systems";

/** Mount id of a prefab flight source id (`mount-<id>`, `mount-<id>#reverser`, `mount-<id>#fore`). */
export const prefabSourceMountId = (sourceId: string) =>
  sourceId.startsWith("mount-")
    ? sourceId.slice("mount-".length).split("#")[0]
    : undefined;

/**
 * Supply factor (0 or 1) per actuator source id of a prefab flight model. `performance(mountId)` is
 * the component damage-state output (1 when undamaged). Unknown mounts fail closed (0).
 */
export function prefabActuatorSupply(
  doc: ShipPrefabDocumentV1,
  catalogRevision: string,
  sourceIds: readonly string[],
  performance: (mountId: string) => number,
): Record<string, number> {
  const damage: PrefabComponentCondition[] = [];
  for (const m of doc.mounts) {
    const p = performance(m.id);
    if (p !== 1)
      damage.push({
        objectId: `mount:${m.id}`,
        performance: Math.max(0, Math.min(1, p)),
      });
  }
  const availability = shipSystemsAvailability(
    compilePrefabShipSystems(doc, catalogRevision, damage),
    "cruise",
  );
  const out: Record<string, number> = {};
  for (const sourceId of sourceIds) {
    const a = availability[`mount:${prefabSourceMountId(sourceId) ?? ""}`];
    out[sourceId] = a && a.fuel > 0 && a.power > 0 ? 1 : 0;
  }
  return out;
}
