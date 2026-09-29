/**
 * EVA milestone 2 authority, the same-plane model (wiki `Systems/EVA`; owner decision
 * `Decisions/2026-09-29 Same-Plane EVA and Airlock Logic`).
 *
 * Aboard (deck walking) → walk out through an OPEN exterior door (the hand-off keeps the point: the
 * deck frame and a ship's EVA frame are the same ship-local frame) → `local` (floating in that
 * ship's frame, riding along) ⇄ `free` (world frame, after jetpacking clear of the bubble or being
 * out-accelerated) → float back in through an open door with `evaEntryAllowed` → aboard.
 *
 * - Doors belong to ship logic (`ship-logic.ts`): wall buttons drive the airlock controller, which
 *   interlocks the doors and runs the timed cycle. There is no teleporting airlock cycle any more.
 * - Hulls are solid from both sides (volume outlines). Contact pushes the body out; approach speed
 *   above `EVA.impactSafeSpeed` damages it through the ordinary combat damage and death paths.
 * - Input is the ordinary `set_intent` row: dx/dy is the jetpack thrust direction in the body's
 *   frame (ship-local while `local`, world while `free`). The tick rechecks connection, the input
 *   lease, life and access every time input or an entry is consumed.
 * - Maglock boots work only aboard (suit boots, zero gravity); `eva_toggle_maglock` refuses outside.
 *
 * Boarding hooks (later batch): `evaEntryAllowed` is the single decision for passing a doorway and
 * pressing an exterior panel; breaching and lock override extend it.
 */
import { SenderError, t } from "spacetimedb/server";
import type { InferSchema, ReducerCtx, ViewCtx } from "spacetimedb/server";
import type world from "./index";
import { gameShipAccess } from "@sidereal/sim/game-ship-access";
import {
  EVA,
  evaCaptureShip,
  evaEntryThrough,
  evaExitThrough,
  evaImpactDamage,
  evaReference,
  evaReleaseReason,
  evaWorldContact,
  localToWorld,
  stepEvaFree,
  stepEvaLocal,
  worldToLocal,
  wrapAngle,
  type EvaReferenceCandidate,
  type EvaShipModel,
  type ShipPose,
} from "@sidereal/sim/eva";
import {
  neighboringSpatialCells,
  spatialCell,
  withinSpaceDiscovery,
} from "@sidereal/sim/spatial-cells";
import { castCharacterBeam } from "@sidereal/sim/combat-damage";
import { canOccupyDeck } from "@sidereal/sim/construction-collision";
import {
  evaSuitMass,
  evaSuitPresentation,
  EVA_SUIT,
  type EvaSuitIntent,
  type EvaSuitMode,
} from "@sidereal/sim/eva-suit";
import {
  evaSuitCheck,
  evaSuitMessage,
} from "@sidereal/content/crew-wardrobe";
import { characterCarriedMassKg } from "./construction-flight-input";
import * as auth from "./auth";
import { consumeInputControl } from "./input-control";
import {
  commitFlightCharacter,
  markShipFlightDirty,
} from "./construction-flight-dirty";
import { damageCharacter, isDead } from "./combat-damage";
import { clearAim } from "./combat";
import { freeDeckSpot } from "./character-death";
import { visibleEquipment } from "./crew-presentation";
import { spaceObserver } from "./shared-world-views";
import { constructionCollision } from "./construction-doors";
import {
  openExteriorDoors,
  shipPrefabBinding,
} from "./ship-logic";

type Context = ReducerCtx<InferSchema<typeof world>>;
type ReadContext = Pick<ViewCtx<InferSchema<typeof world>>, "db" | "sender">;
type Db = Context["db"];
type CharacterRow = NonNullable<ReturnType<Db["character"]["id"]["find"]>>;
type EvaRow = NonNullable<ReturnType<Db["evaBody"]["characterId"]["find"]>>;
type SuitRow = NonNullable<ReturnType<Db["evaSuit"]["characterId"]["find"]>>;
type MotionRow = NonNullable<
  ReturnType<Db["shipWorldMotion"]["shipId"]["find"]>
>;

/** Input older than this is stale (the walking rule). */
const INPUT_FRESH_MICROS = 300_000n;
/** Bounded work per tick. */
const EVA_BODIES_PER_TICK = 4096;
const STALE_CYCLES_PER_TICK = 64;
/** Walking speed used for the step-out velocity (m/s), as on deck. */
const STEP_OUT_SPEED = 1.4;
/** Spacing to other crew when stepping aboard at the doorway (m). */
const BOARD_SPACING_M = 0.6;

// ------------------------------------------------------------------ geometry

/** EVA geometry of a prefab ship instance (cached per instance revision), or null. */
export function evaModelFor(
  db: Pick<Db, "constructionInstance">,
  shipId: string,
): EvaShipModel | null {
  return shipPrefabBinding(db, shipId)?.eva ?? null;
}

const poseOf = (m: MotionRow): ShipPose => ({
  x: m.x,
  y: m.y,
  vx: m.vx,
  vy: m.vy,
  heading: m.heading,
  omega: m.omega,
});

function cellOf(x: number, y: number) {
  const c = spatialCell({ x, y });
  return { cellX: BigInt(c.cellX), cellY: BigInt(c.cellY) };
}

/** Prefab ships with EVA geometry near a world point in one system (3×3 cells, bounded). */
function nearbyShips(db: Db, systemId: string, x: number, y: number) {
  const found: { motion: MotionRow; model: EvaShipModel }[] = [];
  let examined = 0;
  for (const cell of neighboringSpatialCells(spatialCell({ x, y })))
    for (const motion of db.shipWorldMotion.by_cell.filter([
      systemId,
      BigInt(cell.cellX),
      BigInt(cell.cellY),
    ])) {
      if (++examined > 256) return found;
      if (motion.systemId !== systemId) continue;
      const model = evaModelFor(db, motion.shipId);
      if (model) found.push({ motion, model });
    }
  return found.sort((a, b) =>
    a.motion.shipId < b.motion.shipId
      ? -1
      : a.motion.shipId > b.motion.shipId
        ? 1
        : 0,
  );
}

// ------------------------------------------------------------------ access

/**
 * Owned game-ship access to the ship's bound deck, as if standing there (the facts that admit
 * walking on it). Read-only.
 */
export function ownedDeckAccess(
  ctx: Pick<Context, "db">,
  actor: CharacterRow,
  shipId: string,
) {
  const instance = ctx.db.constructionInstance.id.find(shipId),
    ship = ctx.db.ship.id.find(shipId),
    binding = ctx.db.gameShipAccess.shipId.find(shipId),
    admission = ctx.db.worldAdmission.characterId.find(actor.id),
    motion = ctx.db.shipWorldMotion.shipId.find(shipId),
    deck = binding && ctx.db.constructionDeck.id.find(binding.deckId);
  if (!instance || !ship || !binding || !deck || !admission || !motion) return;
  const principalId = actor.owner.toHexString();
  const allowed = gameShipAccess({
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
    location: {
      characterId: actor.id,
      instanceId: instance.id,
      deckId: deck.id,
    },
    admission,
    motion,
  }).walkDeck;
  return allowed ? { instance, deck, binding, motion } : undefined;
}

/**
 * The single entry decision (boarding hook): may this character pass the ship's exterior doorway
 * (and operate its exterior panels)? Milestone 2: owned game-ship access. Later batches add
 * invitations, lock overrides and breach entries here.
 */
export function evaEntryAllowed(
  ctx: Pick<Context, "db">,
  actor: CharacterRow,
  shipId: string,
  _entry: { kind: "door"; id: string } | { kind: "panel"; id: string },
) {
  return ownedDeckAccess(ctx, actor, shipId);
}

/** Exterior panel gate for `press_ship_button`: the same entry decision as the doorway. */
export function exteriorPanelAllowed(
  ctx: Pick<Context, "db">,
  actorId: string,
  shipId: string,
) {
  const actor = ctx.db.character.id.find(actorId);
  return (
    !!actor && !!evaEntryAllowed(ctx, actor, shipId, { kind: "panel", id: "" })
  );
}

/** Exterior doors this actor may pass on `shipId` now: open AND entry allowed. */
function passableEntries(
  ctx: Pick<Context, "db">,
  actor: CharacterRow,
  shipId: string,
): Set<string> {
  const binding = shipPrefabBinding(ctx.db, shipId);
  if (!binding) return new Set();
  const open = openExteriorDoors(ctx.db, binding);
  if (!open.size) return open;
  return evaEntryAllowed(ctx, actor, shipId, { kind: "door", id: "" })
    ? open
    : new Set();
}

/** The ship has at least one logic-actuated exterior door (an EVA entry). */
function hasEntry(db: Parameters<typeof shipPrefabBinding>[0], shipId: string) {
  const b = shipPrefabBinding(db, shipId);
  return !!b?.logic?.doors.some((d) => d.exterior);
}

// ------------------------------------------------------------------ helpers

function actorOf(ctx: Pick<Context, "db" | "sender">) {
  const actor = [...ctx.db.character.by_owner.filter(ctx.sender)][0];
  if (!actor?.connected) throw new SenderError("Character unavailable");
  if (isDead(ctx, actor.id)) throw new SenderError("You are dead");
  return actor;
}

function zeroInput(ctx: Context, characterId: string) {
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
}

export const isInEva = (db: Pick<Db, "evaBody">, characterId: string) =>
  !!db.evaBody.characterId.find(characterId);
/** Milestone-1 cycles no longer exist; kept for callers that hold still while cycling. */
export const isCyclingAirlock = (
  db: Pick<Db, "evaAirlockCycle">,
  characterId: string,
) => !!db.evaAirlockCycle.characterId.find(characterId);

// ------------------------------------------------------------------ suit

/**
 * The suit rule for a character: the refusal message when the EVA pressure suit, helmet or
 * jetpack is not equipped, else "". Uses only equipped items (one per slot).
 */
export function evaSuitRefusal(
  ctx: Pick<Context, "db">,
  characterId: string,
): string {
  const equipped: { slot: string; id: string }[] = [];
  let count = 0;
  for (const item of ctx.db.inventoryItem.by_character.filter(characterId)) {
    if (++count > 512) break;
    if (item.equipmentSlot)
      equipped.push({ slot: item.equipmentSlot, id: item.definitionId });
  }
  const check = evaSuitCheck(equipped);
  return check.ready ? "" : evaSuitMessage(check.missing);
}

/** Mass of the suited body (body, suit and everything carried), kg. */
function suitedMassKg(ctx: Pick<Context, "db">, characterId: string) {
  try {
    return EVA_SUIT.bodyMassKg + characterCarriedMassKg(ctx as never, characterId);
  } catch {
    return EVA_SUIT.bodyMassKg + 30;
  }
}

function suitOf(ctx: Context, body: EvaRow): SuitRow {
  return (
    ctx.db.evaSuit.characterId.find(body.characterId) ?? {
      characterId: body.characterId,
      owner: body.owner,
      mode: "hold",
      facing: inShipFrame(body) ? body.localHeading : body.heading,
      facingActive: false,
      omega: 0,
      massKg: suitedMassKg(ctx, body.characterId),
      revision: 0n,
    }
  );
}
function writeSuit(ctx: Context, row: SuitRow) {
  if (ctx.db.evaSuit.characterId.find(row.characterId))
    ctx.db.evaSuit.characterId.update(row);
  else ctx.db.evaSuit.insert(row);
}

/**
 * Suit controls (intent, not motion): the stabiliser mode and the facing the suit IFCS steers to
 * (a heading in the body's current frame: ship-local in a ship's frame, world while free).
 */
export function setSuit(
  ctx: Context,
  args: { mode: string; facing: number; facingActive: boolean },
) {
  const actor = actorOf(ctx);
  const body = ctx.db.evaBody.characterId.find(actor.id);
  if (!body) throw new SenderError("Only outside the ship");
  if (args.mode !== "hold" && args.mode !== "free")
    throw new SenderError("Unknown suit mode");
  if (!Number.isFinite(args.facing) || Math.abs(args.facing) > 64)
    throw new SenderError("Invalid facing");
  const suit = suitOf(ctx, body);
  const next = {
    ...suit,
    mode: args.mode,
    facing: wrapAngle(args.facing),
    facingActive: args.facingActive,
  };
  if (
    next.mode !== suit.mode ||
    next.facing !== suit.facing ||
    next.facingActive !== suit.facingActive ||
    !ctx.db.evaSuit.characterId.find(actor.id)
  )
    writeSuit(ctx, { ...next, revision: suit.revision + 1n });
}

function writeBody(ctx: Context, row: EvaRow) {
  const cell = cellOf(row.x, row.y);
  const next = { ...row, ...cell };
  if (ctx.db.evaBody.characterId.find(row.characterId))
    ctx.db.evaBody.characterId.update(next);
  else ctx.db.evaBody.insert(next);
}

/** Legacy phase names (milestone 1 `maglocked` rows) are ship-frame bodies. */
const inShipFrame = (body: EvaRow) =>
  (body.phase === "local" || body.phase === "maglocked") && !!body.anchorShipId;

// ------------------------------------------------------------------ reducers

/**
 * Milestone-1 reducer kept for schema compatibility: the teleporting airlock cycle is gone.
 * Airlocks are operated with the wall buttons (`press_ship_button`).
 */
export function cycleAirlock(
  ctx: Context,
  _args: { shipId: string; airlockId: string },
) {
  actorOf(ctx);
  throw new SenderError("Use the airlock's wall buttons (E)");
}

/** M: mag boots work only inside a ship (space-suit boots, zero gravity); never on the hull. */
export function toggleMaglock(ctx: Context) {
  const actor = actorOf(ctx);
  if (ctx.db.evaBody.characterId.find(actor.id))
    throw new SenderError("Mag boots only work inside a ship");
  throw new SenderError("Mag boots engage by themselves when gravity is off");
}

/** Start (or cancel) the rescue beacon when stranded. */
export function emergencyReturn(ctx: Context) {
  const actor = actorOf(ctx);
  const body = ctx.db.evaBody.characterId.find(actor.id);
  if (!body) throw new SenderError("Only outside the ship");
  if (body.returnEndsMicros) {
    writeBody(ctx, {
      ...body,
      returnEndsMicros: 0n,
      revision: body.revision + 1n,
    });
    return;
  }
  if (!evaStranded(ctx.db, actor, body))
    throw new SenderError("Your ship is within reach");
  writeBody(ctx, {
    ...body,
    returnEndsMicros:
      ctx.timestamp.microsSinceUnixEpoch + EVA.emergencyReturnMicros,
    revision: body.revision + 1n,
  });
}

/**
 * Stranded: the own ship is missing, in another system, more than `EVA.strandedM` away, or has no
 * door a spacewalker can come back in through.
 */
export function evaStranded(
  db: {
    shipWorldMotion: {
      shipId: {
        find(
          id: string,
        ): { x: number; y: number; systemId: string } | null | undefined;
      };
    };
  } & Parameters<typeof shipPrefabBinding>[0],
  actor: { shipId: string },
  body: Pick<EvaRow, "x" | "y" | "systemId">,
) {
  const own = actor.shipId
    ? db.shipWorldMotion.shipId.find(actor.shipId)
    : undefined;
  return (
    !own ||
    own.systemId !== body.systemId ||
    Math.hypot(own.x - body.x, own.y - body.y) > EVA.strandedM ||
    !hasEntry(db, actor.shipId)
  );
}

// ------------------------------------------------------------------ doorway hand-off

/**
 * Deck → outside (called by the walking tick before the deck step): a walker in the lane of an
 * OPEN exterior door, at the hull line and pushing outward, becomes a spacewalker at the same
 * ship-local point, moving out at walking speed. Returns true when it happened.
 */
export function tryStepOut(
  ctx: Context,
  actor: CharacterRow,
  command: { dx: number; dy: number },
) {
  const location = ctx.db.constructionLocation.characterId.find(actor.id);
  if (!location || location.instanceId !== actor.shipId) return false;
  const binding = shipPrefabBinding(ctx.db, actor.shipId);
  if (!binding?.logic) return false;
  const open = openExteriorDoors(ctx.db, binding);
  if (!open.size) return false;
  const entry = evaExitThrough(
    binding.eva,
    [actor.localX, actor.localY],
    [command.dx, command.dy],
    open,
  );
  const motion = ctx.db.shipWorldMotion.shipId.find(actor.shipId);
  if (!entry || !motion) return false;
  // Vacuum: no suit, no step outside (the hatch line stays a wall for the walker).
  if (evaSuitRefusal(ctx, actor.id)) return false;
  const pose = poseOf(motion);
  const local = {
    x: actor.localX,
    y: actor.localY,
    vx: entry.normal[0] * STEP_OUT_SPEED,
    vy: entry.normal[1] * STEP_OUT_SPEED,
    heading: Math.atan2(-entry.normal[0], entry.normal[1]),
    omega: 0,
  };
  const w = localToWorld(pose, local);
  const before = ctx.db.evaBody.characterId.find(actor.id);
  ctx.db.constructionLocation.characterId.delete(actor.id);
  writeBody(ctx, {
    characterId: actor.id,
    owner: actor.owner,
    systemId: motion.systemId,
    cellX: 0n,
    cellY: 0n,
    phase: "local",
    x: w.x,
    y: w.y,
    vx: w.vx,
    vy: w.vy,
    heading: w.heading,
    anchorShipId: motion.shipId,
    localX: local.x,
    localY: local.y,
    localHeading: local.heading,
    refShipId: motion.shipId,
    refVx: w.refVx,
    refVy: w.refVy,
    forward: 0,
    strafe: 0,
    turn: 0,
    walking: false,
    exitShipId: motion.shipId,
    visitId: location.visitId,
    deckId: location.deckId,
    returnEndsMicros: 0n,
    serverTick: ctx.timestamp.microsSinceUnixEpoch / 50_000n,
    revision: (before?.revision ?? 0n) + 1n,
  });
  writeSuit(ctx, {
    characterId: actor.id,
    owner: actor.owner,
    mode: "hold",
    facing: local.heading,
    facingActive: false,
    omega: 0,
    massKg: suitedMassKg(ctx, actor.id),
    revision: (ctx.db.evaSuit.characterId.find(actor.id)?.revision ?? 0n) + 1n,
  });
  if (actor.sprinting)
    ctx.db.character.id.update({ ...actor, sprinting: false });
  // The character no longer counts toward the ship's flight mass.
  markShipFlightDirty(ctx, motion.shipId);
  return true;
}

/**
 * Outside → deck at the same point (the doorway hand-off). Needs owned access, a free spot exactly
 * there (deck collision and other crew) and the ship's bound deck. Returns false and changes
 * nothing otherwise (the body stays in the doorway lane).
 */
function stepAboard(
  ctx: Context,
  actor: CharacterRow,
  body: EvaRow,
  shipId: string,
  point: readonly [number, number],
) {
  const access = ownedDeckAccess(ctx, actor, shipId);
  if (!access) return false;
  const frame = constructionCollision(ctx, access.instance, access.deck.id);
  if (
    !canOccupyDeck(
      frame,
      { shipId, deckId: access.deck.id, position: [point[0], point[1]] },
      EVA.bodyRadiusM,
    )
  )
    return false;
  let count = 0;
  for (const l of ctx.db.constructionLocation.by_instance.filter(shipId)) {
    if (++count > 256) return false;
    const other = ctx.db.character.id.find(l.characterId);
    if (
      other &&
      other.id !== actor.id &&
      other.shipId === shipId &&
      Math.hypot(other.localX - point[0], other.localY - point[1]) <
        BOARD_SPACING_M
    )
      return false;
  }
  commitAboard(ctx, actor, body, shipId, access.deck.id, point);
  return true;
}

function commitAboard(
  ctx: Context,
  actor: CharacterRow,
  body: EvaRow | undefined,
  shipId: string,
  deckId: string,
  point: readonly [number, number],
) {
  const existing = ctx.db.constructionLocation.characterId.find(actor.id);
  const location = {
    characterId: actor.id,
    // Returning to the ship left keeps its visit (the client keeps the loaded ship scene).
    visitId:
      body?.visitId && body.exitShipId === shipId && actor.shipId === shipId
        ? body.visitId
        : ctx.newUuidV4().toString(),
    instanceId: shipId,
    deckId,
    returnShipId: "",
    returnX: 0,
    returnY: 0,
    revision: (existing?.revision ?? 0n) + 1n,
  };
  ctx.db.evaBody.characterId.delete(actor.id);
  if (ctx.db.evaSuit.characterId.find(actor.id))
    ctx.db.evaSuit.characterId.delete(actor.id);
  if (ctx.db.evaAirlockCycle.characterId.find(actor.id))
    ctx.db.evaAirlockCycle.characterId.delete(actor.id);
  if (existing) ctx.db.constructionLocation.characterId.update(location);
  else ctx.db.constructionLocation.insert(location);
  commitFlightCharacter(
    ctx,
    {
      ...ctx.db.character.id.find(actor.id)!,
      shipId,
      localX: point[0],
      localY: point[1],
      sprinting: false,
    },
    (row) => ctx.db.character.id.update(row),
  );
  markShipFlightDirty(ctx, shipId);
}

/**
 * Respawn and emergency return: bring an EVA character back aboard their own ship at its trusted
 * spawn point (a free spot within rings of it). No-op without owned access.
 */
export function evaReturnAboard(ctx: Context, characterId: string) {
  const actor = ctx.db.character.id.find(characterId);
  const body = ctx.db.evaBody.characterId.find(characterId);
  if (!actor?.shipId || !body) return false;
  const access = ownedDeckAccess(ctx, actor, actor.shipId);
  if (!access) return false;
  const location = {
    characterId: actor.id,
    visitId: body.visitId,
    instanceId: actor.shipId,
    deckId: access.deck.id,
    returnShipId: "",
    returnX: 0,
    returnY: 0,
    revision: 0n,
  };
  const spot = freeDeckSpot(
    ctx,
    actor,
    access.instance,
    access.deck,
    location,
    [access.instance.spawnX, access.instance.spawnY],
  );
  if (!spot) return false;
  commitAboard(ctx, actor, body, actor.shipId, access.deck.id, [spot.x, spot.y]);
  zeroInput(ctx, actor.id);
  return true;
}

// ------------------------------------------------------------------ tick

function freshInput(ctx: Context, actor: CharacterRow) {
  const command = ctx.db.input.characterId.find(actor.id);
  if (
    !command ||
    !actor.connected ||
    !auth.canConsume(ctx, actor.owner) ||
    !consumeInputControl(ctx, actor.id) ||
    isDead(ctx, actor.id) ||
    ctx.timestamp.microsSinceUnixEpoch - command.updatedMicros >=
      INPUT_FRESH_MICROS
  )
    return undefined;
  return command;
}

/** Contact damage with leeway (alive bodies only); death goes through the ordinary path. */
function applyImpact(ctx: Context, characterId: string, speed: number) {
  const damage = evaImpactDamage(speed);
  if (damage > 0 && !isDead(ctx, characterId))
    damageCharacter(ctx, characterId, damage);
}

function toFree(
  body: EvaRow,
  w: { x: number; y: number; vx: number; vy: number; heading: number },
  tick: bigint,
): EvaRow {
  return {
    ...body,
    x: w.x,
    y: w.y,
    vx: w.vx,
    vy: w.vy,
    heading: w.heading,
    phase: "free",
    anchorShipId: "",
    localX: 0,
    localY: 0,
    localHeading: 0,
    refVx: w.vx,
    refVy: w.vy,
    serverTick: tick,
    revision: body.revision + 1n,
  };
}

/** The suit's intent this tick: thrust direction from the input row, facing and mode from the suit. */
function intentOf(
  suit: SuitRow,
  input: { dx: number; dy: number; turn: number },
): EvaSuitIntent {
  return {
    dx: input.dx,
    dy: input.dy,
    facing: suit.facingActive ? suit.facing : null,
    mode: (suit.mode === "free" ? "free" : "hold") as EvaSuitMode,
    turn: input.turn,
  };
}

/** Persist the suit's spin (and frame-converted facing) when they change. */
function writeSuitSpin(
  ctx: Context,
  suit: SuitRow,
  omega: number,
  facing: number = suit.facing,
) {
  if (omega === suit.omega && facing === suit.facing && ctx.db.evaSuit.characterId.find(suit.characterId))
    return;
  writeSuit(ctx, { ...suit, omega, facing, revision: suit.revision + 1n });
}

function stepLocal(
  ctx: Context,
  actor: CharacterRow,
  body: EvaRow,
  suit: SuitRow,
  input: { dx: number; dy: number; turn: number },
  tick: bigint,
) {
  const shipId = body.anchorShipId;
  const motion = ctx.db.shipWorldMotion.shipId.find(shipId);
  const model = motion && evaModelFor(ctx.db, shipId);
  if (!motion || !model || motion.systemId !== body.systemId) {
    // The ship went away: float free where the body was, with its last velocity.
    writeBody(ctx, toFree(body, body, tick));
    writeSuitSpin(ctx, suit, suit.omega, wrapAngle(suit.facing + (body.heading - body.localHeading)));
    return;
  }
  const pose = poseOf(motion);
  // Local velocity recovered exactly from the stored world velocity and last tick's ship velocity
  // (the reference), in last tick's ship frame (heading − localHeading).
  const legacy = body.phase !== "local";
  const lastShipHeading = body.heading - body.localHeading;
  const rel = legacy ? [0, 0] : [body.vx - body.refVx, body.vy - body.refVy];
  const c = Math.cos(-lastShipHeading),
    s = Math.sin(-lastShipHeading);
  const start = {
    x: body.localX,
    y: body.localY,
    vx: c * rel[0] - s * rel[1],
    vy: s * rel[0] + c * rel[1],
    heading: body.localHeading,
    omega: suit.omega,
  };
  // Dropped into world space when the ship out-accelerates the suit or the body is far out.
  const release = evaReleaseReason(
    pose,
    model.radiusM,
    [start.x, start.y],
    legacy || body.refShipId !== shipId ? undefined : [body.refVx, body.refVy],
  );
  if (release) {
    // Inertia: the body keeps last tick's world velocity (the suit could not follow).
    const w = localToWorld(pose, start);
    writeBody(
      ctx,
      toFree(body, { x: w.x, y: w.y, vx: body.vx, vy: body.vy, heading: w.heading }, tick),
    );
    writeSuitSpin(ctx, suit, suit.omega, wrapAngle(suit.facing + pose.heading));
    return;
  }
  const open = passableEntries(ctx, actor, shipId);
  const step = stepEvaLocal(
    model,
    start,
    intentOf(suit, input),
    open,
    evaSuitMass(suit.massKg - EVA_SUIT.bodyMassKg),
  );
  applyImpact(ctx, actor.id, step.impactSpeed);
  const next = step.state;
  // Doorway hand-off inward: the same point becomes a deck position.
  const entry = evaEntryThrough(model, [next.x, next.y], open);
  if (
    entry &&
    !isDead(ctx, actor.id) &&
    stepAboard(ctx, actor, body, shipId, [next.x, next.y])
  )
    return;
  const w = localToWorld(pose, next);
  const shown = evaSuitPresentation(step.allocation);
  const moved = {
    ...body,
    x: w.x,
    y: w.y,
    vx: w.vx,
    vy: w.vy,
    heading: w.heading,
    refVx: w.refVx,
    refVy: w.refVy,
    phase: "local",
    anchorShipId: shipId,
    localX: next.x,
    localY: next.y,
    localHeading: next.heading,
    refShipId: shipId,
    ...shown,
    walking: false,
    serverTick: tick,
  };
  if (
    moved.x !== body.x ||
    moved.y !== body.y ||
    moved.vx !== body.vx ||
    moved.vy !== body.vy ||
    moved.heading !== body.heading ||
    moved.phase !== body.phase ||
    moved.forward !== body.forward ||
    moved.strafe !== body.strafe ||
    moved.turn !== body.turn ||
    moved.localX !== body.localX ||
    moved.localY !== body.localY ||
    moved.returnEndsMicros !== body.returnEndsMicros
  )
    writeBody(ctx, moved);
  writeSuitSpin(ctx, suit, next.omega);
}

function stepFree(
  ctx: Context,
  actor: CharacterRow,
  body: EvaRow,
  suit: SuitRow,
  input: { dx: number; dy: number; turn: number },
  tick: bigint,
) {
  const ships = nearbyShips(ctx.db, body.systemId, body.x, body.y);
  const candidates: EvaReferenceCandidate[] = ships.map(
    ({ motion, model }) => ({
      id: motion.shipId,
      pose: poseOf(motion),
      radiusM: model.radiusM,
    }),
  );
  const ref = evaReference(candidates, [body.x, body.y]);
  const vRef: [number, number] = ref ? ref.velocity : [body.refVx, body.refVy];
  const previous: [number, number] =
    ref && ref.shipId === body.refShipId ? [body.refVx, body.refVy] : vRef;
  const step = stepEvaFree(
    { x: body.x, y: body.y, vx: body.vx, vy: body.vy, heading: body.heading, omega: suit.omega },
    intentOf(suit, input),
    evaSuitMass(suit.massKg - EVA_SUIT.bodyMassKg),
    vRef,
    EVA.tickSeconds,
    previous,
  );
  let state = step.state;
  // Hulls are solid: a ship that moved into the body (or the body into it) pushes it out.
  for (const { motion, model } of ships) {
    const pose = poseOf(motion);
    if (
      Math.hypot(state.x - pose.x, state.y - pose.y) >
      model.radiusM + EVA.bodyRadiusM + 1
    )
      continue;
    const contact = evaWorldContact(
      model,
      pose,
      state,
      passableEntries(ctx, actor, motion.shipId),
    );
    if (!contact) continue;
    state = contact.body;
    applyImpact(ctx, actor.id, contact.impactSpeed);
  }
  if (!ctx.db.evaBody.characterId.find(actor.id)) return;
  const shown = evaSuitPresentation(step.allocation);
  // Captured into a ship's frame: ride along from now on.
  const captured = evaCaptureShip(candidates, state);
  if (captured) {
    const pose = candidates.find((c) => c.id === captured)!.pose;
    const local = worldToLocal(pose, state);
    const w = localToWorld(pose, local);
    writeBody(ctx, {
      ...body,
      x: w.x,
      y: w.y,
      vx: w.vx,
      vy: w.vy,
      heading: w.heading,
      refVx: w.refVx,
      refVy: w.refVy,
      phase: "local",
      anchorShipId: captured,
      localX: local.x,
      localY: local.y,
      localHeading: local.heading,
      refShipId: captured,
      ...shown,
      walking: false,
      serverTick: tick,
      revision: body.revision + 1n,
    });
    writeSuitSpin(ctx, suit, state.omega, wrapAngle(suit.facing - pose.heading));
    return;
  }
  const next = {
    ...body,
    x: state.x,
    y: state.y,
    vx: state.vx,
    vy: state.vy,
    heading: state.heading,
    refShipId: ref?.shipId ?? "",
    refVx: vRef[0],
    refVy: vRef[1],
    ...shown,
    walking: false,
    serverTick: tick,
  };
  if (
    next.x !== body.x ||
    next.y !== body.y ||
    next.vx !== body.vx ||
    next.vy !== body.vy ||
    next.heading !== body.heading ||
    next.forward !== body.forward ||
    next.strafe !== body.strafe ||
    next.turn !== body.turn ||
    next.refShipId !== body.refShipId ||
    next.returnEndsMicros !== body.returnEndsMicros
  )
    writeBody(ctx, next);
  writeSuitSpin(ctx, suit, state.omega);
}

function stepBody(ctx: Context, body: EvaRow, tick: bigint) {
  const actor = ctx.db.character.id.find(body.characterId);
  if (!actor) {
    ctx.db.evaBody.characterId.delete(body.characterId);
    if (ctx.db.evaSuit.characterId.find(body.characterId))
      ctx.db.evaSuit.characterId.delete(body.characterId);
    return;
  }
  const now = ctx.timestamp.microsSinceUnixEpoch;
  if (
    body.returnEndsMicros &&
    now >= body.returnEndsMicros &&
    !isDead(ctx, actor.id)
  ) {
    if (evaReturnAboard(ctx, actor.id)) return;
    body = { ...body, returnEndsMicros: 0n };
  }
  let suit = suitOf(ctx, body);
  // The carried mass is refreshed about once a second (inventory changes are rare outside).
  if (tick % 20n === 0n) suit = { ...suit, massKg: suitedMassKg(ctx, actor.id) };
  const command = freshInput(ctx, actor);
  const input = {
    dx: command?.dx ?? 0,
    dy: command?.dy ?? 0,
    turn: command?.turn ?? 0,
  };
  if (inShipFrame(body)) stepLocal(ctx, actor, body, suit, input, tick);
  else stepFree(ctx, actor, body, suit, input, tick);
}

/** Scheduled step (20 Hz, after the shared world stepped ships and ship logic ran). */
export function stepEva(ctx: Context) {
  // Milestone-1 airlock cycles no longer run: clear any left from before the upgrade.
  let stale = 0;
  for (const cycle of [...ctx.db.evaAirlockCycle.iter()]) {
    if (++stale > STALE_CYCLES_PER_TICK) break;
    ctx.db.evaAirlockCycle.characterId.delete(cycle.characterId);
  }
  const tick = ctx.timestamp.microsSinceUnixEpoch / 50_000n;
  const bodies: EvaRow[] = [];
  for (const body of ctx.db.evaBody.iter()) {
    if (bodies.length >= EVA_BODIES_PER_TICK) break;
    bodies.push(body);
  }
  bodies.sort((a, b) =>
    a.characterId < b.characterId ? -1 : a.characterId > b.characterId ? 1 : 0,
  );
  for (const body of bodies) {
    const current = ctx.db.evaBody.characterId.find(body.characterId);
    if (current) stepBody(ctx, current, tick);
  }
}

/** Clear an EVA character's input and aim when they leave or die (used by death release). */
export function clearEvaIntent(ctx: Context, characterId: string) {
  clearAim(ctx, characterId);
  zeroInput(ctx, characterId);
}

// ------------------------------------------------------------------ combat

/** Beam of an EVA shooter in the world frame: stops at the first other EVA body (connected,
 * alive). Hull blocking for EVA shots is a later (boarding) batch. */
export function resolveEvaShot(
  ctx: Context,
  body: EvaRow,
  angle: number,
  rangeM: number,
) {
  const targets: { id: string; x: number; y: number }[] = [];
  let examined = 0;
  for (const cell of neighboringSpatialCells(spatialCell(body)))
    for (const other of ctx.db.evaBody.by_cell.filter([
      body.systemId,
      BigInt(cell.cellX),
      BigInt(cell.cellY),
    ])) {
      if (++examined > 512) break;
      if (
        other.characterId === body.characterId ||
        other.systemId !== body.systemId
      )
        continue;
      const character = ctx.db.character.id.find(other.characterId);
      if (!character?.connected || isDead(ctx, other.characterId)) continue;
      targets.push({ id: other.characterId, x: other.x, y: other.y });
    }
  const hit = castCharacterBeam(
    [body.x, body.y],
    angle,
    rangeM,
    targets,
    EVA.bodyRadiusM,
  );
  return hit
    ? {
        kind: "character" as const,
        targetId: hit.id,
        distanceM: hit.distanceM,
        point: hit.point,
      }
    : {
        kind: "none" as const,
        targetId: "",
        distanceM: rangeM,
        point: [
          body.x + Math.sin(angle) * rangeM,
          body.y + Math.cos(angle) * rangeM,
        ] as [number, number],
      };
}

// ------------------------------------------------------------------ views

export const ownEvaBodyProjection = t.row("EvaBodyStatus", {
  characterId: t.string().primaryKey(),
  systemId: t.string(),
  phase: t.string(),
  x: t.f64(),
  y: t.f64(),
  vx: t.f64(),
  vy: t.f64(),
  heading: t.f64(),
  anchorShipId: t.string(),
  localX: t.f64(),
  localY: t.f64(),
  localHeading: t.f64(),
  refShipId: t.string(),
  forward: t.f64(),
  strafe: t.f64(),
  turn: t.f64(),
  walking: t.bool(),
  exitShipId: t.string(),
  visitId: t.string(),
  deckId: t.string(),
  returnEndsMicros: t.u64(),
  stranded: t.bool(),
  serverTick: t.u64(),
  revision: t.u64(),
});
export const ownEvaSuitProjection = t.row("EvaSuitStatus", {
  characterId: t.string().primaryKey(),
  mode: t.string(),
  facing: t.f64(),
  facingActive: t.bool(),
  omega: t.f64(),
  massKg: t.f64(),
  revision: t.u64(),
});
export const ownEvaCycleProjection = t.row("EvaAirlockCycleStatus", {
  characterId: t.string().primaryKey(),
  shipId: t.string(),
  airlockId: t.string(),
  direction: t.string(),
  startedMicros: t.u64(),
  endsMicros: t.u64(),
});
export const visibleEvaBodyProjection = t.row("VisibleEvaBody", {
  characterId: t.string().primaryKey(),
  name: t.string(),
  systemId: t.string(),
  phase: t.string(),
  x: t.f64(),
  y: t.f64(),
  vx: t.f64(),
  vy: t.f64(),
  heading: t.f64(),
  /** In a ship's frame (`local`): the ship and the ship-local point; empty/0 while free. */
  anchorShipId: t.string(),
  localX: t.f64(),
  localY: t.f64(),
  localHeading: t.f64(),
  forward: t.f64(),
  strafe: t.f64(),
  turn: t.f64(),
  walking: t.bool(),
  cycling: t.bool(),
  dead: t.bool(),
  connected: t.bool(),
  appearanceJson: t.string(),
  equipmentJson: t.string(),
  aimActive: t.bool(),
  aimAngle: t.f64(),
  shotSequence: t.u64(),
  /** World end point of the latest accepted shot fired in EVA. */
  shotX: t.f64(),
  shotY: t.f64(),
  shotStruck: t.bool(),
  serverTick: t.u64(),
});

function ownActor(ctx: ReadContext) {
  const actor = [...ctx.db.character.by_owner.filter(ctx.sender)][0];
  return actor?.connected ? actor : undefined;
}

export function ownEvaBody(ctx: ReadContext) {
  const actor = ownActor(ctx);
  const body = actor && ctx.db.evaBody.characterId.find(actor.id);
  if (!actor || !body) return [];
  return [
    {
      characterId: body.characterId,
      systemId: body.systemId,
      phase: body.phase,
      x: body.x,
      y: body.y,
      vx: body.vx,
      vy: body.vy,
      heading: body.heading,
      anchorShipId: body.anchorShipId,
      localX: body.localX,
      localY: body.localY,
      localHeading: body.localHeading,
      refShipId: body.refShipId,
      forward: body.forward,
      strafe: body.strafe,
      turn: body.turn,
      walking: body.walking,
      exitShipId: body.exitShipId,
      visitId: body.visitId,
      deckId: body.deckId,
      returnEndsMicros: body.returnEndsMicros,
      stranded: evaStranded(ctx.db, actor, body),
      serverTick: body.serverTick,
      revision: body.revision,
    },
  ];
}

/** The own suit while outside (mode, facing target, spin, mass). */
export function ownEvaSuit(ctx: ReadContext) {
  const actor = ownActor(ctx);
  const suit = actor && ctx.db.evaSuit.characterId.find(actor.id);
  return suit && ctx.db.evaBody.characterId.find(suit.characterId)
    ? [
        {
          characterId: suit.characterId,
          mode: suit.mode,
          facing: suit.facing,
          facingActive: suit.facingActive,
          omega: suit.omega,
          massKg: suit.massKg,
          revision: suit.revision,
        },
      ]
    : [];
}

export function ownEvaAirlockCycle(ctx: ReadContext) {
  const actor = ownActor(ctx);
  const cycle = actor && ctx.db.evaAirlockCycle.characterId.find(actor.id);
  return cycle
    ? [
        {
          characterId: cycle.characterId,
          shipId: cycle.shipId,
          airlockId: cycle.airlockId,
          direction: cycle.direction,
          startedMicros: cycle.startedMicros,
          endsMicros: cycle.endsMicros,
        },
      ]
    : [];
}

/**
 * EVA bodies a viewer can see: the same admission as `visible_ship_motion` (one admitted,
 * connected character), bodies in the observer's 3×3 spatial cells within the exact 400 m
 * discovery distance, plus the viewer's own. The centre is the viewer's EVA body while outside,
 * else the viewer's ship. Columns exclude health numbers, inventory UUIDs and the stabiliser
 * reference.
 */
export function visibleEvaBodies(ctx: ReadContext) {
  const origin = spaceObserver(ctx);
  if (!origin) return [];
  const { admitted: admission, point: center, cells } = origin;
  const actor = ctx.db.character.id.find(admission.characterId);
  if (!actor) return [];
  const out = [];
  let examined = 0;
  for (const cell of cells)
    for (const body of ctx.db.evaBody.by_cell.filter([
      admission.systemId,
      BigInt(cell.cellX),
      BigInt(cell.cellY),
    ])) {
      if (++examined > 512) return out;
      if (body.systemId !== admission.systemId) continue;
      if (body.characterId !== actor.id && !withinSpaceDiscovery(center, body))
        continue;
      const character = ctx.db.character.id.find(body.characterId);
      if (!character) continue;
      const vitals = ctx.db.characterVitals.characterId.find(body.characterId),
        dead = vitals?.state === "dead" || vitals?.state === "downed";
      const aim = ctx.db.combatAim.characterId.find(body.characterId),
        aimActive = !!aim?.active && !dead;
      const shot = ctx.db.combatImpact.characterId.find(body.characterId),
        inSpace = !!shot && shot.shipId === "";
      const anchored = inShipFrame(body);
      out.push({
        characterId: body.characterId,
        name: character.name,
        systemId: body.systemId,
        phase: anchored ? "local" : "free",
        x: body.x,
        y: body.y,
        vx: body.vx,
        vy: body.vy,
        heading: body.heading,
        anchorShipId: anchored ? body.anchorShipId : "",
        localX: anchored ? body.localX : 0,
        localY: anchored ? body.localY : 0,
        localHeading: anchored ? body.localHeading : 0,
        forward: body.forward,
        strafe: body.strafe,
        turn: body.turn,
        walking: body.walking,
        cycling: false,
        dead,
        connected: character.connected,
        appearanceJson:
          ctx.db.characterAppearance.characterId.find(body.characterId)
            ?.appearanceJson ?? "{}",
        equipmentJson: JSON.stringify(
          visibleEquipment(
            ctx.db.inventoryItem.by_character.filter(body.characterId),
          ),
        ),
        aimActive,
        aimAngle: aimActive ? aim!.angle : 0,
        shotSequence: inSpace ? shot!.shotSequence : 0n,
        shotX: inSpace ? shot!.x : 0,
        shotY: inSpace ? shot!.y : 0,
        shotStruck: inSpace && shot!.kind !== "none",
        serverTick: body.serverTick,
      });
    }
  return out.sort((a, b) =>
    a.characterId < b.characterId ? -1 : a.characterId > b.characterId ? 1 : 0,
  );
}
