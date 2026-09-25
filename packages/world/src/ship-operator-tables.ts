import { table, t } from "spacetimedb/server";

/** Private singleton policy row (id "global"). Absent row means the historical
 * behaviour: new characters receive the legacy starter Wayfarer. Only the
 * deployment operator changes it, through an explicit audited reducer. */
export const shipPolicy = table(
  { name: "ship_policy" },
  {
    id: t.string().primaryKey(),
    starterShipsEnabled: t.bool(),
    revision: t.u64(),
    operationId: t.string(),
    updatedMicros: t.u64(),
  },
);

/** Private permanent operator ledger for policy, wipe (dry-run and apply) and
 * prefab assignment. The operation ID is the idempotency key; replaying the
 * same request is a no-op and reusing an ID for a different request fails. */
export const shipOperatorOperation = table(
  { name: "ship_operator_operation" },
  {
    operationId: t.string().primaryKey(),
    principal: t.identity(),
    kind: t.string(),
    request: t.string(),
    summaryJson: t.string(),
    createdMicros: t.u64(),
  },
);

/** Private before-images of every row deleted or rewritten by an applied ship
 * wipe or assignment. Rows are never pruned by gameplay; they are the in-database
 * half of the reversible-where-possible policy (the other half is the offline
 * export written before the wipe). */
export const shipWipeArchive = table(
  {
    name: "ship_wipe_archive",
    indexes: [
      {
        accessor: "by_operation",
        algorithm: "btree",
        columns: ["operationId"],
      },
    ],
  },
  {
    id: t.string().primaryKey(),
    operationId: t.string(),
    tableName: t.string(),
    action: t.string(),
    rowJson: t.string(),
  },
);
