import type { Infer } from "spacetimedb/server";
import type {
  constructionFlightBinding,
  constructionFlightFitting,
} from "./construction-flight-tables";
import {
  CONSTRUCTION_FLIGHT_DEFINITION,
  CONSTRUCTION_FLIGHT_DEFINITION_SHA256,
} from "../../sim/src/construction-flight";
import { isQualifiedWayfarerBlueprint } from "../../sim/src/wayfarer-walking-bindings";
import {
  WAYFARER_FLIGHT_PROFILE,
  WAYFARER_FLIGHT_SPEED,
  WAYFARER_PHYSICAL_CATALOG,
} from "../../content/src/physical-definitions";
import {
  flightDefinitionCatalogHash,
  type CompiledFlightActuator,
  type CompiledFlightComputer,
  type CompiledFlightHull,
} from "../../sim/src/flight-definition";
import type { FlightEnvelope } from "../../sim/src/ifcs";
import { PREFAB_FLIGHT_DEFINITION } from "@sidereal/sim/prefab-flight";
/** Prefab physical definitions pair `prefab-component:<id>` with `prefab-fitting:<id>`. */
const prefabFittingFor = (definitionId: string) =>
  definitionId.startsWith("prefab-component:")
    ? "prefab-fitting:" + definitionId.slice("prefab-component:".length)
    : null;
import type { CompiledFlightRow } from "./construction-flight-compilation";
export type ConstructionFlightBindingRow = Infer<
  typeof constructionFlightBinding.rowType
>;
export type ConstructionFlightFittingRow = Infer<
  typeof constructionFlightFitting.rowType
>;
export interface FlightDefinitionReader {
  binding(shipId: string): ConstructionFlightBindingRow | undefined | null;
  constructionInstanceExists(shipId: string): boolean;
  currentInstanceRevision(instanceId: string): bigint | undefined;
  fittings(shipId: string): Iterable<ConstructionFlightFittingRow>;
  compiled(shipId: string): CompiledFlightRow | undefined | null;
  dirty(shipId: string): boolean;
}
const catalogHash = flightDefinitionCatalogHash(WAYFARER_PHYSICAL_CATALOG);
/** Current binding and compiled state are both required. A missing authored
 * installation can be migrated explicitly; it never selects a stock fixture. */
export function resolveShipFlightDefinition(
  db: FlightDefinitionReader,
  shipId: string,
) {
  const binding = db.binding(shipId),
    compiled = db.compiled(shipId);
  let reason = "";
  // Prefab bindings are written only by trusted prefab installation; their pin is the
  // prefab physical catalog hash, compared with the compiled definition hash below.
  const prefab =
    !!binding &&
    binding.definitionId === PREFAB_FLIGHT_DEFINITION &&
    /^[0-9a-f]{64}$/.test(binding.definitionSha256);
  if (!binding) reason = "missing-authored-flight-binding";
  else if (
    binding.shipId !== shipId ||
    binding.instanceId !== shipId ||
    binding.instanceRevision !== db.currentInstanceRevision(shipId) ||
    (!prefab &&
      (!isQualifiedWayfarerBlueprint(binding.blueprintSha256) ||
        binding.definitionId !== CONSTRUCTION_FLIGHT_DEFINITION ||
        binding.definitionSha256 !== CONSTRUCTION_FLIGHT_DEFINITION_SHA256))
  )
    reason = "authored-flight-definition-mismatch";
  else if (!["active", "installed-dormant"].includes(binding.lifecycle))
    reason = "invalid-flight-lifecycle";
  if (!compiled)
    return {
      status: "invalid" as const,
      reason: reason || "flight-compilation-pending",
    };
  const rows: ConstructionFlightFittingRow[] = [];
  for (const row of db.fittings(shipId)) {
    if (rows.length === 256) {
      reason = "flight-fitting-budget";
      break;
    }
    rows.push(row);
  }
  if (
    new Set(rows.map((r) => r.id)).size !== rows.length ||
    new Set(rows.map((r) => r.placedObjectId)).size !== rows.length ||
    new Set(rows.map((r) => r.sourceDeviceId)).size !== rows.length ||
    rows.some(
      (r) =>
        r.shipId !== shipId ||
        !r.id ||
        !r.placedObjectId ||
        !r.sourceDeviceId ||
        !Number.isFinite(r.availability) ||
        r.availability < 0 ||
        r.availability > 1 ||
        !Number.isInteger(r.definitionRevision) ||
        r.definitionRevision < 1,
    )
  )
    reason = "invalid-flight-fittings";
  if (db.dirty(shipId)) reason = reason || "flight-compilation-pending";
  if (compiled.status !== "ready")
    reason = reason || compiled.reason || "flight-compilation-rejected";
  if (compiled.definitionHash !== (prefab ? binding!.definitionSha256 : catalogHash))
    reason = reason || "physical-definition-catalog-mismatch";
  if (
    compiled.shipId !== shipId ||
    ![
      compiled.massKg,
      compiled.centerX,
      compiled.centerY,
      compiled.inertiaKgM2,
    ].every(Number.isFinite) ||
    compiled.massKg <= 0 ||
    compiled.inertiaKgM2 <= 0
  )
    return {
      status: "invalid" as const,
      reason: reason || "missing-valid-flight-inertia",
    };
  try {
    const hull = JSON.parse(compiled.hullJson) as CompiledFlightHull;
    if (
      !hull ||
      ![
        hull.radius,
        hull.halfLength,
        hull.lateralOffset,
        hull.longitudinalOffset,
        hull.authoredMidpointX,
        hull.authoredMidpointY,
      ].every(Number.isFinite) ||
      hull.lateralOffset !== hull.authoredMidpointX - compiled.centerX ||
      hull.longitudinalOffset !== hull.authoredMidpointY - compiled.centerY
    )
      throw Error("invalid-compiled-flight-hull");
    let actuators = reason
      ? []
      : (JSON.parse(compiled.actuatorsJson) as CompiledFlightActuator[]);
    let computers = reason
      ? []
      : (JSON.parse(compiled.computersJson) as CompiledFlightComputer[]);
    const byId = new Map(rows.map((r) => [r.id, r]));
    if (
      !Array.isArray(actuators) ||
      !Array.isArray(computers) ||
      actuators.length > 256 ||
      computers.length > 256
    )
      throw Error("invalid-compiled-flight-devices");
    for (const device of [...actuators, ...computers]) {
      const fitting = byId.get(device.id);
      const physical = prefab
        ? device.definitionRevision === 1 && prefabFittingFor(device.definitionId)
          ? { fittingDefinitionId: prefabFittingFor(device.definitionId)! }
          : undefined
        : WAYFARER_PHYSICAL_CATALOG.definitions.find(
            (d) =>
              d.id === device.definitionId &&
              d.revision === device.definitionRevision,
          );
      if (
        !physical ||
        !("fittingDefinitionId" in physical) ||
        physical.fittingDefinitionId !== fitting?.definitionId ||
        !fitting ||
        fitting.placedObjectId !== device.placedObjectId ||
        fitting.definitionRevision !== device.definitionRevision ||
        !fitting.installed
      ) {
        reason = "stale-compiled-flight-device";
        break;
      }
      if (
        "availability" in device &&
        device.availability !== (fitting.powered ? fitting.availability : 0)
      ) {
        reason = "stale-compiled-flight-availability";
        break;
      }
    }
    if (reason) {
      actuators = [];
      computers = [];
    }
    const computer =
      computers.find(
        (c) => c.installed && c.powered && byId.get(c.id)?.powered,
      ) ?? computers.find((c) => c.installed);
    return {
      status: reason
        ? ("rejected" as const)
        : binding?.lifecycle === "active"
          ? ("ready" as const)
          : ("dormant" as const),
      reason,
      kind: "construction" as const,
      mass: {
        massKg: compiled.massKg,
        centerX: compiled.centerX,
        centerY: compiled.centerY,
        inertiaKgM2: compiled.inertiaKgM2,
      },
      hull,
      profile: WAYFARER_FLIGHT_PROFILE,
      speed: WAYFARER_FLIGHT_SPEED,
      envelope: reason
        ? {
            forward: 0,
            reverse: 0,
            left: 0,
            right: 0,
            angularPositive: 0,
            angularNegative: 0,
          }
        : (JSON.parse(compiled.envelopeJson) as FlightEnvelope),
      stationId: binding?.stationId ?? "",
      deckId: binding?.deckId ?? "",
      computer: {
        id: computer?.id ?? "",
        installed: !!computer,
        powered:
          !reason &&
          binding?.lifecycle === "active" &&
          !!computer?.powered &&
          !!byId.get(computer.id)?.powered,
      },
      actuators: actuators.map((a) => ({
        ...a,
        sourceDeviceId: byId.get(a.id)!.sourceDeviceId,
      })),
    };
  } catch (error) {
    return {
      status: "invalid" as const,
      reason: String(error instanceof Error ? error.message : error),
    };
  }
}
