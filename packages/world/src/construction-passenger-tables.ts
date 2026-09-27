import { table, t } from "spacetimedb/server";
/** Explicit invitation to ship-wide interior geometry, and walking on the
 * admitted entry deck. It grants no station, inventory, refit or device access. */
export const constructionPassengerGrant = table(
  {
    name: "construction_passenger_grant",
    public: false,
    indexes: [
      { accessor: "by_ship", algorithm: "btree", columns: ["shipId"] },
      { accessor: "by_owner", algorithm: "btree", columns: ["owner"] },
      { accessor: "by_grantee", algorithm: "btree", columns: ["granteeOwner"] },
    ],
  },
  {
    id: t.string().primaryKey(),
    shipId: t.string(),
    owner: t.identity(),
    granteeId: t.string(),
    granteeOwner: t.identity(),
    deckId: t.string(),
    instanceRevision: t.u64(),
    expiresMicros: t.u64(),
    revision: t.u64(),
  },
);
export const constructionPassengerVisit = table(
  {
    name: "construction_passenger_visit",
    public: false,
    indexes: [
      { accessor: "by_ship", algorithm: "btree", columns: ["shipId"] },
      { accessor: "by_owner", algorithm: "btree", columns: ["owner"] },
    ],
  },
  {
    characterId: t.string().primaryKey(),
    owner: t.identity(),
    shipId: t.string(),
    deckId: t.string(),
    grantId: t.string(),
    grantRevision: t.u64(),
    visitId: t.string(),
    admissionRevision: t.u64(),
    sourceShipId: t.string(),
    sourceDeckId: t.string(),
    sourceVisitId: t.string(),
    sourceLocationRevision: t.u64(),
    sourceInstanceRevision: t.u64(),
    sourceSha256: t.string(),
    sourceSystemId: t.string(),
    sourceX: t.f64(),
    sourceY: t.f64(),
    revision: t.u64(),
    recoveryReason: t.string(),
    retryAfterMicros: t.u64(),
  },
);
export const constructionPassengerReceipt = table(
  {
    name: "construction_passenger_receipt",
    public: false,
    indexes: [{ accessor: "by_owner", algorithm: "btree", columns: ["owner"] }],
  },
  {
    id: t.string().primaryKey(),
    owner: t.identity(),
    requestJson: t.string(),
    resultId: t.string(),
    revision: t.u64(),
  },
);
