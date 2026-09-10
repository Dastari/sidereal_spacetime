import { table, t } from "spacetimedb/server";

/** Additive sidecar: inventory root, native payload and carrier keep distinct IDs. */
export const constructionCargoAssembly = table(
  {
    name: "construction_cargo_assembly",
    public: false,
    indexes: [
      { accessor: "by_instance", algorithm: "btree", columns: ["instanceId"] },
    ],
  },
  {
    containerId: t.string().primaryKey(),
    id: t.string().unique(),
    carrierId: t.string().unique(),
    placedObjectId: t.string().unique(),
    instanceId: t.string(),
    deckId: t.string(),
    carrierSize: t.string(),
    payloadAssetId: t.string(),
    payloadGlbSha256: t.string(),
    interfaceRevision: t.string(),
    retentionRevision: t.string(),
    upperFrameLocked: t.bool(),
    lifecycle: t.string(),
    revision: t.u64(),
  },
);
