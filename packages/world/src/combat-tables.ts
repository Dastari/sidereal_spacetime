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
