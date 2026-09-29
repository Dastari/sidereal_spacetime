/**
 * Definition pins of item instances (roadmap X-2, wiki `Systems/Content Definitions`). Private.
 * Separate tables, so `inventory_item` and `combat_action` keep their shape and no view is rebuilt.
 * An item without a pin row was created before X-2 and pins item revision 1 (the seed) and, when
 * the code catalogue has a weapon for it, weapon revision 1.
 */
import { table, t } from "spacetimedb/server";

export const inventoryItemPin = table(
  { name: "inventory_item_pin" },
  {
    itemId: t.string().primaryKey(),
    /** The item's definition ID when pinned (instances never change definition). */
    definitionId: t.string(),
    itemRevision: t.u64(),
    /** 0 = the instance has no weapon rules. */
    weaponRevision: t.u64(),
    /** "created" or "resync:<operation id>". */
    source: t.string(),
    pinnedMicros: t.u64(),
  },
);

/** The weapon revision of each character's latest combat action (a thrown charge detonates with
 * the rules it was thrown with, even if the item is resynced or dropped meanwhile). */
export const combatActionPin = table(
  { name: "combat_action_pin" },
  {
    characterId: t.string().primaryKey(),
    definitionId: t.string(),
    weaponRevision: t.u64(),
  },
);
