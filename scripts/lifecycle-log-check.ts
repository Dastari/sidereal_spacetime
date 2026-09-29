/**
 * Read-only S1-1 lifecycle log check for an isolated -smoke database (owner SQL):
 * `tsx scripts/lifecycle-log-check.ts <server-url> <database>-smoke`. Prints the invariant summary.
 */
import { assertLogInvariants, ownerSql } from "./lifecycle-smoke";

const [host, database] = process.argv.slice(2);
if (!host || !database?.endsWith("-smoke"))
  throw new Error("Usage: lifecycle-log-check <server-url> <database>-smoke");
const sql = ownerSql(host, database);
const summary = assertLogInvariants(sql);
const perKind = sql(["object_kind", "kind"], "lifecycle_event").reduce<
  Record<string, number>
>((counts, row) => {
  const key = `${String(row.object_kind)}:${String(row.kind)}`;
  counts[key] = (counts[key] ?? 0) + 1;
  return counts;
}, {});
console.log(JSON.stringify({ database, ...summary, perKind }, null, 2));
