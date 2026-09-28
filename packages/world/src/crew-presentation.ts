import { t, type InferSchema, type ViewCtx } from "spacetimedb/server";
import type world from "./index";
import { INVENTORY_DEFINITIONS } from "@sidereal/content/inventory";
import { visibleInteriorBodies } from "./construction-passenger-views";
type Context = Pick<ViewCtx<InferSchema<typeof world>>, "db" | "sender">;

/**
 * What a crewmate needs to draw another character's body: looks, visible equipment, pose state and
 * the end of that character's latest accepted shot. Deliberately absent: account identity, item and
 * container UUIDs, carried or stored inventory, health numbers, weapon energy, damage dealt and hit
 * targets. Position, elevation, sprint and name stay in `current_interior_crew`, so a moving body
 * does not resend this row.
 */
export const crewPresentationProjection = t.row("CrewPresentation", {
  characterId: t.string().primaryKey(),
  shipId: t.string(),
  deckId: t.string(),
  /** The server-validated cosmetic appearance document (enumerated fields and palette colours). */
  appearanceJson: t.string(),
  /** Equipped visual slots as `{ slot: definitionId }`; catalogue ids only, never item UUIDs. */
  equipmentJson: t.string(),
  dead: t.bool(),
  seated: t.bool(),
  aimActive: t.bool(),
  /** Same convention as `own_combat.aim_angle`; 0 while not aiming. */
  aimAngle: t.f64(),
  /** Accepted shots so far with the current weapon (0 = none seen); a change plays one shot. */
  shotSequence: t.u64(),
  /** Ship-local end point of the latest accepted shot (metres, same frame as `local_x/local_y`). */
  shotX: t.f64(),
  shotY: t.f64(),
  /** The latest shot stopped at something (wall, body, hull ...) rather than running out of range. */
  shotStruck: t.bool(),
});

/** Equipped slot -> catalogue id for items whose definition belongs in that slot. */
export function visibleEquipment(
  items: Iterable<{ definitionId: string; equipmentSlot: string }>,
) {
  const out: Record<string, string> = {};
  for (const item of items) {
    if (!item.equipmentSlot) continue;
    const definition = INVENTORY_DEFINITIONS.find(
      (d) => d.id === item.definitionId,
    );
    if (definition?.equipSlot === item.equipmentSlot)
      out[item.equipmentSlot] = definition.id;
  }
  return out;
}

/**
 * Other characters on the viewer's own current deck (the same relation as `current_interior_crew`:
 * owned or accepted-passenger interior access). The viewer's own body is omitted; it has its own
 * private projections.
 */
export function visibleCrewPresentation(ctx: Context) {
  const visible = visibleInteriorBodies(ctx);
  if (!visible) return [];
  const out = [];
  for (const { body } of visible.bodies) {
    if (body.id === visible.actor.id) continue;
    const vitals = ctx.db.characterVitals.characterId.find(body.id),
      dead = vitals?.state === "dead" || vitals?.state === "downed";
    const seated =
      !!ctx.db.couchSeat.characterId.find(body.id) ||
      !!ctx.db.constructionPilotSeat.characterId.find(body.id) ||
      ctx.db.station.shipId.find(body.shipId)?.occupantId === body.id;
    const aim = ctx.db.combatAim.characterId.find(body.id),
      aimActive = !!aim?.active && !dead && !seated;
    const shot = ctx.db.combatImpact.characterId.find(body.id),
      // An impact recorded aboard another ship is not in this deck's frame.
      sameShip = !!shot && shot.shipId === body.shipId;
    const appearance = ctx.db.characterAppearance.characterId.find(body.id);
    out.push({
      characterId: body.id,
      shipId: body.shipId,
      deckId: visible.deck.id,
      appearanceJson: appearance?.appearanceJson ?? "{}",
      equipmentJson: JSON.stringify(
        visibleEquipment(ctx.db.inventoryItem.by_character.filter(body.id)),
      ),
      dead,
      seated,
      aimActive,
      aimAngle: aimActive ? aim!.angle : 0,
      shotSequence: sameShip ? shot!.shotSequence : 0n,
      shotX: sameShip ? shot!.x : 0,
      shotY: sameShip ? shot!.y : 0,
      shotStruck: sameShip && shot!.kind !== "none",
    });
  }
  return out;
}
