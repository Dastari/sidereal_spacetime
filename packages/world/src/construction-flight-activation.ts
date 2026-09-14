import { compileShipFlight } from "./construction-flight-compilation";
import { readConstructionFlightInput } from "./construction-flight-input";
import type { ConstructionPilotContext } from "./construction-pilot-authority";
import { requireGame } from "./auth";
import { requireGrant } from "./construction";
import { qualifyPilotGeometry } from "@sidereal/sim/construction-pilot";
import { wayfarerThresholdElevation } from "@sidereal/sim/wayfarer-threshold";
import { constructionCollision } from "./construction-doors";
import { resolveShipFlightDefinition } from "./construction-flight-resolver";
export interface ActivateConstructionFlightArgs {
  shipId: string;
  expectedRevision: bigint;
  operationId: string;
}
/** Explicit owner action makes a qualified installation operational. It grants
 * no occupant, moves no actor and changes no worldAdmission or other ship. */
export function activateConstructionFlight(
  ctx: ConstructionPilotContext,
  args: ActivateConstructionFlightArgs,
) {
  requireGame(ctx);
  if (!args.operationId || args.operationId.length > 160)
    throw Error("Flight operation identity required");
  const b = ctx.db.constructionFlightBinding.shipId.find(args.shipId),
    i = ctx.db.constructionInstance.id.find(args.shipId);
  if (!b || !i || !i.owner.isEqual(ctx.sender) || !b.owner.isEqual(ctx.sender))
    throw Error("Owned flight installation required");
  requireGrant(ctx, i.workspaceId, "draft.read");
  requireGrant(ctx, i.workspaceId, "instance.spawn");
  if (i.revision !== b.instanceRevision)
    throw Error("Current qualified instance revision required");
  const id = JSON.stringify([ctx.sender.toHexString(), args.operationId]),
    requestJson = JSON.stringify({
      kind: "flight-activate",
      shipId: args.shipId,
      expectedRevision: args.expectedRevision.toString(),
    });
  const receipt = ctx.db.constructionFlightReceipt.id.find(id);
  if (receipt) {
    if (receipt.requestJson !== requestJson)
      throw Error("Flight operation payload conflict");
    return;
  }
  if (b.revision !== args.expectedRevision)
    throw Error("Flight revision conflict");
  if (b.lifecycle !== "installed-dormant")
    throw Error("Explicit dormant installation required");
  const s = ctx.db.station.id.find(b.stationId),
    m = ctx.db.constructionFlightStation.stationId.find(b.stationId),
    deck = ctx.db.constructionDeck.id.find(b.deckId),
    motion = ctx.db.shipWorldMotion.shipId.find(b.shipId);
  if (
    !s ||
    s.occupantId ||
    !m ||
    m.shipId !== b.shipId ||
    m.deckId !== b.deckId ||
    !deck ||
    deck.instanceId !== i.id ||
    deck.elevation !== 0 ||
    !motion ||
    !ctx.db.worldSystem.id.find(motion.systemId)
  )
    throw Error(
      "Complete empty pilot installation and canonical motion required",
    );
  compileShipFlight(ctx.db, b.shipId, (id) =>
    readConstructionFlightInput(ctx, id),
  );
  const definition = resolveShipFlightDefinition(
    {
      binding: () => b,
      constructionInstanceExists: () => true,
      currentInstanceRevision: () => i.revision,
      fittings: (shipId) =>
        ctx.db.constructionFlightFitting.by_ship.filter(shipId),
      compiled: (id) => ctx.db.constructionFlightCompiled.shipId.find(id),
      dirty: (id) => !!ctx.db.constructionFlightDirty.shipId.find(id),
    },
    b.shipId,
  );
  if (definition.status !== "dormant")
    throw Error("Qualified dormant flight definition required");
  qualifyPilotGeometry({
    instance: i,
    frame: constructionCollision(ctx, i, b.deckId),
    seatPlacedObjectId: m.seatPlacedObjectId,
    supportHeightAt: wayfarerThresholdElevation,
  });
  ctx.db.station.id.update({ ...s, operational: true });
  ctx.db.constructionFlightBinding.shipId.update({
    ...b,
    lifecycle: "active",
    revision: b.revision + 1n,
  });
  ctx.db.constructionFlightReceipt.insert({
    id,
    owner: ctx.sender,
    requestJson,
    instanceId: i.id,
    shipId: i.id,
    stationId: s.id,
    revision: b.revision + 1n,
  });
}
