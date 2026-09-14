import { table, t } from "spacetimedb/server";
/** Events originate in trusted server code; clients cannot write damage values. */
export const constructionFlightDamageEvent = table(
  {
    name: "construction_flight_damage_event",
    public: false,
    indexes: [
      {
        accessor: "by_created",
        algorithm: "btree",
        columns: ["createdMicros"],
      },
    ],
  },
  {
    id: t.string().primaryKey(),
    shipId: t.string(),
    fittingId: t.string(),
    expectedFittingRevision: t.u64(),
    lossFraction: t.f64(),
    sourceEventId: t.string(),
    createdMicros: t.u64(),
  },
);
