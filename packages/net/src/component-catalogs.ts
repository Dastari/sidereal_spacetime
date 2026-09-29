/**
 * Registers the registry-composed component catalogues ships pin (X-3b) so the client resolves
 * `ship-components-v1@N+<hash>` exactly as the server does. Snapshots are immutable and
 * content-addressed; registration verifies the hash.
 */
import { registerComponentCatalogSnapshot } from "@sidereal/sim/component-catalogs";
import type { DbConnection } from "./generated";

export function installComponentSnapshots(connection: DbConnection) {
  for (const row of connection.db.componentCatalogSnapshots.iter())
    try {
      registerComponentCatalogSnapshot(row.pin, row.snapshotJson);
    } catch (error) {
      console.error("Component catalogue snapshot rejected", row.pin, error);
    }
}
