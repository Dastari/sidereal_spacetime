import { markShipFlightDirty } from "./construction-flight-dirty";
import {
  planQualifiedConstructionFlight,
  type ConstructionFlightPlan,
} from "@sidereal/sim/construction-flight";
import type { ConstructionFlightContext } from "./construction-flight-authority";
import {
  PREFAB_FLIGHT_DEFINITION,
  planPrefabConstructionFlight,
} from "@sidereal/sim/prefab-flight";

export type PrefabConstructionFlightPlan = ReturnType<
  typeof planPrefabConstructionFlight
>;
const serialize = (value: unknown) =>
  JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v));

/** Trusted transaction writer, not a reducer or an authorization bypass. Caller
 * must establish review-install permission OR the one-time starter entitlement,
 * and reserve the supplied berth in this same transaction. Does not activate,
 * seat, grant access, mutate actors/admission/inventory, or write receipts. */
export function insertQualifiedFlightPlan(
  ctx: ConstructionFlightContext,
  plan: ConstructionFlightPlan | PrefabConstructionFlightPlan,
) {
  const instance = ctx.db.constructionInstance.id.find(plan.instanceId);
  if (!instance?.owner.isEqual(ctx.sender))
    throw Error("Owned qualified flight instance required");
  if (
    ctx.db.ship.id.find(plan.instanceId) ||
    ctx.db.shipWorldMotion.shipId.find(plan.instanceId) ||
    ctx.db.constructionFlightBinding.shipId.find(plan.instanceId)
  )
    throw Error("Flight already installed");
  const ids = [
    plan.station.id,
    plan.computer.id,
    ...plan.actuators.map((a) => a.id),
  ];
  let cursor = 0;
  // The planner is chosen by the plan's own definition pin; the prefab planner refuses
  // non-prefab documents, so a forged plan cannot switch reconstruction paths.
  const planner =
    plan.definitionId === PREFAB_FLIGHT_DEFINITION
      ? planPrefabConstructionFlight
      : planQualifiedConstructionFlight;
  const rebuilt = planner(instance, plan.motion, () => {
    const id = ids[cursor++];
    if (
      !id ||
      ctx.db.station.id.find(id) ||
      ctx.db.ship.id.find(id) ||
      ctx.db.constructionInstance.id.find(id) ||
      ctx.db.constructionFlightFitting.id.find(id) ||
      ctx.db.inventoryItem.id.find(id) ||
      ctx.db.inventoryContainer.id.find(id) ||
      ctx.db.interactionObject.id.find(id)
    )
      throw Error("Flight identity already allocated");
    return id;
  });
  if (cursor !== ids.length || serialize(rebuilt) !== serialize(plan))
    throw Error("Flight plan differs from exact qualified reconstruction");
  // No write above this point. All errors below propagate to DB transaction rollback.
  ctx.db.ship.insert({ ...plan.ship, owner: ctx.sender });
  ctx.db.shipWorldMotion.insert(plan.motion);
  const s = plan.station;
  ctx.db.station.insert({
    id: s.id,
    shipId: s.shipId,
    localX: s.localX,
    localY: s.localY,
    occupantId: undefined,
    operational: false,
  });
  ctx.db.constructionFlightStation.insert({
    stationId: s.id,
    shipId: s.shipId,
    deckId: s.deckId,
    seatPlacedObjectId: s.placedObjectId,
    consolePlacedObjectId: s.consolePlacedObjectId,
    revision: 1n,
  });
  const c = plan.computer;
  ctx.db.constructionFlightFitting.insert({
    id: c.id,
    shipId: c.shipId,
    placedObjectId: c.placedObjectId,
    sourceDeviceId: c.sourceDeviceId,
    definitionId: c.definitionId,
    definitionRevision: c.definitionRevision,
    kind: "computer",
    installed: c.installed,
    powered: c.powered,
    availability: 1,
    revision: 1n,
  });
  for (const a of plan.actuators)
    ctx.db.constructionFlightFitting.insert({
      id: a.id,
      shipId: a.shipId,
      placedObjectId: a.placedObjectId,
      sourceDeviceId: a.sourceDeviceId,
      definitionId: a.definitionId,
      definitionRevision: a.definitionRevision,
      kind: "actuator",
      installed: true,
      powered: true,
      availability: a.availability,
      revision: 1n,
    });
  ctx.db.constructionFlightBinding.insert({
    shipId: plan.ship.id,
    instanceId: plan.instanceId,
    owner: ctx.sender,
    deckId: s.deckId,
    stationId: s.id,
    instanceRevision: plan.instanceRevision,
    blueprintSha256: plan.blueprintSha256,
    definitionId: plan.definitionId,
    definitionSha256: plan.definitionSha256,
    lifecycle: plan.activation,
    revision: 1n,
  });
  markShipFlightDirty(ctx, plan.ship.id);
}
