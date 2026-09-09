import { table, t } from "spacetimedb/server";

/** Private authoritative gas, separate from immutable visual/blueprint documents.
 * Native room installation is validated by the bounded authority adapter. */
export const constructionAtmosphere = table(
  {
    name: "construction_atmosphere",
    indexes: [{ accessor: "by_owner", algorithm: "btree", columns: ["owner"] }],
  },
  {
    id: t.string().primaryKey(),
    owner: t.identity(),
    structureJson: t.string(),
    proofHash: t.string(),
    initialAllocationHash: t.string(),
    gasJson: t.string(),
    sourceMoles: t.f64(),
    ventedMoles: t.f64(),
    removedMoles: t.f64(),
    revision: t.u64(),
    lastTick: t.u64(),
  },
);
