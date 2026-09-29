import { table, t } from "spacetimedb/server";
export const combatAim = table(
  { name: "combat_aim" },
  {
    characterId: t.string().primaryKey(),
    active: t.bool(),
    angle: t.f64(),
    updatedMicros: t.u64(),
  },
);
export const weaponEnergy = table(
  { name: "weapon_energy" },
  {
    itemId: t.string().primaryKey(),
    energy: t.f64(),
    checkpointMicros: t.u64(),
    lastShotMicros: t.u64(),
    revision: t.u64(),
    shotSequence: t.u64(),
    lastShotAngle: t.f64(),
  },
);
/**
 * Private, one row per character (items batch A, 2026-09-29): what others on the deck need to draw
 * that character's latest combat action with the right effects, and the stun that character is
 * under. Projected by `visible_combat_actions` to bodies on the viewer's own deck (own included);
 * never item UUIDs, energy, damage numbers or hit targets.
 */
export const combatAction = table(
  { name: "combat_action" },
  {
    characterId: t.string().primaryKey(),
    shipId: t.string(),
    /** Construction deck of the shot ("" aboard ships without construction locations). */
    deckId: t.string(),
    /** Inventory definition of the weapon (catalogue id, never the item UUID). */
    definitionId: t.string(),
    /** beam | pellets | melee | thrown (content/weapons.ts) */
    mode: t.string(),
    /** Mirrors the weapon's accepted shot sequence (weapon_energy.shot_sequence). */
    shotSequence: t.u64(),
    shotMicros: t.u64(),
    originX: t.f64(),
    originY: t.f64(),
    /** Ship-local end points `[[x, y, struck]]` of every ray of the latest shot (pellets: one each). */
    pointsJson: t.string(),
    /** Thrown: landing point, detonation time and blast radius; `detonated` once resolved. */
    landX: t.f64(),
    landY: t.f64(),
    detonateMicros: t.u64(),
    detonated: t.bool(),
    blastRadiusM: t.f64(),
    reloadSequence: t.u64(),
    /** The item of the latest manual reload; its fire is refused until reloadUntilMicros. Kept
     * here (a new table) rather than on weapon_energy so no existing table changes shape. */
    reloadItemId: t.string(),
    reloadUntilMicros: t.u64(),
    /** This character cannot aim or fire until then (stun gun, baton). */
    stunnedUntilMicros: t.u64(),
    stunSequence: t.u64(),
  },
);
export const combatReceipt = table(
  {
    name: "combat_receipt",
    indexes: [
      {
        accessor: "by_character",
        algorithm: "btree",
        columns: ["characterId"],
      },
    ],
  },
  {
    id: t.string().primaryKey(),
    characterId: t.string(),
    request: t.string(),
    createdMicros: t.u64(),
  },
);
/** Private: the authoritative end point of each character's latest accepted shot, in the
 * shooter's ship-local frame. Projected only to the shooter through `own_combat_impact`. */
export const combatImpact = table(
  { name: "combat_impact" },
  {
    characterId: t.string().primaryKey(),
    itemId: t.string(),
    shotSequence: t.u64(),
    shipId: t.string(),
    x: t.f64(),
    y: t.f64(),
    distanceM: t.f64(),
    /** wall | glass | hull | hatch | object | ship | none */
    kind: t.string(),
    /** Own-ship object/structure id, or the other ship's id for kind "ship". */
    targetId: t.string(),
    createdMicros: t.u64(),
    // Appended with defaults so existing impact rows migrate additively (2026-09-28).
    /** Health or component hp actually removed by this shot. */
    damage: t.f64().default(0),
    /** Struck component's damage state, or "dead" for a character this shot killed. */
    targetState: t.string().default(""),
    /** Struck component hp after the shot (only when the shooter owns the ship; else 0). */
    targetHp: t.f64().default(0),
    targetMaxHp: t.f64().default(0),
  },
);
