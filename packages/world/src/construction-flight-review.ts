import type { Infer } from "spacetimedb/server";
import type { ConstructionPilotContext } from "./construction-pilot-authority";
import type { constructionFlightReview } from "./construction-flight-review-tables";
import {
  planFlightReviewAdmission,
  planFlightReviewRestore,
  type FlightReviewRequest,
} from "../../sim/src/construction-flight-admission";
import { requireGame } from "./auth";
import { requireGrant } from "./construction";
import { clearAim } from "./combat";
import { leaveReview } from "./construction-instances";
import { resolveShipFlightDefinition } from "./construction-flight-resolver";
type ReviewRow = Infer<typeof constructionFlightReview.rowType>;
export type ConstructionFlightReviewContext = Omit<
  ConstructionPilotContext,
  "db"
> & {
  db: ConstructionPilotContext["db"] & {
    constructionFlightReview: {
      characterId: {
        find(id: string): ReviewRow | null | undefined;
        delete(id: string): unknown;
      };
      insert(r: ReviewRow): unknown;
    };
  };
};
function ownedActor(ctx: ConstructionFlightReviewContext) {
  requireGame(ctx);
  const a = [...ctx.db.character.by_owner.filter(ctx.sender)][0];
  if (!a?.connected || !a.owner.isEqual(ctx.sender))
    throw Error("Connected owned character required");
  return a;
}
function standing(
  ctx: ConstructionFlightReviewContext,
  id: string,
  shipId: string,
) {
  return (
    !ctx.db.couchSeat.characterId.find(id) &&
    !ctx.db.constructionStairWalk.characterId.find(id) &&
    !ctx.db.constructionTraversal.characterId.find(id) &&
    !ctx.db.constructionPilotSeat.characterId.find(id) &&
    ctx.db.station.shipId.find(shipId)?.occupantId !== id
  );
}
function ship(ctx: ConstructionFlightReviewContext, id: string) {
  const s = ctx.db.ship.id.find(id),
    motion = ctx.db.shipWorldMotion.shipId.find(id);
  if (!s || !motion) throw Error("Preserved shared ship motion required");
  return {
    id: s.id,
    ownerId: s.owner.toHexString(),
    systemId: motion.systemId,
    stationOccupied: !!ctx.db.station.shipId.find(id)?.occupantId,
  };
}
function operation(
  ctx: ConstructionFlightReviewContext,
  args: FlightReviewRequest,
  kind: string,
) {
  if (
    !args.expectedVisitId ||
    args.expectedVisitId.length > 160 ||
    !/^[a-zA-Z0-9:_-]{1,80}$/.test(args.operationId)
  )
    throw Error("Bounded review operation identity required");
  const id = JSON.stringify([ctx.sender.toHexString(), args.operationId]),
    requestJson = JSON.stringify({
      kind,
      expectedVisitId: args.expectedVisitId,
      expectedVisitRevision: args.expectedVisitRevision.toString(),
      expectedAdmissionRevision: args.expectedAdmissionRevision.toString(),
    });
  const old = ctx.db.constructionFlightReceipt.id.find(id);
  if (
    old &&
    (old.requestJson !== requestJson || !old.owner.isEqual(ctx.sender))
  )
    throw Error("Review operation payload conflict");
  return { id, requestJson, old };
}
function clearInput(ctx: ConstructionFlightReviewContext, id: string) {
  const input = ctx.db.input.characterId.find(id);
  if (
    input &&
    (input.throttle || input.turn || input.dx || input.dy || input.sprint)
  )
    ctx.db.input.characterId.update({
      ...input,
      throttle: 0,
      turn: 0,
      dx: 0,
      dy: 0,
      sprint: false,
    });
  clearAim(ctx, id);
}
/** Explicit admission switch after normal permitted review entry. No actor,
 * station, ship, item or container transform is authored by this command. */
export function beginConstructionFlightReview(
  ctx: ConstructionFlightReviewContext,
  args: FlightReviewRequest,
) {
  const a = ownedActor(ctx),
    visit = ctx.db.constructionLocation.characterId.find(a.id),
    m = ctx.db.worldAdmission.characterId.find(a.id),
    i = visit && ctx.db.constructionInstance.id.find(visit.instanceId),
    b = visit && ctx.db.constructionFlightBinding.shipId.find(visit.instanceId);
  if (
    !visit ||
    !m ||
    !i ||
    !b ||
    !i.owner.isEqual(ctx.sender) ||
    visit.visitId !== args.expectedVisitId
  )
    throw Error("Owned entered flight-review instance required");
  requireGrant(ctx, i.workspaceId, "draft.read");
  requireGrant(ctx, i.workspaceId, "instance.spawn");
  const op = operation(ctx, args, "begin-flight-review");
  if (op.old) return;
  if (ctx.db.constructionFlightReview.characterId.find(a.id))
    throw Error("Flight review is already attached");
  const d = resolveShipFlightDefinition(
    {
      binding: (id) => ctx.db.constructionFlightBinding.shipId.find(id),
      constructionInstanceExists: (id) =>
        !!ctx.db.constructionInstance.id.find(id),
      currentInstanceRevision: (id) =>
        ctx.db.constructionInstance.id.find(id)?.revision,
      fittings: (id) => ctx.db.constructionFlightFitting.by_ship.filter(id),
    },
    i.id,
  );
  const result = planFlightReviewAdmission(
    {
      principalId: ctx.sender.toHexString(),
      actor: {
        ...a,
        ownerId: a.owner.toHexString(),
        standing: standing(ctx, a.id, a.shipId),
      },
      visit,
      admission: { ...m, ownerId: m.owner.toHexString() },
      source: ship(ctx, visit.returnShipId),
      target: ship(ctx, i.id),
      targetDeckId: b.deckId,
      targetActive:
        d.status === "ready" &&
        d.kind === "construction" &&
        !!ctx.db.station.id.find(b.stationId)?.operational,
      hasCurrentGrant: true,
    },
    args,
  );
  ctx.db.constructionFlightReview.insert({
    ...result.state,
    owner: ctx.sender,
  });
  ctx.db.worldAdmission.characterId.update({
    ...m,
    shipId: result.admission.shipId,
    revision: result.admission.revision,
  });
  clearInput(ctx, a.id);
  ctx.db.constructionFlightReceipt.insert({
    id: op.id,
    owner: ctx.sender,
    requestJson: op.requestJson,
    instanceId: i.id,
    shipId: i.id,
    stationId: b.stationId,
    revision: result.admission.revision,
  });
}
/** Restores the recorded membership and accepted review return in ONE reducer
 * transaction. Grant loss may not strand the owner, but seats must recover first. */
export function returnConstructionFlightReview(
  ctx: ConstructionFlightReviewContext,
  args: FlightReviewRequest,
) {
  const a = ownedActor(ctx),
    op = operation(ctx, args, "return-flight-review");
  if (op.old) return;
  const state = ctx.db.constructionFlightReview.characterId.find(a.id),
    visit = ctx.db.constructionLocation.characterId.find(a.id),
    m = ctx.db.worldAdmission.characterId.find(a.id);
  if (!state || !state.owner.isEqual(ctx.sender) || !visit || !m)
    throw Error("Saved owned flight review required");
  const result = planFlightReviewRestore(
    {
      principalId: ctx.sender.toHexString(),
      actor: {
        ...a,
        ownerId: a.owner.toHexString(),
        standing: standing(ctx, a.id, a.shipId),
      },
      visit,
      admission: { ...m, ownerId: m.owner.toHexString() },
      state,
      source: ship(ctx, state.originalShipId),
      targetStationOccupied: !!ctx.db.station.shipId.find(state.instanceId)
        ?.occupantId,
    },
    args,
  );
  const stationId =
    ctx.db.constructionFlightBinding.shipId.find(state.instanceId)?.stationId ??
    "";
  ctx.db.worldAdmission.characterId.update({
    ...m,
    shipId: result.shipId,
    systemId: result.systemId,
    revision: result.revision,
  });
  ctx.db.constructionFlightReview.characterId.delete(a.id);
  clearInput(ctx, a.id);
  leaveReview(ctx, {
    expectedVisitId: args.expectedVisitId,
    expectedRevision: args.expectedVisitRevision,
    operationId: args.operationId,
  });
  ctx.db.constructionFlightReceipt.insert({
    id: op.id,
    owner: ctx.sender,
    requestJson: op.requestJson,
    instanceId: state.instanceId,
    shipId: result.shipId,
    stationId,
    revision: result.revision,
  });
}
