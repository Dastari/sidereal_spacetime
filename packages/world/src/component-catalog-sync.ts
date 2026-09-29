/**
 * Loads stored registry-composed component catalogues (X-3b) into this process. Light on purpose:
 * `auth.ts` calls it on every game read and action. See `component-catalog.ts`.
 */
import { registerComponentCatalogSnapshot } from "@sidereal/sim/component-catalogs";

type SnapshotTable = {
  count(): bigint;
  iter(): Iterable<{ pin: string; snapshotJson: string }>;
};
/** Stored snapshots this process has registered (hypothetical publish checks are not counted). */
const loaded = new Set<string>();
/** Register every stored snapshot not yet loaded (one `count()` when up to date). */
export function syncComponentSnapshots(db: {
  componentCatalogSnapshot: SnapshotTable;
}) {
  const table = db.componentCatalogSnapshot;
  if (Number(table.count()) === loaded.size) return;
  for (const row of table.iter()) {
    registerComponentCatalogSnapshot(row.pin, row.snapshotJson);
    loaded.add(row.pin);
  }
}
