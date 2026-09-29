import { table, t } from "spacetimedb/server";

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
