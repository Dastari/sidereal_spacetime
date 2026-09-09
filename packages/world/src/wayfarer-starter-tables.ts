import { table, t } from "spacetimedb/server";

/** Private, unregistered until the trusted writer + game access adapters pass.
 * Account key is intentionally independent of connection and request nonce. */
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
export const gameShipAccess = table(
  {
    name: "game_ship_access",
    indexes: [{ accessor: "by_owner", algorithm: "btree", columns: ["owner"] }],
  },
  {
    shipId: t.string().primaryKey(),
    instanceId: t.string().unique(),
    owner: t.identity(),
    characterId: t.string(),
    deckId: t.string(),
    templateSha256: t.string(),
    instanceRevision: t.u64(),
    lifecycle: t.string(),
  },
);
