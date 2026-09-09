import { table, t } from "spacetimedb/server";
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
export const wayfarerRefitOfferProjection = t.row("WayfarerRefitOffer", {
  shipId: t.string().primaryKey(),
  characterId: t.string(),
  expectedShipRevision: t.u64(),
  expectedInventoryRevision: t.u64(),
  fingerprint: t.string(),
  status: t.string(),
});
export const wayfarerRefitAttachmentProjection = t.row(
  "WayfarerRefitAttachmentStatus",
  {
    id: t.string().primaryKey(),
    instanceId: t.string(),
    deckId: t.string(),
    containerId: t.string(),
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
