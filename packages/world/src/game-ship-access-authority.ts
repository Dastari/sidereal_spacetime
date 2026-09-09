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
    location = ctx.db.constructionLocation.characterId.find(actor.id),
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
  return gameShipAccess({
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
  const location = ctx.db.constructionLocation.characterId.find(actor.id);
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
