import { table, t } from "spacetimedb/server";

/** Latest nonzero accepted burn per ship. This is not a fuel balance or journal. */
export const constructionFlightConsumption = table(
  { name: "construction_flight_consumption", public: false },
  {
    shipId: t.string().primaryKey(),
    sampleTick: t.u64(),
    compiledRevision: t.u64(),
    inputHash: t.string(),
    actuatorsJson: t.string(),
  },
);
