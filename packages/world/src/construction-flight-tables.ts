import { table, t } from "spacetimedb/server";
/** Additive private rows; no client may read these beside an admitted projection. */
export const constructionFlightBinding = table(
  {
    name: "construction_flight_binding",
    indexes: [{ accessor: "by_owner", algorithm: "btree", columns: ["owner"] }],
  },
  {
    shipId: t.string().primaryKey(),
    instanceId: t.string().unique(),
    owner: t.identity(),
    deckId: t.string(),
    stationId: t.string().unique(),
    instanceRevision: t.u64(),
    blueprintSha256: t.string(),
    definitionId: t.string(),
    definitionSha256: t.string(),
    lifecycle: t.string(),
    revision: t.u64(),
  },
);
export const constructionFlightFitting = table(
  {
    name: "construction_flight_fitting",
    indexes: [{ accessor: "by_ship", algorithm: "btree", columns: ["shipId"] }],
  },
  {
    id: t.string().primaryKey(),
    shipId: t.string(),
    placedObjectId: t.string().unique(),
    sourceDeviceId: t.string(),
    definitionId: t.string(),
    kind: t.string(),
    installed: t.bool(),
    powered: t.bool(),
    availability: t.f64(),
    revision: t.u64(),
    // Appended with a default so existing installed rows migrate additively.
    definitionRevision: t.u32().default(1),
  },
);
export const constructionFlightStation = table(
  { name: "construction_flight_station" },
  {
    stationId: t.string().primaryKey(),
    shipId: t.string().unique(),
    deckId: t.string(),
    seatPlacedObjectId: t.string(),
    consolePlacedObjectId: t.string(),
    revision: t.u64(),
  },
);
export const constructionFlightReceipt = table(
  { name: "construction_flight_receipt" },
  {
    id: t.string().primaryKey(),
    owner: t.identity(),
    requestJson: t.string(),
    instanceId: t.string(),
    shipId: t.string(),
    stationId: t.string(),
    revision: t.u64(),
  },
);

/** Accepted physical inputs; these private aggregates never grant control. */
export const constructionFlightCompiled = table(
  { name: "construction_flight_compiled", public: false },
  {
    shipId: t.string().primaryKey(),
    revision: t.u64(),
    inputHash: t.string(),
    definitionHash: t.string(),
    massKg: t.f64(),
    centerX: t.f64(),
    centerY: t.f64(),
    inertiaKgM2: t.f64(),
    envelopeJson: t.string(),
    actuatorsJson: t.string(),
    computersJson: t.string(),
    hullJson: t.string(),
    contributionsJson: t.string(),
    status: t.string(),
    reason: t.string(),
  },
);
/** First dirty revision is retained while pending, preventing starvation. */
export const constructionFlightDirty = table(
  {
    name: "construction_flight_dirty",
    public: false,
    indexes: [
      { accessor: "by_revision", algorithm: "btree", columns: ["revision"] },
    ],
  },
  { shipId: t.string().primaryKey(), revision: t.u64() },
);
