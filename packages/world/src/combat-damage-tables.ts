import { table, t } from "spacetimedb/server";

/** Private: character health from weapon hits. A character with no row is at full health.
 * Projected only to the character's own account through `own_character_vitals`. */
export const characterVitals = table(
  { name: "character_vitals" },
  {
    characterId: t.string().primaryKey(),
    health: t.f64(),
    maxHealth: t.f64(),
    /** active | dead ("downed" in rows written before death, read as dead) */
    state: t.string(),
    lastDamageMicros: t.u64(),
    /** While dead: when the automatic respawn is due. (Name predates death.) */
    downedUntilMicros: t.u64(),
    checkpointMicros: t.u64(),
    /** Increments on every hit that removed health (client hit flash). */
    hitSequence: t.u64(),
    lastHitDamage: t.f64(),
  },
);

/** Private: hp and damage state of a placed ship component (`mount:<id>`) that has been hit.
 * A component with no row is pristine at its catalogue hp. Projected to the ship's owner
 * through `own_ship_component_damage`. */
export const shipComponentDamage = table(
  {
    name: "ship_component_damage",
    indexes: [{ accessor: "by_ship", algorithm: "btree", columns: ["shipId"] }],
  },
  {
    /** `${shipId}|${objectId}` */
    id: t.string().primaryKey(),
    shipId: t.string(),
    /** Placed object id, `mount:<mountId>`; never the reusable catalogue id. */
    objectId: t.string(),
    componentId: t.string(),
    /** Catalogue revision the hp and damage states were read from. */
    catalog: t.string(),
    hp: t.f64(),
    maxHp: t.f64(),
    /** pristine | scuffed | damaged | destroyed (catalogue damage states) */
    state: t.string(),
    performance: t.f64(),
    revision: t.u64(),
    updatedMicros: t.u64(),
  },
);
