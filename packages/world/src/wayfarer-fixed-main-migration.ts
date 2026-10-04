/** One bounded server-owned correction of existing authored fixed-nozzle installations.
 * Uses the normal dirty queue; never replaces a ship or edits its pinned hardware. */
import type { Infer } from "spacetimedb/server";
import type { constructionInstance } from "./construction-tables";
import type { gameShipAccess } from "./game-ship-access-tables";
import type {
  constructionFlightBinding,
  constructionFlightFitting,
  constructionFlightReceipt,
} from "./construction-flight-tables";
import type { actuatorOutput } from "./space";
import {
  PREFAB_FLIGHT_DEFINITION,
  prefabFlightModelFor,
  prefabPlacedObjectId,
} from "@sidereal/sim/prefab-flight";
import { flightDefinitionCatalogHash } from "@sidereal/sim/flight-definition";
import {
  markFlightDirty,
  type FlightCompilationDatabase,
} from "./construction-flight-compilation";

type Instance = Infer<typeof constructionInstance.rowType>;
type Access = Infer<typeof gameShipAccess.rowType>;
type Binding = Infer<typeof constructionFlightBinding.rowType>;
type Fitting = Infer<typeof constructionFlightFitting.rowType>;
type Receipt = Infer<typeof constructionFlightReceipt.rowType>;
type Output = Infer<typeof actuatorOutput.rowType>;
interface Find<Row> {
  find(id: string): Row | null | undefined;
}
export interface FixedMainMigrationDatabase extends FlightCompilationDatabase {
  constructionInstance: { id: Find<Instance> };
  gameShipAccess: { shipId: Find<Access> };
  constructionFlightBinding: { shipId: Find<Binding> };
  constructionFlightFitting: {
    by_ship: { filter(shipId: string): Iterable<Fitting> };
  };
  constructionFlightReceipt: {
    id: Find<Receipt>;
    insert(row: Receipt): unknown;
  };
  actuatorOutput: {
    by_ship: { filter(shipId: string): Iterable<Output> };
    id: { update(row: Output): unknown };
  };
}

/** Called only from the already bounded trusted shared-world schedule. The persistent receipt
 * is committed with the dirty marker/output clear, so rollback cannot suppress a retry. */
export function queueWayfarerFixedMainCorrection(
  db: FixedMainMigrationDatabase,
  shipId: string,
  timestamp: bigint,
): boolean {
  const access = db.gameShipAccess.shipId.find(shipId);
  const binding = db.constructionFlightBinding.shipId.find(shipId);
  if (
    !access ||
    !binding ||
    access.lifecycle !== "active" ||
    binding.lifecycle !== "active" ||
    binding.definitionId !== PREFAB_FLIGHT_DEFINITION ||
    access.instanceId !== binding.instanceId ||
    access.instanceRevision !== binding.instanceRevision ||
    access.templateSha256 !== binding.blueprintSha256 ||
    access.deckId !== binding.deckId ||
    !access.owner.isEqual(binding.owner)
  )
    return false;
  const instance = db.constructionInstance.id.find(binding.instanceId);
  if (
    !instance ||
    instance.id !== shipId ||
    instance.revision !== binding.instanceRevision ||
    instance.blueprintSha256 !== binding.blueprintSha256 ||
    !instance.owner.isEqual(binding.owner)
  )
    return false;
  const receiptId = JSON.stringify([
    "wayfarer-fixed-main-v1",
    shipId,
    instance.revision.toString(),
    instance.blueprintSha256,
    binding.definitionSha256,
  ]);
  if (db.constructionFlightReceipt.id.find(receiptId)) return false;
  let model;
  try {
    model = prefabFlightModelFor(
      `${instance.id}:${instance.blueprintSha256}`,
      instance.documentJson,
    );
  } catch {
    // A malformed/unqualified source must not stall the other ships' schedule.
    return false;
  }
  if (
    !model.disabledActuatorSources?.length ||
    flightDefinitionCatalogHash(model.catalog) !== binding.definitionSha256
  )
    return false;
  const expected = new Set(model.disabledActuatorSources);
  const disabledFittings = new Set<string>();
  let count = 0;
  for (const fitting of db.constructionFlightFitting.by_ship.filter(shipId)) {
    if (++count > 256) throw Error("fixed-main-fitting-budget");
    if (
      fitting.shipId === shipId &&
      fitting.kind === "actuator" &&
      expected.has(fitting.sourceDeviceId) &&
      fitting.placedObjectId ===
        prefabPlacedObjectId(shipId, fitting.sourceDeviceId)
    )
      disabledFittings.add(fitting.id);
  }
  if (disabledFittings.size !== expected.size)
    throw Error("fixed-main-installation-mismatch");
  let cleared = 0;
  count = 0;
  for (const output of db.actuatorOutput.by_ship.filter(shipId)) {
    if (++count > 256) throw Error("fixed-main-output-budget");
    if (
      output.shipId === shipId &&
      disabledFittings.has(output.actuatorId) &&
      output.throttle !== 0
    ) {
      db.actuatorOutput.id.update({ ...output, throttle: 0 });
      cleared++;
    }
  }
  markFlightDirty(db, shipId, timestamp);
  db.constructionFlightReceipt.insert({
    id: receiptId,
    owner: binding.owner,
    requestJson: JSON.stringify({
      kind: "wayfarer-fixed-main-v1",
      disabledSources: model.disabledActuatorSources,
      clearedOutputs: cleared,
      status: "queued",
    }),
    instanceId: instance.id,
    shipId,
    stationId: binding.stationId,
    revision: instance.revision,
  });
  return true;
}
