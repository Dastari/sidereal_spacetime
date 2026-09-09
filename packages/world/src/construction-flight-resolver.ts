import type { Infer } from "spacetimedb/server";
import type {
  constructionFlightBinding,
  constructionFlightFitting,
} from "./construction-flight-tables";
import {
  CONSTRUCTION_FLIGHT_DEFINITION,
  CONSTRUCTION_FLIGHT_DEFINITION_SHA256,
} from "../../sim/src/construction-flight";
import { QUALIFIED_WAYFARER_SHA256 } from "../../sim/src/wayfarer-walking-bindings";
import {
  LAB_FLIGHT_ACTUATORS,
  LAB_FLIGHT_COMPUTER,
  LAB_FLIGHT_MASS,
  LAB_FLIGHT_PROFILE,
  LAB_FLIGHT_SPEED,
} from "@sidereal/content/flight";
import { LAB_HULL } from "@sidereal/content/space";
export type ConstructionFlightBindingRow = Infer<
  typeof constructionFlightBinding.rowType
>;
export type ConstructionFlightFittingRow = Infer<
  typeof constructionFlightFitting.rowType
>;
export interface FlightDefinitionReader {
  binding(shipId: string): ConstructionFlightBindingRow | undefined | null;
  /** Distinguishes legacy stock from a broken/missing authored binding. */
  constructionInstanceExists(shipId: string): boolean;
  currentInstanceRevision(instanceId: string): bigint | undefined;
  fittings(shipId: string): Iterable<ConstructionFlightFittingRow>;
}
/** Called once per ship/tick, independent of observers. Uses bounded scalar rows,
 * not document reconstruction each frame. Installation pins the source; refit
 * must increment instance revision and recompile before flight can resume. */
export function resolveShipFlightDefinition(
  db: FlightDefinitionReader,
  shipId: string,
) {
  const binding = db.binding(shipId);
  const standard = {
    mass: LAB_FLIGHT_MASS,
    hull: LAB_HULL,
    profile: LAB_FLIGHT_PROFILE,
    speed: LAB_FLIGHT_SPEED,
  };
  if (!binding)
    return db.constructionInstanceExists(shipId)
      ? {
          status: "invalid" as const,
          reason: "missing-authored-flight-binding",
        }
      : {
          status: "ready" as const,
          kind: "legacy-stock" as const,
          ...standard,
          computer: LAB_FLIGHT_COMPUTER,
          actuators: LAB_FLIGHT_ACTUATORS,
        };
  if (
    binding.shipId !== shipId ||
    binding.instanceId !== shipId ||
    binding.instanceRevision !== db.currentInstanceRevision(shipId) ||
    binding.blueprintSha256 !== QUALIFIED_WAYFARER_SHA256 ||
    binding.definitionId !== CONSTRUCTION_FLIGHT_DEFINITION ||
    binding.definitionSha256 !== CONSTRUCTION_FLIGHT_DEFINITION_SHA256
  )
    return {
      status: "invalid" as const,
      reason: "authored-flight-definition-mismatch",
    };
  if (!["active", "installed-dormant"].includes(binding.lifecycle))
    return { status: "invalid" as const, reason: "invalid-flight-lifecycle" };
  const rows: ConstructionFlightFittingRow[] = [];
  for (const row of db.fittings(shipId)) {
    if (rows.length >= 10)
      return { status: "invalid" as const, reason: "flight-fitting-budget" };
    rows.push(row);
  }
  if (
    rows.length !== 10 ||
    new Set(rows.map((r) => r.id)).size !== 10 ||
    new Set(rows.map((r) => r.sourceDeviceId)).size !== 10 ||
    new Set(rows.map((r) => r.placedObjectId)).size !== 10 ||
    rows.some(
      (r) =>
        r.shipId !== shipId ||
        !r.id ||
        !r.placedObjectId ||
        !Number.isFinite(r.availability) ||
        r.availability < 0 ||
        r.availability > 1,
    )
  )
    return { status: "invalid" as const, reason: "incomplete-flight-fittings" };
  const computer = rows.find(
    (r) => r.sourceDeviceId === LAB_FLIGHT_COMPUTER.id,
  );
  if (
    !computer ||
    computer.kind !== "computer" ||
    computer.definitionId !== LAB_FLIGHT_COMPUTER.definitionId
  )
    return { status: "invalid" as const, reason: "invalid-flight-computer" };
  const actuators = [];
  for (const source of LAB_FLIGHT_ACTUATORS) {
    const actual = rows.find((r) => r.sourceDeviceId === source.id);
    if (
      !actual ||
      actual.kind !== "actuator" ||
      actual.definitionId !== source.definitionId
    )
      return { status: "invalid" as const, reason: "invalid-flight-actuator" };
    actuators.push({
      ...source,
      id: actual.id,
      sourceDeviceId: source.id,
      placedObjectId: actual.placedObjectId,
      availability:
        actual.installed && actual.powered ? actual.availability : 0,
    });
  }
  return {
    status:
      binding.lifecycle === "active"
        ? ("ready" as const)
        : ("dormant" as const),
    kind: "construction" as const,
    ...standard,
    stationId: binding.stationId,
    deckId: binding.deckId,
    computer: {
      ...LAB_FLIGHT_COMPUTER,
      id: computer.id,
      installed: computer.installed,
      powered: binding.lifecycle === "active" && computer.powered,
    },
    actuators,
  };
}
