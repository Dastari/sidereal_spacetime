import { table, t } from "spacetimedb/server";

/** Private admission for movement only. Ownership does not grant station control. */
export const inputControl = table(
  {
    name: "input_control",
    indexes: [
      {
        accessor: "by_connection",
        algorithm: "btree",
        columns: ["connectionId"],
      },
    ],
  },
  {
    characterId: t.string().primaryKey(),
    owner: t.identity(),
    connectionId: t.string(),
    sequence: t.u64(),
  },
);

/** One cursor per admitted socket (presence limits each account to 16 sockets).
 * Retained across focus release/reclaim, removed only on actual disconnect. */
export const inputControlCursor = table(
  { name: "input_control_cursor" },
  {
    connectionId: t.string().primaryKey(),
    owner: t.identity(),
    characterId: t.string(),
    sequence: t.u64(),
  },
);
