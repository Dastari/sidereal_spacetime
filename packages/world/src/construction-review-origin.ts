import { commitFlightCharacter } from "./construction-flight-dirty";
import {
  table,
  t,
  SenderError,
  type InferSchema,
  type ReducerCtx,
} from "spacetimedb/server";
import type world from "./index";
import { gameShipAccess } from "@sidereal/sim/game-ship-access";
import { canOccupyDeck } from "@sidereal/sim/construction-collision";
import { ownedGameShipAccess } from "./game-ship-access-authority";
import { constructionCollision } from "./construction-doors";
import { createConstructionStandingSupport } from "./construction-standing-support";

/** A review transit receipt, not a physical boarding or game access grant. */
export const constructionReviewOrigin = table(
  { name: "construction_review_origin" },
  {
    characterId: t.string().primaryKey(),
    owner: t.identity(),
    reviewInstanceId: t.string(),
    visitId: t.string(),
    instanceId: t.string(),
    deckId: t.string(),
    returnShipId: t.string(),
    returnX: t.f64(),
    returnY: t.f64(),
    locationRevision: t.u64(),
    x: t.f64(),
    y: t.f64(),
    sourceRevision: t.u64(),
    sourceSha256: t.string(),
  },
);
type Context = ReducerCtx<InferSchema<typeof world>>;
const standing = createConstructionStandingSupport();
export function saveNativeReviewOrigin(
  ctx: Context,
  characterId: string,
  reviewInstanceId: string,
) {
  const actor = ctx.db.character.id.find(characterId),
    location = ctx.db.constructionLocation.characterId.find(characterId);
  if (!location) return false;
  const instance = ctx.db.constructionInstance.id.find(location.instanceId);
  if (
    !actor ||
    !instance ||
    !ownedGameShipAccess(
      ctx,
      instance.id,
      location.deckId,
      ctx.timestamp.microsSinceUnixEpoch,
    ).walkDeck ||
    ctx.db.constructionReviewOrigin.characterId.find(characterId) ||
    location.returnShipId
  )
    throw new SenderError("Recursive or invalid native review origin");
  if (
    ctx.db.constructionPilotSeat.characterId.find(characterId) ||
    ctx.db.constructionFlightReview.characterId.find(characterId) ||
    ctx.db.constructionTraversal.characterId.find(characterId) ||
    ctx.db.constructionStairWalk.characterId.find(characterId)
  )
    throw new SenderError(
      "Stand on the owned deck and end flight/traversal before review transit",
    );
  const frame = constructionCollision(ctx, instance, location.deckId);
  if (
    !canOccupyDeck(
      frame,
      {
        shipId: instance.id,
        deckId: location.deckId,
        position: [actor.localX, actor.localY],
      },
      0.3,
    )
  )
    throw new SenderError("Supported native review origin required");
  ctx.db.constructionReviewOrigin.insert({
    characterId,
    owner: ctx.sender,
    reviewInstanceId,
    visitId: location.visitId,
    instanceId: location.instanceId,
    deckId: location.deckId,
    returnShipId: location.returnShipId,
    returnX: location.returnX,
    returnY: location.returnY,
    locationRevision: location.revision,
    x: actor.localX,
    y: actor.localY,
    sourceRevision: instance.revision,
    sourceSha256: instance.blueprintSha256,
  });
  return true;
}
/** Validate the *current* original ship relations before restoring only actor and
 * visit. Ship motion, grants, inventories and source revisions are never rolled back. */
export function restoreNativeReviewOrigin(ctx: Context, characterId: string) {
  const saved = ctx.db.constructionReviewOrigin.characterId.find(characterId);
  if (!saved) return false;
  const actor = ctx.db.character.id.find(characterId),
    visit = ctx.db.constructionLocation.characterId.find(characterId),
    instance = ctx.db.constructionInstance.id.find(saved.instanceId),
    deck = ctx.db.constructionDeck.id.find(saved.deckId),
    binding = ctx.db.gameShipAccess.shipId.find(saved.instanceId),
    ship = ctx.db.ship.id.find(saved.instanceId),
    motion = ctx.db.shipWorldMotion.shipId.find(saved.instanceId),
    admission = ctx.db.worldAdmission.characterId.find(characterId);
  if (
    !actor ||
    !actor.connected ||
    !saved.owner.isEqual(ctx.sender) ||
    !actor.owner.isEqual(ctx.sender) ||
    actor.shipId !== saved.reviewInstanceId ||
    visit?.instanceId !== saved.reviewInstanceId ||
    !instance ||
    !deck ||
    !binding ||
    !ship ||
    !motion ||
    !admission ||
    !admission.owner.isEqual(ctx.sender) ||
    instance.revision !== saved.sourceRevision ||
    instance.blueprintSha256 !== saved.sourceSha256 ||
    !["active", "suspended"].includes(binding.lifecycle)
  )
    throw new SenderError(
      "Native review return relation changed; remain safely in review",
    );
  const location = {
    characterId,
    visitId: saved.visitId,
    instanceId: saved.instanceId,
    deckId: saved.deckId,
    returnShipId: saved.returnShipId,
    returnX: saved.returnX,
    returnY: saved.returnY,
    revision: saved.locationRevision,
  };
  const candidate = {
    ...actor,
    shipId: saved.instanceId,
    localX: saved.x,
    localY: saved.y,
    sprinting: false,
  };
  const access = gameShipAccess({
    principalId: ctx.sender.toHexString(),
    liveGame: true,
    actor: {
      id: actor.id,
      ownerId: actor.owner.toHexString(),
      shipId: candidate.shipId,
    },
    binding: {
      ...binding,
      ownerId: binding.owner.toHexString(),
      lifecycle: binding.lifecycle as "active" | "suspended",
    },
    instance: { ...instance, ownerId: instance.owner.toHexString() },
    ship: { ...ship, ownerId: ship.owner.toHexString() },
    motion,
    deck,
    location,
    admission,
  });
  if (!access.walkDeck)
    throw new SenderError("Original game access no longer permits return");
  const frame = constructionCollision(ctx, instance, saved.deckId);
  if (
    !canOccupyDeck(
      frame,
      { shipId: instance.id, deckId: deck.id, position: [saved.x, saved.y] },
      0.3,
    )
  )
    throw new SenderError("Original return support is obstructed");
  standing({ actor: candidate, location, instance, deck });
  for (const other of ctx.db.constructionLocation.by_instance.filter(
    instance.id,
  )) {
    if (other.characterId === characterId || other.deckId !== deck.id) continue;
    const body = ctx.db.character.id.find(other.characterId);
    if (
      body &&
      body.shipId === instance.id &&
      Math.hypot(body.localX - saved.x, body.localY - saved.y) < 0.6
    )
      throw new SenderError("Original return position occupied");
  }
  commitFlightCharacter(ctx, candidate, (row) =>
    ctx.db.character.id.update(row),
  );
  ctx.db.constructionLocation.characterId.update(location);
  ctx.db.constructionReviewOrigin.characterId.delete(characterId);
  return true;
}
