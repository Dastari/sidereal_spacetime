import {
  constructionInteractionView,
  interactWithConstructionObject,
  releaseConstructionSeat,
} from "./construction-interactions";
import { clearAim } from "./combat";
import {
  SenderError,
  t,
  type ReducerCtx,
  type ViewCtx,
  type InferSchema,
} from "spacetimedb/server";
import type world from "./index";
import { LAB_INTERACTIONS } from "../../content/src/interactions";
import { validateInteraction } from "../../sim/src/interactions";
import { interactionLineOfSight } from "../../sim/src/interactions";
import { CABIN_PARTITIONS } from "../../content/src/interior";
const cabinLineOfSight = (ax: number, ay: number, bx: number, by: number) =>
  interactionLineOfSight(ax, ay, bx, by, CABIN_PARTITIONS);
type Context = ReducerCtx<InferSchema<typeof world>>;
type ReadContext = Pick<ViewCtx<InferSchema<typeof world>>, "db" | "sender">;
export function seedInteractions(ctx: Context, shipId: string) {
  const existing = new Set(
    [...ctx.db.interactionObject.by_ship.filter(shipId)].map(
      (row) => row.placementId,
    ),
  );
  for (const definition of LAB_INTERACTIONS)
    if (!existing.has(definition.placementId))
      ctx.db.interactionObject.insert({
        id: ctx.newUuidV4().toString(),
        shipId,
        placementId: definition.placementId,
        revision: 1n,
        enabled: true,
      });
}
export function clearInteractionInput(ctx: Context, characterId: string) {
  const input = ctx.db.input.characterId.find(characterId);
  if (input)
    ctx.db.input.characterId.update({
      ...input,
      dx: 0,
      dy: 0,
      throttle: 0,
      turn: 0,
      sprint: false,
    });
}
export function leaveCouch(
  ctx: Context,
  characterId: string,
  reason: "stand" | "disconnect" | "auth-loss" = "stand",
) {
  if (releaseConstructionSeat(ctx, characterId, reason).handled) return;
  const seat = ctx.db.couchSeat.characterId.find(characterId);
  if (!seat) return;
  const object = ctx.db.interactionObject.id.find(seat.objectId);
  const definition = LAB_INTERACTIONS.find(
    (d) => d.placementId === object?.placementId,
  );
  const actor = ctx.db.character.id.find(characterId);
  ctx.db.couchSeat.characterId.delete(characterId);
  if (object)
    ctx.db.interactionObject.id.update({
      ...object,
      revision: object.revision + 1n,
    });
  if (actor && definition)
    ctx.db.character.id.update({
      ...actor,
      localX: definition.approachX,
      localY: definition.approachY,
      sprinting: false,
    });
  clearInteractionInput(ctx, characterId);
}
export const interactionProjection = t.row("VisibleInteraction", {
  id: t.string().primaryKey(),
  placementId: t.string(),
  assetId: t.string(),
  name: t.string(),
  kind: t.string(),
  localX: t.f64(),
  localY: t.f64(),
  revision: t.u64(),
  enabled: t.bool(),
  occupied: t.bool(),
  seatedByYou: t.bool(),
  reachable: t.bool(),
});
export function interactionView(ctx: ReadContext) {
  const actor = [...ctx.db.character.by_owner.filter(ctx.sender)][0];
  if (!actor?.connected) return [];
  if (ctx.db.constructionLocation.characterId.find(actor.id))
    return constructionInteractionView(ctx);
  return [...ctx.db.interactionObject.by_ship.filter(actor.shipId)].flatMap(
    (object) => {
      const d = LAB_INTERACTIONS.find(
        (d) => d.placementId === object.placementId,
      );
      if (!d) return [];
      const seat = ctx.db.couchSeat.objectId.find(object.id);
      return [
        {
          id: object.id,
          placementId: d.placementId,
          assetId: d.assetId,
          name: d.name,
          kind: d.kind,
          localX: d.x,
          localY: d.y,
          revision: object.revision,
          enabled: object.enabled,
          occupied: !!seat,
          seatedByYou: seat?.characterId === actor.id,
          reachable:
            Math.hypot(actor.localX - d.x, actor.localY - d.y) <= 1.8 &&
            cabinLineOfSight(
              actor.localX,
              actor.localY,
              d.approachX,
              d.approachY,
            ),
        },
      ];
    },
  );
}
export function interact(
  ctx: Context,
  args: {
    objectId: string;
    action: string;
    expectedRevision: bigint;
    operationId: string;
  },
) {
  if (interactWithConstructionObject(ctx, args)) return;
  const actor = [...ctx.db.character.by_owner.filter(ctx.sender)][0];
  if (!actor?.connected) throw new SenderError("Character unavailable");
  const object = ctx.db.interactionObject.id.find(args.objectId);
  const d = LAB_INTERACTIONS.find((d) => d.placementId === object?.placementId);
  if (!object || object.shipId !== actor.shipId || !d)
    throw new SenderError("Object unavailable");
  if (!/^[A-Za-z0-9_-]{1,96}$/.test(args.operationId))
    throw new SenderError("Invalid operation ID");
  const distance = Math.hypot(actor.localX - d.x, actor.localY - d.y);
  if (
    distance > 1.8 ||
    !cabinLineOfSight(actor.localX, actor.localY, d.approachX, d.approachY)
  )
    throw new SenderError("Move closer to the object");
  const request = JSON.stringify({
    ...args,
    expectedRevision: args.expectedRevision.toString(),
  });
  const receipts = [...ctx.db.interactionReceipt.by_character.filter(actor.id)];
  const previous = receipts.find((r) => r.operationId === args.operationId);
  if (previous) {
    if (previous.request !== request)
      throw new SenderError("Operation ID already used");
    return;
  }
  if (object.revision !== args.expectedRevision)
    throw new SenderError("Object changed; try again");
  const occupied = ctx.db.couchSeat.objectId.find(object.id);
  try {
    validateInteraction(
      d.kind,
      args.action,
      distance,
      !!occupied,
      occupied?.characterId === actor.id,
    );
  } catch (error) {
    throw new SenderError(
      error instanceof Error ? error.message : "Invalid interaction",
    );
  }
  if (args.action === "sit") {
    clearAim(ctx, actor.id);
    leaveCouch(ctx, actor.id);
    const helm = ctx.db.station.shipId.find(actor.shipId);
    if (helm?.occupantId === actor.id)
      ctx.db.station.id.update({ ...helm, occupantId: undefined });
    ctx.db.couchSeat.insert({ characterId: actor.id, objectId: object.id });
    ctx.db.character.id.update({
      ...actor,
      localX: d.seatX,
      localY: d.seatY,
      sprinting: false,
    });
    clearInteractionInput(ctx, actor.id);
  } else if (args.action === "stand") {
    ctx.db.couchSeat.characterId.delete(actor.id);
    ctx.db.character.id.update({
      ...actor,
      localX: d.approachX,
      localY: d.approachY,
      sprinting: false,
    });
    clearInteractionInput(ctx, actor.id);
  }
  ctx.db.interactionObject.id.update({
    ...object,
    revision: object.revision + 1n,
    enabled:
      args.action === "set-light-on"
        ? true
        : args.action === "set-light-off"
          ? false
          : object.enabled,
  });
  ctx.db.interactionReceipt.insert({
    id: ctx.newUuidV4().toString(),
    characterId: actor.id,
    operationId: args.operationId,
    request,
    createdMicros: ctx.timestamp.microsSinceUnixEpoch,
  });
  if (receipts.length >= 128)
    for (const receipt of receipts
      .sort((a, b) => (a.createdMicros < b.createdMicros ? -1 : 1))
      .slice(0, receipts.length - 127))
      ctx.db.interactionReceipt.id.delete(receipt.id);
}
