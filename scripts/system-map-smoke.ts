import assert from "node:assert/strict";
import { tables, type DbConnection } from "../packages/net/src/generated";
import { newSystemMap } from "../packages/content/src/system-map";
import { constructionHash } from "../packages/sim/src/construction-transactions";
export async function systemMapDenialSmoke(c: DbConnection) {
  const sub = await new Promise<{ unsubscribe(): void }>((resolve, reject) => {
    const s = c
      .subscriptionBuilder()
      .onApplied(() => resolve(s))
      .onError((e) => reject(e))
      .subscribe([tables.ownSystemMaps, tables.ownMapShips]);
  });
  assert.equal(
    [...c.db.ownSystemMaps.iter()].length,
    0,
    "Unprivileged game actors cannot read authoring maps",
  );
  assert.equal(
    [...c.db.ownMapShips.iter()].length,
    0,
    "Unprivileged game actors cannot enumerate all ships",
  );
  await assert.rejects(
    c.reducers.applySystemMap({
      documentJson: JSON.stringify(newSystemMap("denied-map")),
      expectedRevision: 0n,
      sourceFingerprint: constructionHash("[]"),
      operationId: "map-denied-smoke",
    }),
  );
  for (const table of ["system_zone", "ship_zone_state"]) {
    await new Promise<void>((resolve, reject) => {
      let denied = false;
      const timer = setTimeout(
        () =>
          reject(Error(`Private zone subscription did not reject: ${table}`)),
        5000,
      );
      const privateSub = c
        .subscriptionBuilder()
        .onError(() => {
          denied = true;
          clearTimeout(timer);
          resolve();
        })
        .onApplied(() => {
          clearTimeout(timer);
          reject(Error(`Private zone table was exposed: ${table}`));
        })
        .subscribe(`SELECT * FROM ${table}`);
      void denied;
      void privateSub;
    });
  }
  sub.unsubscribe();
  return {
    mapReadDenied: true,
    shipEnumerationDenied: true,
    mapApplyDenied: true,
    privateZonesDenied: true,
  };
}
