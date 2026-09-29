/**
 * EVA milestone 1 authority (design: wiki `Systems/EVA`).
 *
 * Aboard → (E at an exterior airlock) cycling out → free (jetpack) ⇄ maglocked (boots on a hull)
 * → (E at the hatch) cycling in → aboard. The client sends intent only: `eva_cycle_airlock`,
 * `eva_toggle_maglock`, `eva_emergency_return`, and the ordinary `set_intent` input row
 * (throttle = forward thrust, turn = yaw, dx = strafe while free; dx/dy = ship-local walk while
 * maglocked). The world tick (`stepEva`, after the shared world stepped the ships) integrates the
 * bodies and completes cycles, rechecking connection, the input lease, life and access every time
 * a command is consumed.
 *
 * Boarding hooks (later batch): re-entry goes through `evaEntryAllowed` and the model's entry
 * points; milestone 1 admits owned game-ship access through exterior airlocks only.
 */
import { SenderError, t } from "spacetimedb/server";
import type { InferSchema, ReducerCtx, ViewCtx } from "spacetimedb/server";
import type world from "./index";
import { readShipPrefab } from "@sidereal/content/ship-prefab";
import { prefabComponentCatalogFor } from "@sidereal/sim/prefab-catalog";
import { gameShipAccess } from "@sidereal/sim/game-ship-access";
import {
  EVA,
  airlockFromInside,
  airlockFromOutside,
  evaExitPose,
  evaReference,
  headingOf,
  maglockPoint,
  pointVelocity,
  prefabEvaModel,
  shipToWorld,
  stepEvaFree,
  stepMaglockWalk,
  worldToShip,
  wrapAngle,
  type EvaAirlock,
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
import * as auth from "./auth";
import { consumeInputControl } from "./input-control";
import {
  commitFlightCharacter,
  markShipFlightDirty,
} from "./construction-flight-dirty";
import { isDead } from "./combat-damage";
import { clearAim } from "./combat";
import { freeDeckSpot } from "./character-death";
import { visibleEquipment } from "./crew-presentation";
import { spaceObserver } from "./shared-world-views";

type Context = ReducerCtx<InferSchema<typeof world>>;
type ReadContext = Pick<ViewCtx<InferSchema<typeof world>>, "db" | "sender">;
type Db = Context["db"];
type CharacterRow = NonNullable<ReturnType<Db["character"]["id"]["find"]>>;
type EvaRow = NonNullable<ReturnType<Db["evaBody"]["characterId"]["find"]>>;
type CycleRow = NonNullable<
  ReturnType<Db["evaAirlockCycle"]["characterId"]["find"]>
>;
type MotionRow = NonNullable<
  ReturnType<Db["shipWorldMotion"]["shipId"]["find"]>
>;

/** Input older than this is stale (the walking rule). */
const INPUT_FRESH_MICROS = 300_000n;
/** Bounded work per tick. */
const CYCLES_PER_TICK = 256;
const EVA_BODIES_PER_TICK = 4096;

// ------------------------------------------------------------------ geometry

const models = new Map<string, EvaShipModel | null>();
/** EVA geometry of a prefab ship instance (cached per instance revision), or null. */
export function evaModelFor(
  db: Pick<Db, "constructionInstance">,
  shipId: string,
): EvaShipModel | null {
  const instance = db.constructionInstance.id.find(shipId);
  if (!instance) return null;
  const key = instance.id + ":" + instance.revision;
  if (models.has(key)) return models.get(key)!;
  if (models.size >= 128) models.clear();
  let model: EvaShipModel | null = null;
  try {
    const binding = (
      JSON.parse(instance.documentJson) as {
        prefab?: { document?: unknown; catalog?: unknown };
      }
    ).prefab;
    if (binding && typeof binding === "object")
      model = prefabEvaModel(
        readShipPrefab(binding.document),
        prefabComponentCatalogFor(String(binding.catalog)),
      );
  } catch {
    model = null;
  }
  models.set(key, model);
  return model;
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
 * The single entry decision (boarding hook). Milestone 1: owned game-ship access through an
 * exterior airlock. Later batches add invitations, lock overrides and breach entries here.
 */
export function evaEntryAllowed(
  ctx: Pick<Context, "db">,
  actor: CharacterRow,
  shipId: string,
  _entry: { kind: "airlock"; id: string },
) {
  return ownedDeckAccess(ctx, actor, shipId);
}

// ------------------------------------------------------------------ helpers

function actorOf(ctx: Pick<Context, "db" | "sender">) {
  const actor = [...ctx.db.character.by_owner.filter(ctx.sender)][0];
  if (!actor?.connected) throw new SenderError("Character unavailable");
  if (isDead(ctx, actor.id)) throw new SenderError("You are dead");
  return actor;
}

function seated(ctx: Pick<Context, "db">, actor: CharacterRow) {
  return (
    !!ctx.db.couchSeat.characterId.find(actor.id) ||
    !!ctx.db.constructionPilotSeat.characterId.find(actor.id) ||
    ctx.db.station.shipId.find(actor.shipId)?.occupantId === actor.id
  );
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
export const isCyclingAirlock = (
  db: Pick<Db, "evaAirlockCycle">,
  characterId: string,
) => !!db.evaAirlockCycle.characterId.find(characterId);

function writeBody(ctx: Context, row: EvaRow) {
  const cell = cellOf(row.x, row.y);
  const next = { ...row, ...cell };
  if (ctx.db.evaBody.characterId.find(row.characterId))
    ctx.db.evaBody.characterId.update(next);
  else ctx.db.evaBody.insert(next);
}

function anchoredPose(
  body: EvaRow,
  ship: ShipPose,
  local: [number, number],
  localHeading: number,
) {
  const [x, y] = shipToWorld(ship, local);
  const [vx, vy] = pointVelocity(ship, [x, y]);
  return {
    x,
    y,
    vx,
    vy,
    heading: wrapAngle(ship.heading + localHeading),
    localX: local[0],
    localY: local[1],
    localHeading,
    refVx: vx,
    refVy: vy,
    refShipId: body.anchorShipId,
  };
}

// ------------------------------------------------------------------ reducers

/**
 * E at an exterior airlock: start (or cancel) a cycle. From the deck it cycles out; from space
 * (free or maglocked within reach of the hatch's outside point) it cycles in, if entry is allowed.
 */
export function cycleAirlock(
  ctx: Context,
  args: { shipId: string; airlockId: string },
) {
  const actor = actorOf(ctx);
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const running = ctx.db.evaAirlockCycle.characterId.find(actor.id);
  if (running) {
    if (running.shipId !== args.shipId || running.airlockId !== args.airlockId)
      throw new SenderError("Another airlock cycle is running");
    ctx.db.evaAirlockCycle.characterId.delete(actor.id);
    return;
  }
  const model = evaModelFor(ctx.db, args.shipId);
  const lock = model?.airlocks.find((a) => a.id === args.airlockId);
  if (!model || !lock) throw new SenderError("No exterior airlock there");
  const lockKey = args.shipId + "/" + lock.id;
  if (ctx.db.evaAirlockCycle.lockKey.find(lockKey))
    throw new SenderError("The airlock is cycling");
  const motion = ctx.db.shipWorldMotion.shipId.find(args.shipId);
  if (!motion) throw new SenderError("The ship is not in open space");
  const body = ctx.db.evaBody.characterId.find(actor.id);
  if (body) {
    // Cycle in: hold the body at the hatch; completion rechecks access.
    if (body.systemId !== motion.systemId)
      throw new SenderError("Too far from the airlock");
    const pose = poseOf(motion);
    const local =
      body.phase === "maglocked" && body.anchorShipId === args.shipId
        ? ([body.localX, body.localY] as [number, number])
        : worldToShip(pose, [body.x, body.y]);
    if (airlockFromOutside(model, local)?.id !== lock.id)
      throw new SenderError("Move closer to the airlock");
    if (
      !evaEntryAllowed(ctx, actor, args.shipId, {
        kind: "airlock",
        id: lock.id,
      })
    )
      throw new SenderError("The airlock does not open for you");
    writeBody(ctx, {
      ...body,
      returnEndsMicros: 0n,
      phase: "maglocked",
      anchorShipId: args.shipId,
      ...anchoredPose(
        { ...body, anchorShipId: args.shipId },
        pose,
        [lock.outside[0], lock.outside[1]],
        headingOf([-lock.normal[0], -lock.normal[1]]),
      ),
      forward: 0,
      strafe: 0,
      turn: 0,
      walking: false,
      revision: body.revision + 1n,
    });
    ctx.db.evaAirlockCycle.insert({
      characterId: actor.id,
      lockKey,
      owner: actor.owner,
      shipId: args.shipId,
      airlockId: lock.id,
      direction: "in",
      startedMicros: now,
      endsMicros: now + lock.cycleMicros,
    });
    clearAim(ctx, actor.id);
    zeroInput(ctx, actor.id);
    return;
  }
  // Cycle out: standing aboard this ship, at the hatch, with owned access.
  const location = ctx.db.constructionLocation.characterId.find(actor.id);
  if (
    !location ||
    location.instanceId !== args.shipId ||
    actor.shipId !== args.shipId
  )
    throw new SenderError("Board the ship first");
  if (seated(ctx, actor)) throw new SenderError("Stand up first");
  if (airlockFromInside(model, [actor.localX, actor.localY])?.id !== lock.id)
    throw new SenderError("Move closer to the airlock");
  const access = ownedDeckAccess(ctx, actor, args.shipId);
  if (!access || access.deck.id !== location.deckId)
    throw new SenderError("The airlock does not open for you");
  ctx.db.evaAirlockCycle.insert({
    characterId: actor.id,
    lockKey,
    owner: actor.owner,
    shipId: args.shipId,
    airlockId: lock.id,
    direction: "out",
    startedMicros: now,
    endsMicros: now + lock.cycleMicros,
  });
  clearAim(ctx, actor.id);
  zeroInput(ctx, actor.id);
  if (actor.sprinting)
    ctx.db.character.id.update({ ...actor, sprinting: false });
}

/** M: attach the maglock boots to the hull under the body, or detach them. */
export function toggleMaglock(ctx: Context) {
  const actor = actorOf(ctx);
  const body = ctx.db.evaBody.characterId.find(actor.id);
  if (!body) throw new SenderError("Only outside the ship");
  if (ctx.db.evaAirlockCycle.characterId.find(actor.id))
    throw new SenderError("The airlock is cycling");
  if (body.phase === "maglocked") {
    const motion = ctx.db.shipWorldMotion.shipId.find(body.anchorShipId);
    const v = motion
      ? pointVelocity(poseOf(motion), [body.x, body.y])
      : ([body.vx, body.vy] as [number, number]);
    writeBody(ctx, {
      ...body,
      phase: "free",
      anchorShipId: "",
      vx: v[0],
      vy: v[1],
      refShipId: motion ? body.anchorShipId : "",
      refVx: v[0],
      refVy: v[1],
      localX: 0,
      localY: 0,
      localHeading: 0,
      walking: false,
      revision: body.revision + 1n,
    });
    return;
  }
  let best:
    | { shipId: string; pose: ShipPose; local: [number, number]; d: number }
    | undefined;
  for (const { motion, model } of nearbyShips(
    ctx.db,
    body.systemId,
    body.x,
    body.y,
  )) {
    const pose = poseOf(motion);
    if (
      Math.hypot(body.x - pose.x, body.y - pose.y) >
      model.radiusM + EVA.maglockMarginM + 1
    )
      continue;
    const local = worldToShip(pose, [body.x, body.y]);
    const point = maglockPoint(model, local);
    if (!point) continue;
    const v = pointVelocity(pose, [body.x, body.y]);
    if (Math.hypot(body.vx - v[0], body.vy - v[1]) > EVA.maglockMaxRelSpeed)
      continue;
    const d = Math.hypot(point[0] - local[0], point[1] - local[1]);
    if (!best || d < best.d)
      best = { shipId: motion.shipId, pose, local: point, d };
  }
  if (!best) throw new SenderError("No hull within reach to lock on to");
  writeBody(ctx, {
    ...body,
    phase: "maglocked",
    anchorShipId: best.shipId,
    ...anchoredPose(
      { ...body, anchorShipId: best.shipId },
      best.pose,
      best.local,
      wrapAngle(body.heading - best.pose.heading),
    ),
    forward: 0,
    strafe: 0,
    turn: 0,
    walking: false,
    returnEndsMicros: 0n,
    revision: body.revision + 1n,
  });
  zeroInput(ctx, actor.id);
}

/** Start (or cancel) the rescue beacon when stranded far from the own ship. */
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

/** Stranded: the own ship is missing, in another system, or more than `EVA.strandedM` away. */
export function evaStranded(
  db: {
    shipWorldMotion: {
      shipId: {
        find(
          id: string,
        ): { x: number; y: number; systemId: string } | null | undefined;
      };
    };
  },
  actor: { shipId: string },
  body: Pick<EvaRow, "x" | "y" | "systemId">,
) {
  const own = actor.shipId
    ? db.shipWorldMotion.shipId.find(actor.shipId)
    : undefined;
  return (
    !own ||
    own.systemId !== body.systemId ||
    Math.hypot(own.x - body.x, own.y - body.y) > EVA.strandedM
  );
}

// ------------------------------------------------------------------ transitions

function completeExit(
  ctx: Context,
  actor: CharacterRow,
  cycle: CycleRow,
  lock: EvaAirlock,
  motion: MotionRow,
) {
  const pose = evaExitPose(poseOf(motion), lock);
  ctx.db.evaAirlockCycle.characterId.delete(cycle.characterId);
  const location = ctx.db.constructionLocation.characterId.find(actor.id);
  ctx.db.constructionLocation.characterId.delete(actor.id);
  const before = ctx.db.evaBody.characterId.find(actor.id);
  writeBody(ctx, {
    characterId: actor.id,
    owner: actor.owner,
    systemId: motion.systemId,
    cellX: 0n,
    cellY: 0n,
    phase: "free",
    x: pose.x,
    y: pose.y,
    vx: pose.vx,
    vy: pose.vy,
    heading: pose.heading,
    anchorShipId: "",
    localX: 0,
    localY: 0,
    localHeading: 0,
    refShipId: motion.shipId,
    refVx: pose.vx,
    refVy: pose.vy,
    forward: 0,
    strafe: 0,
    turn: 0,
    walking: false,
    exitShipId: motion.shipId,
    visitId: location?.visitId ?? "",
    deckId: location?.deckId ?? "",
    returnEndsMicros: 0n,
    serverTick: ctx.timestamp.microsSinceUnixEpoch / 50_000n,
    revision: (before?.revision ?? 0n) + 1n,
  });
  zeroInput(ctx, actor.id);
  if (actor.sprinting)
    ctx.db.character.id.update({ ...actor, sprinting: false });
  // The character no longer counts toward the ship's flight mass.
  markShipFlightDirty(ctx, motion.shipId);
}

/**
 * Put an EVA character back aboard `shipId` on its bound deck, standing as near `point` as a free
 * spot allows (rings of 0.75 m). Returns false (and changes nothing) without owned access or a
 * free spot.
 */
function placeAboard(
  ctx: Context,
  actor: CharacterRow,
  shipId: string,
  point: readonly [number, number],
) {
  const access = ownedDeckAccess(ctx, actor, shipId);
  if (!access) return false;
  const existing = ctx.db.constructionLocation.characterId.find(actor.id);
  const body = ctx.db.evaBody.characterId.find(actor.id);
  const location = {
    characterId: actor.id,
    // Returning to the ship left keeps its visit (the client keeps the loaded ship scene).
    visitId:
      body?.visitId && body.exitShipId === shipId && actor.shipId === shipId
        ? body.visitId
        : ctx.newUuidV4().toString(),
    instanceId: shipId,
    deckId: access.deck.id,
    returnShipId: "",
    returnX: 0,
    returnY: 0,
    revision: (existing?.revision ?? 0n) + 1n,
  };
  const spot = freeDeckSpot(
    ctx,
    { ...actor, shipId },
    access.instance,
    access.deck,
    location,
    point,
  );
  if (!spot) return false;
  ctx.db.evaBody.characterId.delete(actor.id);
  ctx.db.evaAirlockCycle.characterId.delete(actor.id);
  if (existing) ctx.db.constructionLocation.characterId.update(location);
  else ctx.db.constructionLocation.insert(location);
  commitFlightCharacter(
    ctx,
    {
      ...ctx.db.character.id.find(actor.id)!,
      shipId,
      localX: spot.x,
      localY: spot.y,
      sprinting: false,
    },
    (row) => ctx.db.character.id.update(row),
  );
  zeroInput(ctx, actor.id);
  return true;
}

/**
 * Respawn and emergency return: bring an EVA character back aboard their own ship at its trusted
 * spawn point (the ordinary respawn placement then refines the spot). No-op without owned access.
 */
export function evaReturnAboard(ctx: Context, characterId: string) {
  const actor = ctx.db.character.id.find(characterId);
  if (!actor?.shipId || !ctx.db.evaBody.characterId.find(characterId))
    return false;
  const instance = ctx.db.constructionInstance.id.find(actor.shipId);
  if (!instance) return false;
  return placeAboard(ctx, actor, actor.shipId, [
    instance.spawnX,
    instance.spawnY,
  ]);
}

function completeEntry(
  ctx: Context,
  actor: CharacterRow,
  cycle: CycleRow,
  lock: EvaAirlock,
) {
  if (
    !evaEntryAllowed(ctx, actor, cycle.shipId, {
      kind: "airlock",
      id: lock.id,
    }) ||
    !placeAboard(ctx, actor, cycle.shipId, lock.inside)
  )
    // Denied or no room: the hatch stays shut and the body stays held outside it.
    ctx.db.evaAirlockCycle.characterId.delete(cycle.characterId);
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

function stepCycles(ctx: Context) {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const cycles: CycleRow[] = [];
  for (const cycle of ctx.db.evaAirlockCycle.iter()) {
    if (cycles.length >= CYCLES_PER_TICK) break;
    cycles.push(cycle);
  }
  for (const cycle of cycles) {
    const actor = ctx.db.character.id.find(cycle.characterId);
    const model = evaModelFor(ctx.db, cycle.shipId);
    const lock = model?.airlocks.find((a) => a.id === cycle.airlockId);
    const motion = ctx.db.shipWorldMotion.shipId.find(cycle.shipId);
    if (!actor || !lock || !motion || isDead(ctx, actor.id)) {
      ctx.db.evaAirlockCycle.characterId.delete(cycle.characterId);
      continue;
    }
    if (cycle.direction === "out") {
      // Recheck at consumption: connected and authenticated, standing aboard at the hatch, access.
      const location = ctx.db.constructionLocation.characterId.find(actor.id);
      const valid =
        actor.connected &&
        auth.canConsume(ctx, actor.owner) &&
        !!location &&
        location.instanceId === cycle.shipId &&
        actor.shipId === cycle.shipId &&
        !seated(ctx, actor) &&
        !ctx.db.evaBody.characterId.find(actor.id) &&
        airlockFromInside(model!, [actor.localX, actor.localY])?.id ===
          lock.id &&
        !!ownedDeckAccess(ctx, actor, cycle.shipId);
      if (!valid) ctx.db.evaAirlockCycle.characterId.delete(cycle.characterId);
      else if (now >= cycle.endsMicros)
        completeExit(ctx, actor, cycle, lock, motion);
    } else {
      // Cycling in completes even while disconnected (safer aboard); the body must still be held.
      const body = ctx.db.evaBody.characterId.find(actor.id);
      if (
        !body ||
        body.phase !== "maglocked" ||
        body.anchorShipId !== cycle.shipId
      )
        ctx.db.evaAirlockCycle.characterId.delete(cycle.characterId);
      else if (now >= cycle.endsMicros) completeEntry(ctx, actor, cycle, lock);
    }
  }
}

function stepBody(ctx: Context, body: EvaRow, tick: bigint) {
  const actor = ctx.db.character.id.find(body.characterId);
  if (!actor) {
    ctx.db.evaBody.characterId.delete(body.characterId);
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
  const cycling = ctx.db.evaAirlockCycle.characterId.find(actor.id);
  const command = cycling ? undefined : freshInput(ctx, actor);
  if (body.phase === "maglocked") {
    const motion = ctx.db.shipWorldMotion.shipId.find(body.anchorShipId);
    const model = motion && evaModelFor(ctx.db, body.anchorShipId);
    if (!motion || !model || motion.systemId !== body.systemId) {
      // The hull went away: float free where the body was.
      writeBody(ctx, {
        ...body,
        phase: "free",
        anchorShipId: "",
        refShipId: "",
        localX: 0,
        localY: 0,
        localHeading: 0,
        walking: false,
        serverTick: tick,
        revision: body.revision + 1n,
      });
      return;
    }
    let local: [number, number] = [body.localX, body.localY];
    let localHeading = body.localHeading;
    let walking = false;
    if (command && (command.dx || command.dy)) {
      const next = stepMaglockWalk(model, local, [command.dx, command.dy]);
      walking = next[0] !== local[0] || next[1] !== local[1];
      if (walking) localHeading = headingOf([command.dx, command.dy]);
      local = next;
    }
    const pose = anchoredPose(body, poseOf(motion), local, localHeading);
    const next = {
      ...body,
      ...pose,
      forward: 0,
      strafe: 0,
      turn: 0,
      walking,
      serverTick: tick,
    };
    if (
      next.x !== body.x ||
      next.y !== body.y ||
      next.heading !== body.heading ||
      next.walking !== body.walking ||
      next.vx !== body.vx ||
      next.vy !== body.vy ||
      next.returnEndsMicros !== body.returnEndsMicros
    )
      writeBody(ctx, next);
    return;
  }
  // Free flight: thrust from the input row, stabiliser reference from the nearest captured hull.
  const input = {
    forward: command?.throttle ?? 0,
    strafe: command?.dx ?? 0,
    turn: command?.turn ?? 0,
  };
  const candidates: EvaReferenceCandidate[] = nearbyShips(
    ctx.db,
    body.systemId,
    body.x,
    body.y,
  ).map(({ motion, model }) => ({
    id: motion.shipId,
    pose: poseOf(motion),
    radiusM: model.radiusM,
  }));
  const ref = evaReference(candidates, [body.x, body.y]);
  const vRef: [number, number] = ref ? ref.velocity : [body.refVx, body.refVy];
  const previous: [number, number] =
    ref && ref.shipId === body.refShipId ? [body.refVx, body.refVy] : vRef;
  const state = stepEvaFree(body, input, vRef, EVA.tickSeconds, previous);
  const next = {
    ...body,
    ...state,
    refShipId: ref?.shipId ?? "",
    refVx: vRef[0],
    refVy: vRef[1],
    forward: input.forward,
    strafe: input.strafe,
    turn: input.turn,
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
}

/** Scheduled step (20 Hz, after the shared world stepped ships): cycles, then bodies. */
export function stepEva(ctx: Context) {
  stepCycles(ctx);
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

// ------------------------------------------------------------------ combat

/** Beam of an EVA shooter in the world frame: stops at the first other EVA body (free or
 * maglocked, connected, alive). Hulls do not stop it (the EVA layer passes over hulls). */
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
  /** Maglocked or held at a hatch: the hull and the ship-local point; empty/0 while free. */
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
 * else the viewer's ship. Columns exclude health numbers, inventory UUIDs, cycle timers and the
 * stabiliser reference.
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
      const anchored = body.phase === "maglocked";
      out.push({
        characterId: body.characterId,
        name: character.name,
        systemId: body.systemId,
        phase: body.phase,
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
        cycling: !!ctx.db.evaAirlockCycle.characterId.find(body.characterId),
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
