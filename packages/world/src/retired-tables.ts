import { table, t } from "spacetimedb/server";

/**
 * Retired Wayfarer tables (owner: "Retire Wayfarer.", 2026-09-29).
 *
 * No reducer writes them and no view reads them. They stay in the module schema
 * because removing a table is a breaking migration in SpacetimeDB: an ordinary
 * publish refuses it and --delete-data would destroy the whole database. Live
 * still holds historical rows (one refit receipt and two starter entitlements),
 * which the operator can export before any separately approved table drop.
 * boardPrefabShip archives and deletes a character's starter entitlement when a
 * prefab ship is assigned. See the wiki page History/Wayfarer Retirement.
 */
export const wayfarerRefitReceipt = table(
  { name: "wayfarer_refit_receipt" },
  {
    shipId: t.string().primaryKey(),
    owner: t.identity(),
    characterId: t.string(),
    operationId: t.string(),
    request: t.string(),
    deckId: t.string(),
    templateSha256: t.string(),
    completedMicros: t.u64(),
  },
);
export const wayfarerRefitAttachment = table(
  {
    name: "wayfarer_refit_attachment",
    indexes: [
      { accessor: "by_instance", algorithm: "btree", columns: ["instanceId"] },
    ],
  },
  {
    id: t.string().primaryKey(),
    instanceId: t.string(),
    deckId: t.string(),
    containerId: t.string().unique(),
    assetId: t.string(),
    assetSha256: t.string(),
    x: t.f64(),
    y: t.f64(),
    z: t.f64(),
    revision: t.u64(),
  },
);
export const wayfarerLiquidReceipt = table(
  { name: "wayfarer_liquid_receipt" },
  {
    id: t.string().primaryKey(),
    actorId: t.string(),
    request: t.string(),
    sourceId: t.string(),
    destinationId: t.string(),
    litres: t.f64(),
  },
);

export const personalStarterReceipt = table(
  { name: "personal_starter_receipt" },
  {
    owner: t.identity().primaryKey(),
    entitlement: t.string(),
    characterId: t.string().unique(),
    shipId: t.string().unique(),
    templateSha256: t.string(),
  },
);
