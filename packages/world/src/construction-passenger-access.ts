import type { Identity } from "spacetimedb";
import type { Infer } from "spacetimedb/server";
import type {
  constructionPassengerGrant,
  constructionPassengerVisit,
} from "./construction-passenger-tables";
import { passengerAdmission } from "@sidereal/sim/passenger-admission";
import type { PassengerAdmissionFacts } from "@sidereal/sim/passenger-admission";
type Find<T> = { find(id: string): T | undefined | null };
type Owned<T> = Omit<T, "ownerId"> & { owner: Identity };
type Fact<K extends keyof PassengerAdmissionFacts> = NonNullable<
  PassengerAdmissionFacts[K]
>;
export interface PassengerAccessDatabase {
  constructionPassengerGrant: {
    id: Find<Infer<typeof constructionPassengerGrant.rowType>>;
  };
  constructionPassengerVisit: {
    characterId: Find<Infer<typeof constructionPassengerVisit.rowType>>;
  };
  character: { id: Find<Owned<Fact<"actor">>> };
  constructionInstance: { id: Find<Owned<Fact<"instance">>> };
  ship: { id: Find<Owned<Fact<"ship">> & { name: string }> };
  constructionFlightBinding: { shipId: Find<Owned<Fact<"binding">>> };
  constructionLocation: { characterId: Find<Fact<"location">> };
  worldAdmission: { characterId: Find<Owned<Fact<"admission">>> };
  shipWorldMotion: { shipId: Find<Fact<"motion">> };
  constructionDeck: { id: Find<Fact<"deck">> };
  retiredIdentity: { source: { find(id: Identity): unknown } };
  authSession: {
    by_owner: {
      filter(id: Identity): Iterable<{ game: boolean; expiresMicros: bigint }>;
    };
  };
}
/** Kept separate from ownedGameShipAccess and hasAcceptedAuthoredFlight. Views
 * use schedule-materialized expiry; reducer/tick callers always supply now. */
export function acceptedPassengerAccess(
  ctx: { sender: Identity; db: PassengerAccessDatabase },
  characterId: string,
  nowMicros?: bigint,
) {
  const denied = () =>
    passengerAdmission({
      principalId: ctx.sender.toHexString(),
      liveGame: false,
    });
  const a = ctx.db.character.id.find(characterId),
    v = ctx.db.constructionPassengerVisit.characterId.find(characterId);
  if (
    !a ||
    !v ||
    !a.owner.isEqual(ctx.sender) ||
    ctx.db.retiredIdentity.source.find(ctx.sender)
  )
    return denied();
  let liveGame = false,
    sessions = 0;
  for (const s of ctx.db.authSession.by_owner.filter(ctx.sender)) {
    if (++sessions > 64) return denied();
    if (s.game && (nowMicros === undefined || s.expiresMicros > nowMicros))
      liveGame = true;
  }
  const g = ctx.db.constructionPassengerGrant.id.find(v.grantId),
    i = ctx.db.constructionInstance.id.find(v.shipId),
    s = ctx.db.ship.id.find(v.shipId),
    b = ctx.db.constructionFlightBinding.shipId.find(v.shipId),
    m = ctx.db.worldAdmission.characterId.find(characterId);
  return passengerAdmission({
    principalId: ctx.sender.toHexString(),
    liveGame,
    nowMicros,
    actor: { ...a, ownerId: a.owner.toHexString() },
    visit: { ...v, ownerId: v.owner.toHexString() },
    grant: g
      ? {
          ...g,
          ownerId: g.owner.toHexString(),
          granteeOwnerId: g.granteeOwner.toHexString(),
        }
      : undefined,
    instance: i ? { ...i, ownerId: i.owner.toHexString() } : undefined,
    ship: s ? { ...s, ownerId: s.owner.toHexString() } : undefined,
    binding: b ? { ...b, ownerId: b.owner.toHexString() } : undefined,
    admission: m ? { ...m, ownerId: m.owner.toHexString() } : undefined,
    location:
      ctx.db.constructionLocation.characterId.find(characterId) ?? undefined,
    motion: ctx.db.shipWorldMotion.shipId.find(v.shipId) ?? undefined,
    deck: ctx.db.constructionDeck.id.find(v.deckId) ?? undefined,
  });
}
