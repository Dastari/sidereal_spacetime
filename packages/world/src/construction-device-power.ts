import type { ConstructionPilotContext } from "./construction-pilot-authority";
import { requireGame } from "./auth";
import { isQualifiedWayfarerBlueprint } from "@sidereal/sim/wayfarer-walking-bindings";
import {
  WAYFARER_REACTOR_ASSET_ID,
  WAYFARER_REACTOR_SOURCE_ID,
} from "@sidereal/content/device-services";
import { WAYFARER_PHYSICAL_CATALOG } from "../../content/src/physical-definitions";
import type { ActuatorDefinition } from "../../sim/src/flight-definition";
import { markShipFlightDirty } from "./construction-flight-dirty";
import type { ConstructionDocument } from "@sidereal/content/construction";
import type { ConstructionInstanceMappings } from "@sidereal/sim/construction-instance";

export interface ConstructionEnginePowerArgs {
  shipId: string;
  enginePlacedObjectId: string;
  connected: boolean;
  expectedRevision: bigint;
  operationId: string;
}
/** Owner edits the qualified reactor-to-engine circuit, not a generic powered
 * override. Existing fittings are initially connected. No fuel or J are minted:
 * this first installation has unrated on/off power, matching its prior IFCS gate. */
export function setConstructionEnginePower(
  ctx: ConstructionPilotContext,
  args: ConstructionEnginePowerArgs,
) {
  requireGame(ctx);
  if (
    !args.operationId ||
    args.operationId.length > 160 ||
    typeof args.connected !== "boolean"
  )
    throw Error("Valid power operation required");
  const binding = ctx.db.constructionFlightBinding.shipId.find(args.shipId);
  const instance = ctx.db.constructionInstance.id.find(args.shipId);
  if (
    !binding ||
    !instance ||
    !binding.owner.isEqual(ctx.sender) ||
    !instance.owner.isEqual(ctx.sender)
  )
    throw Error("Owned power installation required");
  if (
    !isQualifiedWayfarerBlueprint(instance.blueprintSha256) ||
    binding.blueprintSha256 !== instance.blueprintSha256 ||
    binding.instanceRevision !== instance.revision ||
    binding.lifecycle !== "active"
  )
    throw Error("Current active qualified power installation required");
  const id = JSON.stringify([ctx.sender.toHexString(), args.operationId]);
  const requestJson = JSON.stringify({
    kind: "engine-power",
    shipId: args.shipId,
    enginePlacedObjectId: args.enginePlacedObjectId,
    connected: args.connected,
    expectedRevision: args.expectedRevision.toString(),
  });
  const receipt = ctx.db.constructionFlightReceipt.id.find(id);
  if (receipt) {
    if (receipt.requestJson !== requestJson)
      throw Error("Power operation payload conflict");
    return;
  }
  if (binding.revision !== args.expectedRevision)
    throw Error("Power revision conflict");
  if (
    instance.documentJson.length > 1_048_576 ||
    instance.idMapJson.length > 1_048_576
  )
    throw Error("Bounded power installation required");
  const document = JSON.parse(instance.documentJson) as ConstructionDocument;
  const mappings = JSON.parse(
    instance.idMapJson,
  ) as ConstructionInstanceMappings;
  const reactor = mappings.objects.find(
    (m) => m.sourceId === WAYFARER_REACTOR_SOURCE_ID,
  );
  if (
    !reactor ||
    !document.layout.assembly?.parts.some(
      (p) =>
        p.id === reactor.instanceId && p.assetId === WAYFARER_REACTOR_ASSET_ID,
    )
  )
    throw Error("Installed qualified reactor required");
  const fittings = [];
  for (const row of ctx.db.constructionFlightFitting.by_ship.filter(args.shipId)) {
    if (fittings.length === 256) throw Error("Bounded qualified power installation required");
    fittings.push(row);
  }
  if (new Set(fittings.map(f=>f.id)).size!==fittings.length || new Set(fittings.map(f=>f.placedObjectId)).size!==fittings.length || new Set(fittings.map(f=>f.sourceDeviceId)).size!==fittings.length || fittings.some(f=>f.shipId!==args.shipId))
    throw Error("Unique qualified power fitting set required");
  for (const fitting of fittings) {
    if (!fitting.installed) continue;
    const part = document.layout.assembly?.parts.find(p=>p.id===fitting.placedObjectId);
    const physical = part && WAYFARER_PHYSICAL_CATALOG.definitions.find(d=>d.id==="physical:"+part.assetId && d.revision===fitting.definitionRevision);
    if (!physical || physical.kind!==fitting.kind || !("fittingDefinitionId" in physical) || physical.fittingDefinitionId!==fitting.definitionId || !mappings.objects.some(m=>m.instanceId===fitting.placedObjectId))
      throw Error("Definition-bound power fitting set required");
  }
  const engine = fittings.find(f=>f.placedObjectId===args.enginePlacedObjectId && f.kind==="actuator");
  const placed = document.layout.assembly?.parts.find(p=>p.id===args.enginePlacedObjectId);
  const source = placed && WAYFARER_PHYSICAL_CATALOG.definitions.find(d=>d.id==="physical:"+placed.assetId && d.revision===engine?.definitionRevision && d.kind==="actuator") as ActuatorDefinition | undefined;
  if (!engine || !source || source.fittingDefinitionId!==engine.definitionId || !engine.installed || !mappings.objects.some(m=>m.sourceId===engine.sourceDeviceId && m.instanceId===engine.placedObjectId))
    throw Error("Installed qualified engine required");
  // Permission, stale revision, exact mappings and complete source checks precede writes.
  ctx.db.constructionFlightFitting.id.update({
    ...engine,
    powered: args.connected,
    revision: engine.revision + 1n,
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
