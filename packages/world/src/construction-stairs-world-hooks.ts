import { markShipFlightDirty } from "./construction-flight-dirty";
import {
  SenderError,
  type InferSchema,
  type ReducerCtx,
  type ViewCtx,
} from "spacetimedb/server";
import type world from "./index";
import * as auth from "./auth";
import { consumeInputControl } from "./input-control";
import { requireGrant } from "./construction";
import { leaveReview } from "./construction-instances";
import { clearAim } from "./combat";
import {
  ownConstructionStairEgressGeometry,
  ownConstructionStairWalks,
  type StairAuthorityContext,
  type StairAuthorityHooks,
  type StairReadContext,
} from "./construction-stairs-authority";

type CurrentContext = ReducerCtx<InferSchema<typeof world>>;
export type StairWorldContext = CurrentContext & StairAuthorityContext;
type StairWorldReadContext = Pick<
  ViewCtx<InferSchema<typeof world>>,
  "db" | "sender"
> &
  StairReadContext;

/** Concrete adapters to current auth, input lease, seat, ladder and review-exit
 * semantics. They register neither a table nor a reducer in the shared module. */
export function createConstructionStairWorldHooks(
  ctx: StairWorldContext,
): StairAuthorityHooks {
  return {
    physicalChanged: id => markShipFlightDirty(ctx, id),
    mayConsumeMovement(owner, characterId) {
      return (
        auth.canConsume(ctx, owner) && consumeInputControl(ctx, characterId)
      );
    },
    inputConnectionId(characterId) {
      return ctx.db.inputControl.characterId.find(characterId)?.connectionId;
    },
    mayEnter(owner, workspaceId) {
      try {
        requireGrant({ ...ctx, sender: owner }, workspaceId, "draft.read");
        requireGrant({ ...ctx, sender: owner }, workspaceId, "instance.spawn");
        return true;
      } catch {
        return false;
      }
    },
    incompatibleActivity(characterId) {
      const actor = ctx.db.character.id.find(characterId);
      return (
        !actor ||
        !!ctx.db.couchSeat.characterId.find(characterId) ||
        ctx.db.station.shipId.find(actor.shipId)?.occupantId === characterId ||
        !!ctx.db.constructionTraversal.characterId.find(characterId)
      );
    },
    suspendCombat(characterId) {
      clearAim(ctx, characterId);
    },
    clearControls(characterId) {
      const input = ctx.db.input.characterId.find(characterId);
      if (
        input &&
        (input.dx ||
          input.dy ||
          input.throttle ||
          input.turn ||
          input.sprint ||
          input.updatedMicros !== 0n)
      )
        ctx.db.input.characterId.update({
          ...input,
          dx: 0,
          dy: 0,
          throttle: 0,
          turn: 0,
          sprint: false,
          updatedMicros: 0n,
        });
      clearAim(ctx, characterId);
    },
    otherAcceptedPosition(characterId) {
      const traversal =
        ctx.db.constructionTraversal.characterId.find(characterId);
      return traversal
        ? [traversal.acceptedX, traversal.acceptedY, traversal.acceptedZ]
        : undefined;
    },
    mayCompleteSafeEgress(characterId) {
      const actor = ctx.db.character.id.find(characterId),
        visit = ctx.db.constructionLocation.characterId.find(characterId);
      if (
        !actor?.connected ||
        !visit ||
        actor.shipId !== visit.instanceId ||
        !ctx.db.ship.id.find(visit.returnShipId) ||
        ![visit.returnX, visit.returnY].every(Number.isFinite) ||
        !auth.canConsume(ctx, actor.owner)
      )
        return false;
      if (
        ctx.db.character.by_owner.filter(actor.owner)[Symbol.iterator]().next()
          .value?.id !== characterId
      )
        return false;
      let count = 0;
      for (const _ of ctx.db.constructionReceipt.by_principal.filter(
        actor.owner,
      )) {
        if (++count >= 4096) return false;
      }
      return true;
    },
    completeSafeEgress(characterId, walkId) {
      const actor = ctx.db.character.id.find(characterId),
        visit = ctx.db.constructionLocation.characterId.find(characterId),
        audit = ctx.db.constructionStairAudit.id.find(walkId);
      if (
        !actor?.connected ||
        !visit ||
        !audit ||
        audit.characterId !== actor.id ||
        !audit.owner.isEqual(actor.owner) ||
        audit.visitId !== visit.visitId ||
        audit.instanceId !== visit.instanceId ||
        audit.destinationDeckId !== visit.deckId ||
        actor.shipId !== visit.instanceId ||
        audit.outcome !== "egress-exited" ||
        ctx.db.constructionStairWalk.characterId.find(characterId) ||
        !auth.canConsume(ctx, actor.owner) ||
        !consumeInputControl(ctx, characterId)
      )
        throw new SenderError(
          "Committed supported stair egress and active game/input admission required",
        );
      // Current leaveReview selects the first owned character. Reject any mismatch
      // instead of letting that legacy single-character assumption return another.
      const owned = ctx.db.character.by_owner
        .filter(actor.owner)
        [Symbol.iterator]()
        .next().value;
      if (owned?.id !== characterId)
        throw new SenderError("Review exit character selection mismatch");
      leaveReview(
        { ...ctx, sender: actor.owner },
        {
          expectedVisitId: visit.visitId,
          expectedRevision: visit.revision,
          operationId: "stair-egress:" + walkId,
        },
      );
    },
  };
}

/** These wrappers explicitly apply existing game admission. The shared index may
 * register them directly with the keyed projection; no workspace grant is added. */
export function admittedStairWalks(ctx: StairWorldReadContext) {
  return auth.canReadGame(ctx) ? ownConstructionStairWalks(ctx) : [];
}
export function admittedStairEgressGeometry(ctx: StairWorldReadContext) {
  return auth.canReadGame(ctx) ? ownConstructionStairEgressGeometry(ctx) : [];
}
