import {
  SenderError,
  t,
  type ReducerCtx,
  type ViewCtx,
  type InferSchema,
} from "spacetimedb/server";
import type world from "./index";
import {
  LAB_WEAPONS,
  weaponMode,
  type WeaponDefinition,
} from "../../content/src/weapons";
import {
  normalizedAim,
  aimIsFresh,
  recoveredEnergy,
  validateShot,
  pelletAngles,
  throwLanding,
  reloadUntil,
  blastDamage,
} from "../../sim/src/combat";
import { resolveShotImpact, type ShotHit } from "./combat-impact";
import { itemDefinitions, registryReader } from "./item-definitions";
import { resolveWeaponDefinition } from "@sidereal/sim/pinned-definitions";
import {
  applyShotDamage,
  damageCharacter,
  isDead,
  type AppliedDamage,
} from "./combat-damage";
import { resolveEvaShot } from "./eva";
type Context = ReducerCtx<InferSchema<typeof world>>;
type ReadContext = Pick<ViewCtx<InferSchema<typeof world>>, "db" | "sender">;
function actorFor(ctx: ReadContext) {
  return [...ctx.db.character.by_owner.filter(ctx.sender)][0];
}
function available(
  ctx: ReadContext,
  actor: NonNullable<ReturnType<typeof actorFor>>,
) {
  return (
    actor.connected &&
    !isDead(ctx, actor.id) &&
    // Cycling an airlock (either way) is not a firing position.
    !ctx.db.evaAirlockCycle.characterId.find(actor.id) &&
    !ctx.db.couchSeat.characterId.find(actor.id) &&
    ctx.db.station.shipId.find(actor.shipId)?.occupantId !== actor.id
  );
}
/** Stunned characters cannot aim or fire (stun gun, baton). Views have no clock: reducers only. */
export function isStunned(
  ctx: Pick<ReadContext, "db">,
  characterId: string,
  now: bigint,
) {
  const row = ctx.db.combatAction.characterId.find(characterId);
  return !!row && row.stunnedUntilMicros > now;
}
export function clearAim(ctx: Context, characterId: string) {
  const aim = ctx.db.combatAim.characterId.find(characterId);
  if (aim?.active)
    ctx.db.combatAim.characterId.update({ ...aim, active: false });
}
export function setAim(ctx: Context, args: { active: boolean; angle: number }) {
  const actor = actorFor(ctx);
  if (!actor?.connected) throw new SenderError("Character unavailable");
  let angle: number;
  try {
    angle = normalizedAim(args.angle);
  } catch {
    throw new SenderError("Invalid aim angle");
  }
  if (args.active && isDead(ctx, actor.id))
    throw new SenderError("You are dead");
  if (args.active && !available(ctx, actor))
    throw new SenderError("Stand up before aiming");
  if (
    args.active &&
    isStunned(ctx, actor.id, ctx.timestamp.microsSinceUnixEpoch)
  )
    throw new SenderError("You are stunned");
  const row = {
    characterId: actor.id,
    active: args.active,
    angle,
    updatedMicros: ctx.timestamp.microsSinceUnixEpoch,
  };
  if (ctx.db.combatAim.characterId.find(actor.id))
    ctx.db.combatAim.characterId.update(row);
  else ctx.db.combatAim.insert(row);
}
export const combatProjection = t.row("CombatStatus", {
  characterId: t.string().primaryKey(),
  aimActive: t.bool(),
  aimAngle: t.f64(),
  weaponItemId: t.string(),
  weaponDefinitionId: t.string(),
  energy: t.f64(),
  capacity: t.f64(),
  shotCost: t.f64(),
  cooldownMs: t.u32(),
  rangeMeters: t.f64(),
  revision: t.u64(),
  shotSequence: t.u64(),
  lastShotAngle: t.f64(),
});
export function combatView(ctx: ReadContext) {
  const actor = actorFor(ctx);
  if (!actor?.connected) return [];
  const aim = ctx.db.combatAim.characterId.find(actor.id),
    item = [...ctx.db.inventoryItem.by_character.filter(actor.id)].find(
      (i) => i.equipmentSlot === "hand",
    ),
    definition = item && itemDefinitions(ctx).weapon(item),
    energy = item && ctx.db.weaponEnergy.itemId.find(item.id);
  return [
    {
      characterId: actor.id,
      aimActive: !!aim?.active && available(ctx, actor),
      aimAngle: aim?.angle ?? 0,
      weaponItemId: definition ? item!.id : "",
      weaponDefinitionId: definition ? item!.definitionId : "",
      energy: definition ? (energy?.energy ?? definition.capacity) : 0,
      capacity: definition?.capacity ?? 0,
      shotCost: definition?.shotCost ?? 0,
      cooldownMs: definition?.cooldownMs ?? 0,
      rangeMeters: definition?.rangeMeters ?? 0,
      revision: energy?.revision ?? 0n,
      shotSequence: energy?.shotSequence ?? 0n,
      lastShotAngle: energy?.lastShotAngle ?? 0,
    },
  ];
}

type Actor = NonNullable<ReturnType<typeof actorFor>>;
type WeaponArgs = {
  itemId: string;
  expectedRevision: bigint;
  operationId: string;
};

/** Shared intent checks of fire/reload: alive, standing, the item in hand is a weapon, a fresh
 * operation id (a replay of the same request is a no-op, returning undefined). */
function weaponIntent(ctx: Context, args: WeaponArgs, kind: string) {
  const actor = actorFor(ctx);
  if (actor && isDead(ctx, actor.id)) throw new SenderError("You are dead");
  if (!actor || !available(ctx, actor))
    throw new SenderError("Stand on deck before firing");
  const defs = itemDefinitions(ctx);
  const item = ctx.db.inventoryItem.id.find(args.itemId),
    definition = item && defs.weapon(item);
  if (
    !item ||
    item.characterId !== actor.id ||
    item.equipmentSlot !== "hand" ||
    !definition
  )
    throw new SenderError("Equip a supported weapon");
  if (!/^[A-Za-z0-9_-]{1,96}$/.test(args.operationId))
    throw new SenderError("Invalid operation ID");
  const request = JSON.stringify({
      ...(kind === "fire" ? {} : { kind }),
      ...args,
      expectedRevision: args.expectedRevision.toString(),
    }),
    id = actor.id + ":" + args.operationId,
    previous = ctx.db.combatReceipt.id.find(id);
  if (previous) {
    if (previous.request !== request)
      throw new SenderError("Operation ID already used");
    return undefined;
  }
  const now = ctx.timestamp.microsSinceUnixEpoch;
  if (isStunned(ctx, actor.id, now)) throw new SenderError("You are stunned");
  const old = ctx.db.weaponEnergy.itemId.find(item.id);
  if ((old?.revision ?? 0n) !== args.expectedRevision)
    throw new SenderError("Weapon revision conflict");
  const action = ctx.db.combatAction.characterId.find(actor.id);
  if (action?.reloadItemId === item.id && action.reloadUntilMicros > now)
    throw new SenderError("Reloading");
  const energy = old
    ? recoveredEnergy(
        old.energy,
        definition.capacity,
        old.checkpointMicros,
        old.lastShotMicros,
        now,
      )
    : definition.capacity;
  return {
    actor,
    item,
    definition,
    weaponRevision: defs.pin(item).weaponRevision,
    old,
    energy,
    now,
    id,
    request,
  };
}

function receipt(
  ctx: Context,
  actor: Actor,
  id: string,
  request: string,
  now: bigint,
) {
  const receipts = [...ctx.db.combatReceipt.by_character.filter(actor.id)].sort(
    (a, b) => (a.createdMicros < b.createdMicros ? -1 : 1),
  );
  while (receipts.length >= 128)
    ctx.db.combatReceipt.id.delete(receipts.shift()!.id);
  ctx.db.combatReceipt.insert({
    id,
    characterId: actor.id,
    request,
    createdMicros: now,
  });
}

type EvaBodyRow = NonNullable<
  ReturnType<Context["db"]["evaBody"]["characterId"]["find"]>
>;
type CombatActionRow = NonNullable<
  ReturnType<Context["db"]["combatAction"]["characterId"]["find"]>
>;
function emptyAction(characterId: string): CombatActionRow {
  return {
    characterId,
    shipId: "",
    deckId: "",
    definitionId: "",
    mode: "",
    shotSequence: 0n,
    shotMicros: 0n,
    originX: 0,
    originY: 0,
    pointsJson: "[]",
    landX: 0,
    landY: 0,
    detonateMicros: 0n,
    detonated: false,
    blastRadiusM: 0,
    reloadSequence: 0n,
    reloadItemId: "",
    reloadUntilMicros: 0n,
    stunnedUntilMicros: 0n,
    stunSequence: 0n,
  };
}
function writeAction(
  ctx: Context,
  characterId: string,
  patch: (row: CombatActionRow) => CombatActionRow,
) {
  const old = ctx.db.combatAction.characterId.find(characterId);
  const next = patch(old ?? emptyAction(characterId));
  if (old) ctx.db.combatAction.characterId.update(next);
  else ctx.db.combatAction.insert(next);
}

/** Stun a struck character: no aiming or firing until the stun ends; their aim drops now. */
function stun(ctx: Context, characterId: string, stunMs: number, now: bigint) {
  if (!(stunMs > 0) || isDead(ctx, characterId)) return;
  const until = now + BigInt(Math.round(stunMs)) * 1000n;
  writeAction(ctx, characterId, (row) => ({
    ...row,
    stunnedUntilMicros:
      row.stunnedUntilMicros > until ? row.stunnedUntilMicros : until,
    stunSequence: row.stunSequence + 1n,
  }));
  clearAim(ctx, characterId);
}

const merge = (a: AppliedDamage, b: AppliedDamage): AppliedDamage => ({
  damage: a.damage + b.damage,
  targetState: b.targetState || a.targetState,
  targetHp: b.targetMaxHp ? b.targetHp : a.targetHp,
  targetMaxHp: b.targetMaxHp || a.targetMaxHp,
});
const NO_DAMAGE: AppliedDamage = {
  damage: 0,
  targetState: "",
  targetHp: 0,
  targetMaxHp: 0,
};
const round6 = (n: number) => Math.round(n * 1e6) / 1e6 + 0;

/** Resolve the rays of an accepted shot (beam, melee reach or pellets) with the same authoritative
 * hit resolution as every handheld shot, apply damage (friendly fire on) and any stun. */
function resolveRays(
  ctx: Context,
  actor: Actor,
  definition: WeaponDefinition,
  angle: number,
  now: bigint,
  evaBody: EvaBodyRow | null | undefined,
  causationId: string,
) {
  const angles =
    weaponMode(definition) === "pellets"
      ? pelletAngles(angle, definition.pellets ?? 1, definition.spreadRad ?? 0)
      : [angle];
  const hits: ShotHit[] = [];
  let applied = NO_DAMAGE;
  for (const a of angles) {
    // EVA shooters fire in the world frame: the ray stops at the first other EVA body.
    const hit: ShotHit = evaBody
      ? resolveEvaShot(ctx, evaBody, a, definition.rangeMeters)
      : resolveShotImpact(ctx, actor, a, definition.rangeMeters);
    hits.push(hit);
    applied = merge(
      applied,
      applyShotDamage(ctx, actor, hit, definition.damage, {
        causationId,
        actorId: actor.id,
      }),
    );
    if (hit.kind === "character" && definition.stunMs)
      stun(ctx, hit.targetId, definition.stunMs, now);
  }
  // The impact row reports the ray nearest the aim (the middle pellet).
  const main = hits[Math.floor((hits.length - 1) / 2)];
  return { hits, main, applied };
}

export function fire(ctx: Context, args: WeaponArgs) {
  const intent = weaponIntent(ctx, args, "fire");
  if (!intent) return;
  const {
    actor,
    item,
    definition,
    weaponRevision,
    old,
    energy,
    now,
    id,
    request,
  } = intent;
  const aim = ctx.db.combatAim.characterId.find(actor.id);
  if (!aim || !aimIsFresh(aim.active, aim.updatedMicros, now))
    throw new SenderError("Aim intent expired");
  const evaBody = ctx.db.evaBody.characterId.find(actor.id);
  // A thrown charge lands and detonates on a deck; space has no deck to land on yet.
  if (evaBody && weaponMode(definition) === "thrown")
    throw new SenderError("Nothing to throw at in EVA");
  try {
    validateShot(
      energy,
      definition.shotCost,
      definition.cooldownMs,
      old?.lastShotMicros ?? 0n,
      now,
      !!old?.shotSequence,
    );
  } catch (error) {
    throw new SenderError((error as Error).message);
  }
  const row = {
    itemId: item.id,
    energy: energy - definition.shotCost,
    checkpointMicros: now,
    lastShotMicros: now,
    revision: (old?.revision ?? 0n) + 1n,
    shotSequence: (old?.shotSequence ?? 0n) + 1n,
    lastShotAngle: aim.angle,
  };
  if (old) ctx.db.weaponEnergy.itemId.update(row);
  else ctx.db.weaponEnergy.insert(row);
  const mode = weaponMode(definition);
  const deckId =
    ctx.db.constructionLocation.characterId.find(actor.id)?.deckId ?? "";
  let point: [number, number],
    kind: string,
    distanceM: number,
    targetId: string;
  let applied = NO_DAMAGE;
  let points: [number, number, number][];
  let landing: { x: number; y: number } | undefined;
  if (mode === "thrown") {
    // Lands at the first obstacle (body or structure) along the aim, detonates after the fuse.
    const hit = resolveShotImpact(
      ctx,
      actor,
      aim.angle,
      definition.rangeMeters,
    );
    const land = throwLanding(
      [actor.localX, actor.localY],
      aim.angle,
      hit.distanceM,
      hit.kind !== "none",
    );
    landing = { x: round6(land.x), y: round6(land.y) };
    point = [landing.x, landing.y];
    kind = "thrown";
    distanceM = round6(land.distanceM);
    targetId = "";
    points = [[landing.x, landing.y, 0]];
  } else {
    const rays = resolveRays(
      ctx,
      actor,
      definition,
      aim.angle,
      now,
      evaBody,
      id,
    );
    applied = rays.applied;
    point = rays.main.point;
    kind = rays.main.kind;
    distanceM = rays.main.distanceM;
    // The other ship's identity is not disclosed through the shooter's impact row.
    // Nor another character's id: a crewmate hit reports only the damage dealt.
    targetId =
      rays.main.kind === "ship" || rays.main.kind === "character"
        ? ""
        : rays.main.targetId;
    points = rays.hits.map((h) => [
      h.point[0],
      h.point[1],
      h.kind === "none" ? 0 : 1,
    ]);
  }
  const impact = {
    characterId: actor.id,
    itemId: item.id,
    shotSequence: row.shotSequence,
    shipId: evaBody ? "" : actor.shipId,
    x: point[0],
    y: point[1],
    distanceM,
    kind,
    targetId,
    createdMicros: now,
    ...applied,
  };
  if (ctx.db.combatImpact.characterId.find(actor.id))
    ctx.db.combatImpact.characterId.update(impact);
  else ctx.db.combatImpact.insert(impact);
  writeAction(ctx, actor.id, (action) => ({
    ...action,
    // EVA shots are in the world frame; decks never draw them.
    shipId: evaBody ? "" : actor.shipId,
    deckId,
    definitionId: item.definitionId,
    mode,
    shotSequence: row.shotSequence,
    shotMicros: now,
    originX: actor.localX,
    originY: actor.localY,
    pointsJson: JSON.stringify(points),
    landX: landing?.x ?? 0,
    landY: landing?.y ?? 0,
    detonateMicros: landing
      ? now + BigInt(Math.round(definition.fuseMs ?? 0)) * 1000n
      : 0n,
    detonated: false,
    blastRadiusM: landing ? (definition.blastRadiusM ?? 0) : 0,
  }));
  const actionPin = {
    characterId: actor.id,
    definitionId: item.definitionId,
    weaponRevision,
  };
  if (ctx.db.combatActionPin.characterId.find(actor.id))
    ctx.db.combatActionPin.characterId.update(actionPin);
  else ctx.db.combatActionPin.insert(actionPin);
  receipt(ctx, actor, id, request, now);
}

/** Manual reload: refills the equipped weapon to capacity after its reload time (a cell or
 * magazine swap); firing is refused meanwhile. Weapons without `reloadMs` cannot reload. */
export function reload(ctx: Context, args: WeaponArgs) {
  const intent = weaponIntent(ctx, args, "reload");
  if (!intent) return;
  const { actor, item, definition, old, energy, now, id, request } = intent;
  if (!definition.reloadMs) throw new SenderError("This weapon has no reload");
  if (energy >= definition.capacity) throw new SenderError("Weapon is full");
  const until = reloadUntil(now, definition.reloadMs);
  const row = {
    itemId: item.id,
    // Full once the reload completes; passive recovery restarts from `until`.
    energy: definition.capacity,
    checkpointMicros: until,
    lastShotMicros: old?.lastShotMicros ?? 0n,
    revision: (old?.revision ?? 0n) + 1n,
    shotSequence: old?.shotSequence ?? 0n,
    lastShotAngle: old?.lastShotAngle ?? 0,
  };
  if (old) ctx.db.weaponEnergy.itemId.update(row);
  else ctx.db.weaponEnergy.insert(row);
  writeAction(ctx, actor.id, (action) => ({
    ...action,
    shipId: actor.shipId,
    definitionId: item.definitionId,
    reloadSequence: action.reloadSequence + 1n,
    reloadItemId: item.id,
    reloadUntilMicros: until,
  }));
  receipt(ctx, actor, id, request, now);
}

/** Resolve a thrown charge whose fuse has run out: every standing body on its deck within the blast
 * radius, not shielded by structure, takes falloff damage (friendly fire on, the thrower included). */
function detonate(ctx: Context, action: CombatActionRow) {
  // The rules the charge was thrown with (X-2 pin), not the item's current state.
  const pin = ctx.db.combatActionPin.characterId.find(action.characterId);
  const definition =
    pin && pin.definitionId === action.definitionId
      ? resolveWeaponDefinition(
          registryReader(ctx.db),
          pin.definitionId,
          pin.weaponRevision,
        )
      : LAB_WEAPONS[action.definitionId];
  const thrower = ctx.db.character.id.find(action.characterId);
  writeAction(ctx, action.characterId, (row) => ({ ...row, detonated: true }));
  if (!definition || !(action.blastRadiusM > 0)) return;
  let total = NO_DAMAGE;
  let count = 0;
  for (const body of ctx.db.character.by_ship.filter(action.shipId)) {
    if (++count > 256) break;
    if (!body.connected || isDead(ctx, body.id)) continue;
    if (
      ctx.db.constructionTraversal.characterId.find(body.id) ||
      ctx.db.constructionStairWalk.characterId.find(body.id)
    )
      continue;
    const location = ctx.db.constructionLocation.characterId.find(body.id);
    if ((location?.deckId ?? "") !== action.deckId) continue;
    const dx = body.localX - action.landX,
      dy = body.localY - action.landY,
      d = Math.hypot(dx, dy);
    const damage = blastDamage(
      definition.damage,
      d,
      action.blastRadiusM,
      definition.blastEdgeFraction ?? 1,
    );
    if (!(damage > 0)) continue;
    // Structure between the blast and the body shields it (the same beam model as a shot).
    if (thrower && d > 0.05) {
      const toward = Math.atan2(dx, dy);
      const hit = resolveShotImpact(
        ctx,
        {
          id: thrower.id,
          shipId: action.shipId,
          localX: action.landX,
          localY: action.landY,
        },
        toward,
        d,
      );
      if (
        hit.kind !== "none" &&
        hit.kind !== "character" &&
        hit.distanceM < d - 0.35
      )
        continue;
    }
    total = merge(
      total,
      damageCharacter(ctx, body.id, damage, {
        causationId: `blast:${action.characterId}:${action.shotSequence}`,
        actorId: action.characterId,
      }),
    );
  }
  const impact = ctx.db.combatImpact.characterId.find(action.characterId);
  if (impact && impact.shotSequence === action.shotSequence)
    ctx.db.combatImpact.characterId.update({
      ...impact,
      kind: "blast",
      damage: total.damage,
      targetState: total.targetState,
      targetHp: 0,
      targetMaxHp: 0,
    });
}

export const impactProjection = t.row("CombatImpactStatus", {
  characterId: t.string().primaryKey(),
  itemId: t.string(),
  shotSequence: t.u64(),
  shipId: t.string(),
  x: t.f64(),
  y: t.f64(),
  distanceM: t.f64(),
  kind: t.string(),
  targetId: t.string(),
  damage: t.f64(),
  targetState: t.string(),
  targetHp: t.f64(),
  targetMaxHp: t.f64(),
});
/** The actor's own latest shot end point, only while still aboard the ship it was fired on. */
export function impactView(ctx: ReadContext) {
  const actor = actorFor(ctx);
  if (!actor?.connected) return [];
  const row = ctx.db.combatImpact.characterId.find(actor.id);
  // Aboard: only shots fired on this ship. In EVA: only shots fired in space (world frame).
  const inEva = !!ctx.db.evaBody.characterId.find(actor.id);
  if (!row || row.shipId !== (inEva ? "" : actor.shipId)) return [];
  return [
    {
      characterId: row.characterId,
      itemId: row.itemId,
      shotSequence: row.shotSequence,
      shipId: row.shipId,
      x: row.x,
      y: row.y,
      distanceM: row.distanceM,
      kind: row.kind,
      targetId: row.targetId,
      damage: row.damage,
      targetState: row.targetState,
      targetHp: row.targetHp,
      targetMaxHp: row.targetMaxHp,
    },
  ];
}
/** Effective energy is projected at <=4Hz. Passive recovery never changes action CAS revision.
 * Thrown charges detonate here once their fuse has run out. */
export function stepCombat(ctx: Context) {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  for (const aim of ctx.db.combatAim.iter()) {
    const actor = ctx.db.character.id.find(aim.characterId);
    if (
      aim.active &&
      (!actor ||
        !available(ctx, actor) ||
        isStunned(ctx, aim.characterId, now) ||
        !aimIsFresh(true, aim.updatedMicros, now))
    )
      clearAim(ctx, aim.characterId);
  }
  const defs = itemDefinitions(ctx);
  for (const old of ctx.db.weaponEnergy.iter()) {
    if (now - old.checkpointMicros < 250_000n) continue;
    const item = ctx.db.inventoryItem.id.find(old.itemId),
      definition = item && defs.weapon(item);
    if (!definition || old.energy >= definition.capacity) continue;
    const energy = recoveredEnergy(
      old.energy,
      definition.capacity,
      old.checkpointMicros,
      old.lastShotMicros,
      now,
    );
    if (energy !== old.energy)
      ctx.db.weaponEnergy.itemId.update({
        ...old,
        energy,
        checkpointMicros: now,
      });
  }
  // Collect first: detonation writes combat_action rows.
  const due: CombatActionRow[] = [];
  let scanned = 0;
  for (const action of ctx.db.combatAction.iter()) {
    if (++scanned > 4096) break;
    if (
      action.detonateMicros > 0n &&
      !action.detonated &&
      now >= action.detonateMicros
    )
      due.push(action);
  }
  for (const action of due) detonate(ctx, action);
}

export const combatActionProjection = t.row("CombatActionStatus", {
  characterId: t.string().primaryKey(),
  shipId: t.string(),
  deckId: t.string(),
  definitionId: t.string(),
  mode: t.string(),
  shotSequence: t.u64(),
  shotMicros: t.u64(),
  originX: t.f64(),
  originY: t.f64(),
  pointsJson: t.string(),
  landX: t.f64(),
  landY: t.f64(),
  detonateMicros: t.u64(),
  detonated: t.bool(),
  blastRadiusM: t.f64(),
  reloadSequence: t.u64(),
  reloadUntilMicros: t.u64(),
  stunnedUntilMicros: t.u64(),
  stunSequence: t.u64(),
});
/**
 * Latest combat action of every body on the viewer's own current deck, the viewer included (the
 * same relation as `current_interior_crew`): weapon catalogue id and mode, ray end points, a thrown
 * charge's landing and detonation, reload and stun timing. It carries no item UUIDs, energy, damage
 * or target identities, and only actions taken aboard the viewer's ship.
 */
export function visibleCombatActions(
  ctx: ReadContext,
  visible:
    | {
        actor: { id: string };
        bodies: readonly { body: { id: string; shipId: string } }[];
      }
    | undefined,
) {
  if (!visible) return [];
  const out = [];
  for (const { body } of visible.bodies) {
    const row = ctx.db.combatAction.characterId.find(body.id);
    if (!row) continue;
    const here = row.shipId === body.shipId;
    // Never the reloaded item's UUID: the view carries catalogue ids only.
    const { reloadItemId: _reloadItemId, ...visibleRow } = row;
    out.push({
      ...visibleRow,
      shipId: body.shipId,
      // Shots taken aboard another ship are not in this deck's frame.
      shotSequence: here ? row.shotSequence : 0n,
      pointsJson: here ? row.pointsJson : "[]",
      detonateMicros: here ? row.detonateMicros : 0n,
    });
  }
  return out;
}
