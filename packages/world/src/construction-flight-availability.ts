import { Range, type InferSchema, type ReducerCtx } from "spacetimedb/server";
import type world from "./index";
import { requireGame } from "./auth";
import { markShipFlightDirty } from "./construction-flight-dirty";
import { isQualifiedWayfarerBlueprint } from "../../sim/src/wayfarer-walking-bindings";
import { WAYFARER_PHYSICAL_CATALOG } from "../../content/src/physical-definitions";
import type { ActuatorDefinition } from "../../sim/src/flight-definition";
type Context = ReducerCtx<InferSchema<typeof world>>;
const encode = (v: unknown) =>
  JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x));
const identifier = (v: string) =>
  typeof v === "string" && v.length > 0 && v.length <= 160;
/** Dedicated owner-authorized external fitting disposition. It does not grant
 * generic blueprint/refit access, alter collision pins, or accept transforms. */
export function changeFlightFittingDisposition(
  ctx: Context,
  args: {
    shipId: string;
    fittingId: string;
    action: string;
    expectedRevision: bigint;
    expectedFittingRevision: bigint;
    operationId: string;
  },
) {
  requireGame(ctx);
  if (
    !identifier(args.operationId) ||
    !["remove", "detach"].includes(args.action)
  )
    throw Error("Valid fitting disposition intent required");
  const binding = ctx.db.constructionFlightBinding.shipId.find(args.shipId),
    instance = ctx.db.constructionInstance.id.find(args.shipId);
  if (
    !binding ||
    !instance ||
    !binding.owner.isEqual(ctx.sender) ||
    !instance.owner.isEqual(ctx.sender)
  )
    throw Error("Owned flight fitting required");
  if (
    binding.lifecycle !== "active" ||
    binding.instanceRevision !== instance.revision ||
    binding.blueprintSha256 !== instance.blueprintSha256 ||
    !isQualifiedWayfarerBlueprint(instance.blueprintSha256)
  )
    throw Error("Current active qualified flight fitting required");
  const id = JSON.stringify([ctx.sender.toHexString(), args.operationId]);
  const requestJson = encode({ kind: "flight-fitting-disposition", ...args });
  const receipt = ctx.db.constructionFlightReceipt.id.find(id);
  if (receipt) {
    if (receipt.requestJson !== requestJson)
      throw Error("Fitting operation payload conflict");
    return;
  }
  const fitting = ctx.db.constructionFlightFitting.id.find(args.fittingId);
  if (
    binding.revision !== args.expectedRevision ||
    !fitting ||
    fitting.revision !== args.expectedFittingRevision
  )
    throw Error("Fitting revision conflict");
  if (
    fitting.shipId !== args.shipId ||
    fitting.kind !== "actuator" ||
    !fitting.installed
  )
    throw Error("Installed actuator required");
  if (
    instance.documentJson.length > 1_048_576 ||
    instance.idMapJson.length > 1_048_576
  )
    throw Error("Bounded fitting source required");
  const document = JSON.parse(instance.documentJson),
    mappings = JSON.parse(instance.idMapJson);
  const part = document.layout?.assembly?.parts?.find(
    (p: { id: string }) => p.id === fitting.placedObjectId,
  );
  const definition =
    part &&
    (WAYFARER_PHYSICAL_CATALOG.definitions.find(
      (d) =>
        d.id === "physical:" + part.assetId &&
        d.revision === fitting.definitionRevision &&
        d.kind === "actuator",
    ) as ActuatorDefinition | undefined);
  if (
    !definition ||
    definition.fittingDefinitionId !== fitting.definitionId ||
    !mappings.objects?.some(
      (m: { sourceId: string; instanceId: string }) =>
        m.sourceId === fitting.sourceDeviceId &&
        m.instanceId === fitting.placedObjectId,
    )
  )
    throw Error("Qualified placed actuator required");
  // The UUID-bearing row is the removal tombstone. Authored source/pins remain
  // unchanged; compiler/presentation apply this live installation overlay.
  ctx.db.constructionFlightFitting.id.update({
    ...fitting,
    installed: args.action !== "remove",
    powered: false,
    availability: 0,
    revision: fitting.revision + 1n,
  });
  ctx.db.constructionFlightBinding.shipId.update({
    ...binding,
    revision: binding.revision + 1n,
  });
  ctx.db.constructionFlightReceipt.insert({
    id,
    owner: ctx.sender,
    requestJson,
    instanceId: instance.id,
    shipId: args.shipId,
    stationId: binding.stationId,
    revision: binding.revision + 1n,
  });
  markShipFlightDirty(ctx, args.shipId);
}
export interface FlightDamageEvent {
  id: string;
  shipId: string;
  fittingId: string;
  expectedFittingRevision: bigint;
  lossFraction: number;
  sourceEventId: string;
}
// Database row field order is not an event identity. Serialize only the public
// producer contract in a fixed order for queued and consumed replay checks.
function damagePayload(event: FlightDamageEvent) {
  return encode({
    id: event.id,
    shipId: event.shipId,
    fittingId: event.fittingId,
    expectedFittingRevision: event.expectedFittingRevision,
    lossFraction: event.lossFraction,
    sourceEventId: event.sourceEventId,
  });
}
/** Server-only event producer for future hit/lifecycle systems. This is not an
 * exported reducer and cannot be invoked with client-supplied damage values. */
export function queueFlightDamage(ctx: Context, event: FlightDamageEvent) {
  if (!ctx.sender.isEqual(ctx.databaseIdentity))
    throw Error("Server flight damage producer only");
  if (
    !identifier(event.id) ||
    !identifier(event.sourceEventId) ||
    !identifier(event.shipId) ||
    !identifier(event.fittingId) ||
    !Number.isFinite(event.lossFraction) ||
    event.lossFraction <= 0 ||
    event.lossFraction > 1 ||
    event.expectedFittingRevision < 1n
  )
    throw Error("Bounded flight damage event required");
  const receipt = ctx.db.constructionFlightReceipt.id.find(
    JSON.stringify(["server-flight-damage", event.id]),
  );
  if (receipt) {
    if (JSON.parse(receipt.requestJson).event !== damagePayload(event))
      throw Error("Damage event payload conflict");
    return;
  }
  const prior = ctx.db.constructionFlightDamageEvent.id.find(event.id);
  if (prior) {
    if (damagePayload(prior) !== damagePayload(event))
      throw Error("Damage event payload conflict");
    return;
  }
  if (ctx.db.constructionFlightDamageEvent.count() >= 4096n)
    throw Error("Flight damage queue full");
  ctx.db.constructionFlightDamageEvent.insert({
    ...event,
    createdMicros: ctx.timestamp.microsSinceUnixEpoch,
  });
}
/** Consumption rechecks the exact fitting revision. A concurrent removal/refit
 * cannot redirect queued damage to a replacement or apply it twice. */
export function consumeFlightDamage(ctx: Context) {
  if (!ctx.sender.isEqual(ctx.databaseIdentity))
    throw Error("Server flight damage consumption only");
  const pending = [];
  for (const event of ctx.db.constructionFlightDamageEvent.by_created.filter(
    new Range<bigint>(),
  )) {
    pending.push(event);
    if (pending.length === 8) break;
  }
  for (const row of pending) {
    const { createdMicros: _, ...event } = row;
    const fitting = ctx.db.constructionFlightFitting.id.find(event.fittingId),
      binding = ctx.db.constructionFlightBinding.shipId.find(event.shipId);
    let result = "stale-fitting";
    if (
      Number.isFinite(event.lossFraction) &&
      event.lossFraction > 0 &&
      event.lossFraction <= 1 &&
      binding &&
      fitting?.shipId === event.shipId &&
      fitting.kind === "actuator" &&
      fitting.installed &&
      Number.isFinite(fitting.availability) &&
      fitting.availability >= 0 &&
      fitting.availability <= 1 &&
      fitting.revision === event.expectedFittingRevision
    ) {
      ctx.db.constructionFlightFitting.id.update({
        ...fitting,
        availability: fitting.availability * (1 - event.lossFraction),
        revision: fitting.revision + 1n,
      });
      ctx.db.constructionFlightBinding.shipId.update({
        ...binding,
        revision: binding.revision + 1n,
      });
      markShipFlightDirty(ctx, event.shipId);
      result = "applied";
    }
    ctx.db.constructionFlightReceipt.insert({
      id: JSON.stringify(["server-flight-damage", event.id]),
      owner: binding?.owner ?? ctx.databaseIdentity,
      requestJson: encode({ event: damagePayload(event), result }),
      instanceId: binding?.instanceId ?? event.shipId,
      shipId: event.shipId,
      stationId: binding?.stationId ?? "",
      revision: (binding?.revision ?? 0n) + (result === "applied" ? 1n : 0n),
    });
    ctx.db.constructionFlightDamageEvent.id.delete(event.id);
  }
  return pending.length;
}
