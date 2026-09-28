/**
 * Character death and respawn (owner decision 2026-09-28, verbatim: "Death, die and respawn, no
 * loss of inventory yet.").
 *
 * - A hit that takes a character to zero health kills them (`damageCharacter`). Death releases
 *   every control grant and seat the way a disconnect does (pilot seat, station, couch/seat, aim,
 *   stale movement and helm input), but the session stays connected so the player sees the death
 *   screen. While dead, movement is ignored and aiming, firing, piloting and interacting are
 *   refused (`requireAlive`, the tick's `canPilot` and walking checks).
 * - `RESPAWN_MICROS` later the world tick respawns them automatically (connected or not):
 *   aboard their own ship at its trusted spawn point on the bound deck (where prefab assignment
 *   boards a character), searched in fixed rings for a free supported spot; otherwise, e.g. with
 *   no ship, as a passenger, or with the spawn blocked, in place on the current ship. Full health.
 * - Nothing is dropped: inventory, equipment and personal containers are never touched here.
 *
 * Every step is idempotent: a respawn only happens for a stored dead row, and writes an alive row.
 */
import type { InferSchema, ReducerCtx } from "spacetimedb/server";
import type world from "./index";
import {
  conditionOf,
  respawnDue,
  respawnedVitals,
  type CharacterVitals,
} from "@sidereal/sim/combat-damage";
import { canOccupyDeck } from "@sidereal/sim/construction-collision";
import { gameShipAccess } from "@sidereal/sim/game-ship-access";
import { clearAim } from "./combat";
import { leaveCouch } from "./interactions";
import { recoverConstructionPilotAuthority } from "./construction-pilot-authority";
import { constructionCollision } from "./construction-doors";
import { commitFlightCharacter } from "./construction-flight-dirty";
import { createConstructionStandingSupport } from "./construction-standing-support";

type Context = ReducerCtx<InferSchema<typeof world>>;
type CharacterRow = NonNullable<
  ReturnType<Context["db"]["character"]["id"]["find"]>
>;
type VitalsRow = NonNullable<
  ReturnType<Context["db"]["characterVitals"]["characterId"]["find"]>
>;

/** Body radius and minimum spacing used when choosing a free respawn spot. */
const BODY_RADIUS_M = 0.3;
const BODY_SPACING_M = 0.65;
/** Respawns committed per tick; the rest follow on the next tick. */
const RESPAWNS_PER_TICK = 32;
const standingSupport = createConstructionStandingSupport();

export const vitalsOf = (row: VitalsRow): CharacterVitals => ({
  health: row.health,
  maxHealth: row.maxHealth,
  state: conditionOf(row.state),
  lastDamageMicros: row.lastDamageMicros,
  downedUntilMicros: row.downedUntilMicros,
  checkpointMicros: row.checkpointMicros,
});

/** Death releases control like a disconnect, without ending the session. Idempotent. */
export function releaseForDeath(ctx: Context, characterId: string) {
  const actor = ctx.db.character.id.find(characterId);
  if (!actor) return;
  if (ctx.db.constructionPilotSeat.characterId.find(characterId))
    recoverConstructionPilotAuthority(ctx, characterId, "death");
  leaveCouch(ctx, characterId, "stand");
  const station = ctx.db.station.shipId.find(actor.shipId);
  if (
    station?.occupantId === characterId &&
    !ctx.db.constructionPilotSeat.characterId.find(characterId)
  )
    ctx.db.station.id.update({ ...station, occupantId: undefined });
  clearAim(ctx, characterId);
  const input = ctx.db.input.characterId.find(characterId);
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
  const now = ctx.db.character.id.find(characterId);
  if (now?.sprinting) ctx.db.character.id.update({ ...now, sprinting: false });
}

function freeOfCrew(
  ctx: Context,
  shipId: string,
  deckId: string,
  characterId: string,
  x: number,
  y: number,
) {
  let count = 0;
  for (const l of ctx.db.constructionLocation.by_instance.filter(shipId)) {
    if (++count > 256) return false;
    if (l.characterId === characterId || l.deckId !== deckId) continue;
    const other = ctx.db.character.id.find(l.characterId);
    if (
      other &&
      other.shipId === shipId &&
      Math.hypot(other.localX - x, other.localY - y) < BODY_SPACING_M
    )
      return false;
  }
  return true;
}

export interface RespawnPlacement {
  shipId: string;
  deckId: string;
  x: number;
  y: number;
}

/**
 * Where a dead character respawns aboard their own ship, or `undefined` to respawn in place.
 * Read-only. Requires the existing owned game-ship access relation (the same facts that admit
 * walking on the ship) for the ship's bound spawn deck, and a free, supported spot within three
 * 0.75 m rings of the trusted spawn point.
 */
export function respawnPlacement(
  ctx: Context,
  actor: CharacterRow,
): RespawnPlacement | undefined {
  if (!actor.shipId) return; // awaiting a ship: nowhere else to go
  // A passenger's own ship is reached only through the passenger return path; traversal and
  // stair rows own the body's pose. All of these respawn in place.
  if (
    ctx.db.constructionPassengerVisit.characterId.find(actor.id) ||
    ctx.db.constructionTraversal.characterId.find(actor.id) ||
    ctx.db.constructionStairWalk.characterId.find(actor.id)
  )
    return;
  const instance = ctx.db.constructionInstance.id.find(actor.shipId),
    ship = ctx.db.ship.id.find(actor.shipId),
    binding = ctx.db.gameShipAccess.shipId.find(actor.shipId),
    location = ctx.db.constructionLocation.characterId.find(actor.id),
    admission = ctx.db.worldAdmission.characterId.find(actor.id),
    motion = ctx.db.shipWorldMotion.shipId.find(actor.shipId),
    deck = binding && ctx.db.constructionDeck.id.find(binding.deckId);
  if (!instance || !ship || !binding || !deck || !location || !admission)
    return;
  if (!motion) return;
  const principalId = actor.owner.toHexString();
  const target = { ...location, instanceId: instance.id, deckId: deck.id };
  if (
    !gameShipAccess({
      principalId,
      liveGame: true,
      actor: { ...actor, ownerId: principalId },
      ship: { ...ship, ownerId: ship.owner.toHexString() },
      binding: {
        ...binding,
        ownerId: binding.owner.toHexString(),
        lifecycle: binding.lifecycle === "active" ? "active" : "suspended",
      },
      instance: { ...instance, ownerId: instance.owner.toHexString() },
      deck,
      location: target,
      admission,
      motion,
    }).walkDeck
  )
    return;
  const frame = constructionCollision(ctx, instance, deck.id);
  for (let ring = 0; ring <= 3; ring++)
    for (let n = 0; n < (ring ? 8 : 1); n++) {
      const x = instance.spawnX + ring * 0.75 * Math.cos((n * Math.PI) / 4),
        y = instance.spawnY + ring * 0.75 * Math.sin((n * Math.PI) / 4);
      if (
        !canOccupyDeck(
          frame,
          { shipId: instance.id, deckId: deck.id, position: [x, y] },
          BODY_RADIUS_M,
        ) ||
        !freeOfCrew(ctx, instance.id, deck.id, actor.id, x, y)
      )
        continue;
      try {
        standingSupport({
          actor: { ...actor, localX: x, localY: y },
          location: target,
          instance,
          deck,
        });
      } catch {
        continue;
      }
      return { shipId: instance.id, deckId: deck.id, x, y };
    }
  return;
}

/** Respawn one dead character now. Returns false when there is nothing to do. */
export function respawnCharacter(ctx: Context, characterId: string) {
  const row = ctx.db.characterVitals.characterId.find(characterId);
  if (!row || conditionOf(row.state) !== "dead") return false;
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const actor = ctx.db.character.id.find(characterId);
  if (actor) {
    releaseForDeath(ctx, characterId);
    let place: RespawnPlacement | undefined;
    try {
      place = respawnPlacement(ctx, ctx.db.character.id.find(characterId)!);
    } catch {
      place = undefined; // unreadable geometry: respawn in place rather than stall
    }
    if (place) {
      const location =
        ctx.db.constructionLocation.characterId.find(characterId)!;
      ctx.db.constructionLocation.characterId.update({
        ...location,
        instanceId: place.shipId,
        deckId: place.deckId,
        revision: location.revision + 1n,
      });
      commitFlightCharacter(
        ctx,
        {
          ...ctx.db.character.id.find(characterId)!,
          localX: place.x,
          localY: place.y,
          sprinting: false,
        },
        (next) => ctx.db.character.id.update(next),
      );
    }
  }
  ctx.db.characterVitals.characterId.update({
    ...row,
    ...respawnedVitals(vitalsOf(row), now),
    state: "active",
  });
  return true;
}

/** Scheduled step: respawn every dead character whose timer has run out (bounded per tick). */
export function stepRespawns(ctx: Context) {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const due: string[] = [];
  let count = 0;
  for (const row of ctx.db.characterVitals.iter()) {
    if (++count > 4096 || due.length >= RESPAWNS_PER_TICK) break;
    if (conditionOf(row.state) === "dead" && respawnDue(vitalsOf(row), now))
      due.push(row.characterId);
  }
  for (const characterId of due) respawnCharacter(ctx, characterId);
}
