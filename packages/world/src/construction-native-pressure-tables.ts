import { table, t } from "spacetimedb/server";

/** Private exact native installation and accepted gasket pose. Neither an
 * atmosphere certificate nor a door pose may be supplied through a reducer. */
export const constructionNativePressure = table(
  {
    name: "construction_native_pressure",
    indexes: [
      { accessor: "by_owner", algorithm: "btree", columns: ["owner"] },
      { accessor: "by_door", algorithm: "btree", columns: ["doorId"] },
    ],
  },
  {
    id: t.string().primaryKey(),
    owner: t.identity(),
    deckId: t.string(),
    doorId: t.string(),
    documentHash: t.string(),
    installedPartsJson: t.string(),
    installationFingerprint: t.string(),
    auditSha256: t.string(),
    acceptedFraction: t.f64(),
    sealRetraction: t.f64(),
    revision: t.u64(),
  },
);

/** Fixed step count persists across process restart. Scheduling time only gates
 * duplicate/older delivery; elapsed wall time never becomes gas catch-up. */
export const constructionAtmosphereClock = table(
  { name: "construction_atmosphere_clock" },
  {
    id: t.string().primaryKey(),
    tick: t.u64(),
    lastScheduleMicros: t.u64(),
  },
);
