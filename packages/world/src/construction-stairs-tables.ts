import { table, t } from "spacetimedb/server";

/** Private stair state. Registered by world/index; service publication is separate. */
export const constructionStairLink = table(
  {
    name: "construction_stair_link",
    indexes: [
      { accessor: "by_instance", algorithm: "btree", columns: ["instanceId"] },
      { accessor: "by_owner", algorithm: "btree", columns: ["owner"] },
    ],
  },
  {
    id: t.string().primaryKey(),
    owner: t.identity(),
    instanceId: t.string(),
    instanceRevision: t.u64(),
    revision: t.u64(),
    documentSha256: t.string(),
    proofHash: t.string(),
    lowerDeckId: t.string(),
    upperDeckId: t.string(),
  },
);
export const constructionStairWalk = table(
  {
    name: "construction_stair_walk",
    indexes: [
      { accessor: "by_instance", algorithm: "btree", columns: ["instanceId"] },
      { accessor: "by_owner", algorithm: "btree", columns: ["owner"] },
    ],
  },
  {
    characterId: t.string().primaryKey(),
    id: t.string(),
    owner: t.identity(),
    instanceId: t.string(),
    stairId: t.string(),
    visitId: t.string(),
    locationRevision: t.u64(),
    sourceDeckId: t.string(),
    anchorX: t.f64(),
    anchorY: t.f64(),
    stateJson: t.string(),
    revision: t.u64(),
    acceptedX: t.f64(),
    acceptedY: t.f64(),
    acceptedZ: t.f64(),
    phase: t.string(),
    egressOnly: t.bool(),
    interruption: t.string(),
  },
);
export const constructionStairReservation = table(
  {
    name: "construction_stair_reservation",
    indexes: [
      { accessor: "by_instance", algorithm: "btree", columns: ["instanceId"] },
    ],
  },
  {
    stairId: t.string().primaryKey(),
    instanceId: t.string(),
    characterId: t.string(),
    walkId: t.string(),
    visitId: t.string(),
    proofHash: t.string(),
    boundsJson: t.string(),
  },
);
export const constructionStairAudit = table(
  {
    name: "construction_stair_audit",
    indexes: [{ accessor: "by_owner", algorithm: "btree", columns: ["owner"] }],
  },
  {
    id: t.string().primaryKey(),
    owner: t.identity(),
    characterId: t.string(),
    instanceId: t.string(),
    stairId: t.string(),
    visitId: t.string(),
    sourceDeckId: t.string(),
    destinationDeckId: t.string(),
    outcome: t.string(),
    interruption: t.string(),
    revision: t.u64(),
    completedMicros: t.u64(),
  },
);
