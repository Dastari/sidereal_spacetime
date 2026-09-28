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
    /** Struck component's damage state, or "downed" for a character this shot took down. */
    targetState: t.string().default(""),
    /** Struck component hp after the shot (only when the shooter owns the ship; else 0). */
    targetHp: t.f64().default(0),
    targetMaxHp: t.f64().default(0),
  },
);
