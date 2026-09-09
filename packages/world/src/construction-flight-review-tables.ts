import { table, t } from "spacetimedb/server";
/** One explicit review transfer per character. No ship transform/inventory snapshot
 * is restored; only the original membership relation is retained. */
export const constructionFlightReview = table(
  { name: "construction_flight_review" },
  {
    characterId: t.string().primaryKey(),
    owner: t.identity(),
    visitId: t.string().unique(),
    instanceId: t.string(),
    deckId: t.string(),
    originalShipId: t.string(),
    originalSystemId: t.string(),
    originalAdmissionRevision: t.u64(),
    reviewAdmissionRevision: t.u64(),
  },
);
