import { table, t } from "spacetimedb/server";
export const interactionObject = table(
  {
    name: "interaction_object",
    indexes: [{ accessor: "by_ship", algorithm: "btree", columns: ["shipId"] }],
  },
  {
    id: t.string().primaryKey(),
    shipId: t.string(),
    placementId: t.string(),
    revision: t.u64(),
    enabled: t.bool(),
  },
);
export const couchSeat = table(
  { name: "couch_seat" },
  { characterId: t.string().primaryKey(), objectId: t.string().unique() },
);
export const interactionReceipt = table(
  {
    name: "interaction_receipt",
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
    operationId: t.string(),
    request: t.string(),
    createdMicros: t.u64(),
  },
);
