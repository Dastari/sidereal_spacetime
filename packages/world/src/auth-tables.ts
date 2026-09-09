import { table, t } from "spacetimedb/server";
export const authSession = table(
  {
    name: "auth_session",
    indexes: [{ accessor: "by_owner", algorithm: "btree", columns: ["owner"] }],
  },
  {
    connectionId: t.string().primaryKey(),
    owner: t.identity(),
    kind: t.string(),
    game: t.bool(),
    expiresMicros: t.u64(),
  },
);
export const retiredIdentity = table(
  {
    name: "retired_identity",
    indexes: [
      { accessor: "by_target", algorithm: "btree", columns: ["target"] },
    ],
  },
  {
    source: t.identity().primaryKey(),
    target: t.identity(),
    characterId: t.string(),
    linkedMicros: t.u64(),
  },
);
export const identityLink = table(
  {
    name: "identity_link",
    indexes: [
      { accessor: "by_source", algorithm: "btree", columns: ["source"] },
      { accessor: "by_target", algorithm: "btree", columns: ["target"] },
    ],
  },
  {
    id: t.string().primaryKey(),
    operationKey: t.string().unique(),
    source: t.identity(),
    target: t.identity(),
    characterId: t.string(),
    characterName: t.string(),
    shipId: t.string(),
    expiresMicros: t.u64(),
    accepted: t.bool(),
    acceptOperationId: t.string(),
    receiptIdsJson: t.string(),
  },
);
