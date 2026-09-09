import {
  SenderError,
  t,
  type ReducerCtx,
  type ViewCtx,
  type InferSchema,
} from "spacetimedb/server";
import type world from "./index";
import { LAB_WEAPONS } from "../../content/src/weapons";
import {
  normalizedAim,
  aimIsFresh,
  recoveredEnergy,
  validateShot,
} from "../../sim/src/combat";
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
    !ctx.db.couchSeat.characterId.find(actor.id) &&
    ctx.db.station.shipId.find(actor.shipId)?.occupantId !== actor.id
  );
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
  if (args.active && !available(ctx, actor))
    throw new SenderError("Stand up before aiming");
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
    definition = item && LAB_WEAPONS[item.definitionId],
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
export function fire(
  ctx: Context,
  args: { itemId: string; expectedRevision: bigint; operationId: string },
) {
  const actor = actorFor(ctx);
  if (!actor || !available(ctx, actor))
    throw new SenderError("Stand on deck before firing");
  const item = ctx.db.inventoryItem.id.find(args.itemId),
    definition = item && LAB_WEAPONS[item.definitionId];
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
      ...args,
      expectedRevision: args.expectedRevision.toString(),
    }),
    id = actor.id + ":" + args.operationId,
    previous = ctx.db.combatReceipt.id.find(id);
  if (previous) {
    if (previous.request !== request)
      throw new SenderError("Operation ID already used");
    return;
  }
  const now = ctx.timestamp.microsSinceUnixEpoch,
    aim = ctx.db.combatAim.characterId.find(actor.id);
  if (!aim || !aimIsFresh(aim.active, aim.updatedMicros, now))
    throw new SenderError("Aim intent expired");
  const old = ctx.db.weaponEnergy.itemId.find(item.id);
  if ((old?.revision ?? 0n) !== args.expectedRevision)
    throw new SenderError("Weapon revision conflict");
  const energy = old
    ? recoveredEnergy(
        old.energy,
        definition.capacity,
        old.checkpointMicros,
        old.lastShotMicros,
        now,
      )
    : definition.capacity;
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
/** Effective energy is projected at <=4Hz. Passive recovery never changes action CAS revision. */
export function stepCombat(ctx: Context) {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  for (const aim of ctx.db.combatAim.iter()) {
    const actor = ctx.db.character.id.find(aim.characterId);
    if (
      aim.active &&
      (!actor ||
        !available(ctx, actor) ||
        !aimIsFresh(true, aim.updatedMicros, now))
    )
      clearAim(ctx, aim.characterId);
  }
  for (const old of ctx.db.weaponEnergy.iter()) {
    if (now - old.checkpointMicros < 250_000n) continue;
    const item = ctx.db.inventoryItem.id.find(old.itemId),
      definition = item && LAB_WEAPONS[item.definitionId];
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
}
