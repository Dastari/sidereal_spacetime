import { t, type InferSchema, type ViewCtx } from "spacetimedb/server";
import type world from "./index";
import { acceptedPassengerAccess } from "./construction-passenger-access";
import { ownedGameShipAccess } from "./game-ship-access-authority";
import { createConstructionStandingSupport } from "./construction-standing-support";
type Context = Pick<ViewCtx<InferSchema<typeof world>>, "db" | "sender">;
function currentActor(ctx: Context) {
  let found;
  for (const a of ctx.db.character.by_owner.filter(ctx.sender)) {
    if (found) return;
    found = a;
  }
  return found?.connected && found.owner.isEqual(ctx.sender)
    ? found
    : undefined;
}
export const passengerGrantProjection = t.row("PassengerAdmission", {
  id: t.string().primaryKey(),
  shipId: t.string(),
  granteeId: t.string(),
  deckId: t.string(),
  instanceRevision: t.u64(),
  expiresMicros: t.u64(),
  revision: t.u64(),
  issuedByYou: t.bool(),
});
/** Owner sees their invitations; recipient sees only invitations naming their
 * current character. No account identity, documents or control grants leak. */
export function ownPassengerGrants(ctx: Context) {
  const a = currentActor(ctx);
  if (!a) return [];
  const out = new Map<
    string,
    {
      id: string;
      shipId: string;
      granteeId: string;
      deckId: string;
      instanceRevision: bigint;
      expiresMicros: bigint;
      revision: bigint;
      issuedByYou: boolean;
    }
  >();
  let count = 0;
  for (const rows of [
    ctx.db.constructionPassengerGrant.by_owner.filter(ctx.sender),
    ctx.db.constructionPassengerGrant.by_grantee.filter(ctx.sender),
  ])
    for (const g of rows) {
      if (++count > 512) return [];
      const own = g.owner.isEqual(ctx.sender),
        recipient = g.granteeOwner.isEqual(ctx.sender) && g.granteeId === a.id;
      if (!own && !recipient) continue;
      out.set(g.id, {
        id: g.id,
        shipId: g.shipId,
        granteeId: g.granteeId,
        deckId: g.deckId,
        instanceRevision: g.instanceRevision,
        expiresMicros: g.expiresMicros,
        revision: g.revision,
        issuedByYou: own,
      });
    }
  return [...out.values()];
}
export const passengerVisitProjection = t.row("PassengerVisitStatus", {
  characterId: t.string().primaryKey(),
  shipId: t.string(),
  deckId: t.string(),
  visitId: t.string(),
  grantId: t.string(),
  revision: t.u64(),
  admitted: t.bool(),
  recoveryReason: t.string(),
});
export function ownPassengerVisit(ctx: Context) {
  const a = currentActor(ctx),
    v = a && ctx.db.constructionPassengerVisit.characterId.find(a.id);
  if (!a || !v?.owner.isEqual(ctx.sender)) return [];
  return [
    {
      characterId: a.id,
      shipId: v.shipId,
      deckId: v.deckId,
      visitId: v.visitId,
      grantId: v.grantId,
      revision: v.revision,
      admitted: acceptedPassengerAccess(ctx, a.id).readInterior,
      recoveryReason: v.recoveryReason,
    },
  ];
}
export const passengerInteriorProjection = t.row("PassengerInteriorShip", {
  shipId: t.string().primaryKey(),
  name: t.string(),
  characterId: t.string(),
  instanceId: t.string(),
  deckId: t.string(),
  instanceRevision: t.u64(),
  flightStatus: t.string(),
  flightReason: t.string(),
});
/** Narrow ship identity for the client while ownShips stays strictly owned. */
export function currentPassengerInterior(ctx: Context) {
  const a = currentActor(ctx);
  if (!a || !acceptedPassengerAccess(ctx, a.id).readInterior) return [];
  const s = ctx.db.ship.id.find(a.shipId)!,
    i = ctx.db.constructionInstance.id.find(a.shipId)!,
    v = ctx.db.constructionPassengerVisit.characterId.find(a.id)!;
  const c = ctx.db.constructionFlightCompiled.shipId.find(i.id),
    pending = !!ctx.db.constructionFlightDirty.shipId.find(i.id);
  return [
    {
      shipId: s.id,
      name: s.name,
      characterId: a.id,
      instanceId: i.id,
      deckId: v.deckId,
      instanceRevision: i.revision,
      flightStatus: pending ? "pending" : (c?.status ?? "pending"),
      flightReason: pending || !c ? "flight-compilation-pending" : c.reason,
    },
  ];
}
export const interiorCrewProjection = t.row("InteriorCrew", {
  characterId: t.string().primaryKey(),
  name: t.string(),
  shipId: t.string(),
  deckId: t.string(),
  localX: t.f64(),
  localY: t.f64(),
  standingElevationM: t.f64(),
  connected: t.bool(),
  sprinting: t.bool(),
});
const support = createConstructionStandingSupport();
/** Current same-deck bodies only; never account identities or inventory. Retained
 * disconnected/recovering bodies remain physically present and visible to crew. */
export function currentInteriorCrew(ctx: Context) {
  const a = currentActor(ctx),
    l = a && ctx.db.constructionLocation.characterId.find(a.id);
  if (
    !a ||
    !l ||
    (!ownedGameShipAccess(ctx, a.shipId, l.deckId).readInterior &&
      !acceptedPassengerAccess(ctx, a.id).readInterior)
  )
    return [];
  const i = ctx.db.constructionInstance.id.find(a.shipId),
    d = ctx.db.constructionDeck.id.find(l.deckId);
  if (!i || !d) return [];
  const out = [];
  let count = 0;
  for (const body of ctx.db.character.by_ship.filter(a.shipId)) {
    if (++count > 256) return [];
    const location = ctx.db.constructionLocation.characterId.find(body.id);
    if (!location || location.instanceId !== i.id || location.deckId !== d.id)
      continue;
    // Stair/traversal projections own moving vertical poses; do not expose stale
    // standing coordinates as an alternate accepted transform.
    if (
      ctx.db.constructionStairWalk.characterId.find(body.id) ||
      ctx.db.constructionTraversal.characterId.find(body.id)
    )
      continue;
    try {
      out.push({
        characterId: body.id,
        name: body.name,
        shipId: body.shipId,
        deckId: d.id,
        localX: body.localX,
        localY: body.localY,
        standingElevationM: support({
          actor: body,
          location,
          instance: i,
          deck: d,
        }),
        connected: body.connected,
        sprinting: body.sprinting,
      });
    } catch {
      return [];
    }
  }
  return out;
}
