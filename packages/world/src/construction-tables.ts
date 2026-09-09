import { table, t } from "spacetimedb/server";
export const constructionGrant = table(
  {
    name: "construction_grant",
    indexes: [
      { accessor: "by_principal", algorithm: "btree", columns: ["principal"] },
      {
        accessor: "by_expiry",
        algorithm: "btree",
        columns: ["nextCheckMicros"],
      },
    ],
  },
  {
    id: t.string().primaryKey(),
    principal: t.identity(),
    workspaceId: t.string(),
    capability: t.string(),
    expiresMicros: t.u64(),
    nextCheckMicros: t.u64(),
    revoked: t.bool(),
    revision: t.u64(),
    issuedBy: t.identity(),
  },
);
export const constructionDraft = table(
  {
    name: "construction_draft",
    indexes: [
      {
        accessor: "by_workspace",
        algorithm: "btree",
        columns: ["workspaceId"],
      },
    ],
  },
  {
    id: t.string().primaryKey(),
    workspaceId: t.string(),
    revision: t.u64(),
    documentJson: t.string(),
    sha256: t.string(),
    updatedBy: t.identity(),
  },
);
export const constructionBlueprint = table(
  {
    name: "construction_blueprint",
    indexes: [
      {
        accessor: "by_workspace",
        algorithm: "btree",
        columns: ["workspaceId"],
      },
      { accessor: "by_draft", algorithm: "btree", columns: ["draftId"] },
    ],
  },
  {
    id: t.string().primaryKey(),
    workspaceId: t.string(),
    draftId: t.string(),
    sourceRevision: t.u64(),
    canonical: t.string(),
    sha256: t.string(),
    readinessJson: t.string(),
    publishedBy: t.identity(),
  },
);
export const constructionReceipt = table(
  {
    name: "construction_receipt",
    indexes: [
      { accessor: "by_principal", algorithm: "btree", columns: ["principal"] },
    ],
  },
  {
    id: t.string().primaryKey(),
    principal: t.identity(),
    request: t.string(),
    resultId: t.string(),
    revision: t.u64(),
  },
);
/** Authored instances have no laboratory flight ratings. State is separate from immutable design. */
export const constructionInstance = table(
  {
    name: "construction_instance",
    indexes: [{ accessor: "by_owner", algorithm: "btree", columns: ["owner"] }],
  },
  {
    id: t.string().primaryKey(),
    owner: t.identity(),
    workspaceId: t.string(),
    blueprintId: t.string(),
    blueprintSha256: t.string(),
    name: t.string(),
    revision: t.u64(),
    documentJson: t.string(),
    idMapJson: t.string(),
    spawnDeckId: t.string(),
    spawnX: t.f64(),
    spawnY: t.f64(),
    createdMicros: t.u64(),
  },
);
export const constructionDeck = table(
  {
    name: "construction_deck",
    indexes: [
      { accessor: "by_instance", algorithm: "btree", columns: ["instanceId"] },
    ],
  },
  {
    id: t.string().primaryKey(),
    instanceId: t.string(),
    sourceDeckId: t.string(),
    name: t.string(),
    elevation: t.f64(),
    ceiling: t.f64(),
  },
);
/** Explicit development review transit; future physical docking/EVA uses its own authority. */
export const constructionLocation = table(
  {
    name: "construction_location",
    indexes: [
      { accessor: "by_instance", algorithm: "btree", columns: ["instanceId"] },
    ],
  },
  {
    characterId: t.string().primaryKey(),
    visitId: t.string(),
    instanceId: t.string(),
    deckId: t.string(),
    returnShipId: t.string(),
    returnX: t.f64(),
    returnY: t.f64(),
    revision: t.u64(),
  },
);

/** Persistent physical door motion; seals and powered actuation are separate future contracts. */
export const constructionDoor = table(
  {
    name: "construction_door",
    indexes: [
      { accessor: "by_instance", algorithm: "btree", columns: ["instanceId"] },
      { accessor: "by_deck", algorithm: "btree", columns: ["deckId"] },
      { accessor: "by_moving", algorithm: "btree", columns: ["moving"] },
    ],
  },
  {
    id: t.string().primaryKey(),
    instanceId: t.string(),
    deckId: t.string(),
    x: t.f64(),
    y: t.f64(),
    quarterTurns: t.u8(),
    fraction: t.f64(),
    targetOpen: t.bool(),
    blocked: t.bool(),
    moving: t.bool(),
    revision: t.u64(),
  },
);
