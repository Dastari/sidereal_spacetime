import { table, t } from "spacetimedb/server";
/** Only occupied/pending-recovery seats exist. Pending index bounds recovery work. */
export const constructionPilotSeat = table(
  {
    name: "construction_pilot_seat",
    indexes: [
      {
        accessor: "by_recovery",
        algorithm: "btree",
        columns: ["recoveryRequested"],
      },
      { accessor: "by_owner", algorithm: "btree", columns: ["owner"] },
    ],
  },
  {
    characterId: t.string().primaryKey(),
    owner: t.identity(),
    stationId: t.string().unique(),
    shipId: t.string(),
    deckId: t.string(),
    instanceRevision: t.u64(),
    revision: t.u64(),
    recoveryRequested: t.bool(),
    recoveryReason: t.string(),
  },
);
