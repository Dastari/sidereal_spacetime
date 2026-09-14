import {
  planQualifiedConstructionFlight,
  type ConstructionFlightPlan,
  type FlightSpawnPlacement,
  type QualifiedFlightInstance,
} from "@sidereal/sim/construction-flight";

export interface ConstructionFlightRequest {
  instanceId: string;
  expectedInstanceRevision: bigint;
  operationId: string;
}
export interface ConstructionFlightReceipt {
  id: string;
  requestJson: string;
  instanceId: string;
  shipId: string;
  stationId: string;
  revision: bigint;
}
/** Synchronous reducer-transaction contract. No deferred writes or client plan.
 * A concrete ctx.db adapter must retain private tables and auth.gameAction.
 * All installation paths delegate to the same validated transaction writer. */
export interface ConstructionFlightRepository {
  principalId: string;
  requireLiveGame(): void;
  /** Rechecks actor ownership + current workspace instance.spawn capability.
   * Does not require or fabricate a review visit or seat occupancy. */
  accessibleInstance(id: string): QualifiedFlightInstance | undefined;
  receipt(id: string): ConstructionFlightReceipt | undefined;
  existingBinding(instanceId: string): unknown;
  shipExists(shipId: string): boolean;
  /** Complete bounded occupied-system query; canonical-system capacity and
   * current body clearance must be checked in this same transaction. */
  reserveServerBerth(instanceId: string): FlightSpawnPlacement;
  allocateUuid(): string;
  identityExists(id: string): boolean;
  insertPlan(plan: ConstructionFlightPlan): void;
  insertReceipt(row: ConstructionFlightReceipt): void;
}
/** Additive bridge only: never rewrites an existing ship, actor, admission,
 * inventory, container or construction document. Storage errors propagate so
 * SpacetimeDB rolls back the entire transaction, including the berth/receipt. */
export function installConstructionFlight(
  db: ConstructionFlightRepository,
  request: ConstructionFlightRequest,
): ConstructionFlightReceipt {
  db.requireLiveGame();
  if (
    !request.operationId ||
    request.operationId.length > 160 ||
    !request.instanceId
  )
    throw Error("Bounded flight operation identity required");
  const instance = db.accessibleInstance(request.instanceId);
  if (!instance || instance.id !== request.instanceId)
    throw Error("Accessible owned construction instance required");
  const key = JSON.stringify([db.principalId, request.operationId]);
  const requestJson = JSON.stringify({
    kind: "construction-flight-install-v1",
    instanceId: request.instanceId,
    expectedInstanceRevision: request.expectedInstanceRevision.toString(),
  });
  const receipt = db.receipt(key);
  if (receipt) {
    if (receipt.requestJson !== requestJson)
      throw Error("Flight operation reused with different payload");
    return receipt;
  }
  if (instance.revision !== request.expectedInstanceRevision)
    throw Error("Construction instance revision conflict");
  if (db.existingBinding(instance.id) || db.shipExists(instance.id))
    throw Error(
      "Construction flight already installed or ship identity occupied",
    );
  const placement = db.reserveServerBerth(instance.id);
  const plan = planQualifiedConstructionFlight(instance, placement, () => {
    const id = db.allocateUuid();
    if (db.identityExists(id))
      throw Error("Flight identity is already allocated");
    return id;
  });
  const result = {
    id: key,
    requestJson,
    instanceId: instance.id,
    shipId: plan.ship.id,
    stationId: plan.station.id,
    revision: 1n,
  };
  db.insertPlan(plan);
  db.insertReceipt(result);
  return result;
}
