import { table, t } from "spacetimedb/server";

/** Private, staged: root registration follows qualified asset and inventory hooks. */
export const constructionCargoGrid = table(
  {
    name: "construction_cargo_grid",
    public: false,
    indexes: [
      { accessor: "by_instance", algorithm: "btree", columns: ["instanceId"] },
    ],
  },
  {
    id: t.string().primaryKey(),
    instanceId: t.string(),
    deckId: t.string(),
    definitionSha256: t.string(),
    gridJson: t.string(),
    revision: t.u64(),
  },
);
export const constructionCargoPlacement = table(
  {
    name: "construction_cargo_placement",
    public: false,
    indexes: [{ accessor: "by_grid", algorithm: "btree", columns: ["gridId"] }],
  },
  {
    containerId: t.string().primaryKey(),
    instanceId: t.string(),
    deckId: t.string(),
    gridId: t.string(),
    interfaceId: t.string(),
    interfaceRevision: t.string(),
    originX: t.i32(),
    originY: t.i32(),
    originZ: t.i32(),
    quarterTurns: t.u8(),
    secured: t.bool(),
    custodyAnchorId: t.string(),
    revision: t.u64(),
  },
);
export const constructionCargoOperation = table(
  {
    name: "construction_cargo_operation",
    public: false,
    indexes: [
      { accessor: "by_principal", algorithm: "btree", columns: ["principal"] },
    ],
  },
  {
    id: t.string().primaryKey(),
    principal: t.identity(),
    requestJson: t.string(),
    resultJson: t.string(),
  },
);
