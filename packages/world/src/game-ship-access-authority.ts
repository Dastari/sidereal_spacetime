import { t } from "spacetimedb/server";
import type { Identity } from "spacetimedb";
import {
  gameShipAccess,
  type GameShipBinding,
} from "@sidereal/sim/game-ship-access";
export const GAME_OWNED_TEMPLATE_NAMESPACE = "trusted-starter-templates";
type Find<T, K = string> = { find(id: K): T | null | undefined };
type Owned = { owner: Identity };
type Actor = Owned & { id: string; shipId: string };
/** Minimal read contract shared by views and command/tick access adapters. */
export interface GameShipAccessDatabase {
  character: { by_owner: { filter(owner: Identity): Iterable<Actor> } };
  gameShipAccess: {
    shipId: Find<
      Omit<GameShipBinding, "ownerId" | "lifecycle"> &
        Owned & { lifecycle: string }
    >;
  };
  constructionInstance: {
    id: Find<
      Owned & {
        id: string;
        workspaceId: string;
        revision: bigint;
        blueprintSha256: string;
      }
    >;
  };
  constructionDeck: { id: Find<{ id: string; instanceId: string }> };
  ship: { id: Find<Owned & { id: string; name: string }> };
  shipWorldMotion: { shipId: Find<{ shipId: string; systemId: string }> };
  constructionLocation: {
    characterId: Find<{
      characterId: string;
      instanceId: string;
      deckId: string;
    }>;
  };
  worldAdmission: {
    characterId: Find<
      Owned & { characterId: string; shipId: string; systemId: string }
    >;
  };
  retiredIdentity: { source: Find<unknown, Identity> };
  /** EVA bodies (optional for fixtures): see `evaHomeLocation`. */
  evaBody?: {
    characterId: Find<{
      characterId: string;
      exitShipId: string;
      visitId: string;
      deckId: string;
      systemId: string;
      x: number;
      y: number;
    }>;
  };
  authSession: {
    by_owner: {
      filter(
        owner: Identity,
      ): Iterable<{ game: boolean; expiresMicros: bigint }>;
    };
  };
}
export interface GameShipAccessContext {
  db: GameShipAccessDatabase;
  sender: Identity;
}
/** All facts come from private rows. Tick/reducer callers pass the real current
 * time and use the actor's verified owner; views use materialized auth expiry. */
/**
 * EVA milestone 1: a character outside the hull keeps read-only views of the own ship it left
 * (instance document, decks, flight state), so the client can keep drawing it. The aboard
 * location is reconstructed from the EVA body; it never grants walking or object use.
 */
export function evaHomeLocation(
  db: Pick<GameShipAccessDatabase, "evaBody">,
  actor: { id: string; shipId: string },
) {
  const body = db.evaBody?.characterId.find(actor.id);
  if (!body?.visitId || !body.deckId || !actor.shipId) return undefined;
  if (body.exitShipId !== actor.shipId) return undefined;
  return {
    characterId: actor.id,
    visitId: body.visitId,
    instanceId: actor.shipId,
    deckId: body.deckId,
    returnShipId: "",
    returnX: 0,
    returnY: 0,
    revision: 0n,
  };
}
export function ownedGameShipAccess(
  ctx: GameShipAccessContext,
  targetInstanceId: string,
  targetDeckId: string,
  nowMicros?: bigint,
) {
  const principalId = ctx.sender.toHexString();
  const denied = () => gameShipAccess({ principalId, liveGame: false });
  const instance = ctx.db.constructionInstance.id.find(targetInstanceId);
  if (instance?.workspaceId !== GAME_OWNED_TEMPLATE_NAMESPACE) return denied();
  if (
    ctx.db.retiredIdentity.source.find(ctx.sender) ||
    ![...ctx.db.authSession.by_owner.filter(ctx.sender)].some(
      (s) => s.game && (nowMicros === undefined || s.expiresMicros > nowMicros),
    )
  )
    return denied();
  const actors = [...ctx.db.character.by_owner.filter(ctx.sender)];
  const actor = actors[0];
  if (!actor || actors.length !== 1) return denied();
  const binding = ctx.db.gameShipAccess.shipId.find(targetInstanceId),
    deck = ctx.db.constructionDeck.id.find(targetDeckId),
    ship = ctx.db.ship.id.find(targetInstanceId),
    motion = ctx.db.shipWorldMotion.shipId.find(targetInstanceId),
    aboard = ctx.db.constructionLocation.characterId.find(actor.id),
    outside = aboard ? undefined : evaHomeLocation(ctx.db, actor),
    location = aboard ?? outside,
    admission = ctx.db.worldAdmission.characterId.find(actor.id);
  if (
    !binding ||
    !deck ||
    !ship ||
    !motion ||
    !location ||
    !admission ||
    !admission.owner.isEqual(ctx.sender) ||
    !["active", "suspended"].includes(binding.lifecycle)
  )
    return denied();
  const access = gameShipAccess({
    principalId,
    liveGame: true,
    actor: {
      id: actor.id,
      ownerId: actor.owner.toHexString(),
      shipId: actor.shipId,
    },
    binding: {
      ...binding,
      ownerId: binding.owner.toHexString(),
      lifecycle: binding.lifecycle as "active" | "suspended",
    },
    instance: { ...instance, ownerId: instance.owner.toHexString() },
    ship: { id: ship.id, ownerId: ship.owner.toHexString() },
    motion,
    deck,
    location,
    admission,
  });
  // Outside the hull: read the own ship's views only; never walk its deck or use its objects.
  return outside ? { ...access, walkDeck: false, useObjects: false } : access;
}
export const gameShipAccessProjection = t.row("GameShipAccessStatus", {
  shipId: t.string().primaryKey(),
  characterId: t.string(),
  instanceId: t.string(),
  deckId: t.string(),
  revision: t.u64(),
  templateSha256: t.string(),
});
export function ownGameShipAccess(ctx: GameShipAccessContext) {
  const actors = [...ctx.db.character.by_owner.filter(ctx.sender)];
  const actor = actors[0];
  if (!actor || actors.length !== 1) return [];
  const location =
    ctx.db.constructionLocation.characterId.find(actor.id) ??
    evaHomeLocation(ctx.db, actor);
  if (
    !location ||
    !ownedGameShipAccess(ctx, location.instanceId, location.deckId).readInterior
  )
    return [];
  const b = ctx.db.gameShipAccess.shipId.find(actor.shipId)!;
  return [
    {
      shipId: b.shipId,
      characterId: b.characterId,
      instanceId: b.instanceId,
      deckId: b.deckId,
      revision: b.instanceRevision,
      templateSha256: b.templateSha256,
    },
  ];
}
