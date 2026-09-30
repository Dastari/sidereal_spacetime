import { table, t } from "spacetimedb/server";
/** Persistent installed identity and energy. Never public; filtered actor views only. */
export const shipPowerDevice = table(
  {
    name: "ship_power_device",
    indexes: [{ accessor: "by_ship", algorithm: "btree", columns: ["shipId"] }],
  },
  {
    id: t.string().primaryKey(),
    shipId: t.string(),
    mountId: t.string(),
    definition: t.string(),
    energyJ: t.f64(),
    running: t.bool(),
    issuedMicros: t.u64(),
  },
);
/** Permanent installation/migration marker, independent of the derived solver state. */
export const shipPowerInstallation = table(
  { name: "ship_power_installation" },
  {
    shipId: t.string().primaryKey(),
    initializedMicros: t.u64(),
    policy: t.string(),
    lastSolvedTick: t.u64(),
  },
);
/** Module's first runtime activation boundary. Survives deploy and restart. */
export const shipPowerClock = table(
  { name: "ship_power_clock" },
  {
    id: t.u32().primaryKey(),
    legacyCutoffMicros: t.u64(),
    lastTick: t.u64(),
    admissionValid: t.bool(),
  },
);
/** Last successful fixed-step solve; exact revision/hash and server time protect consumption. */
export const shipPowerState = table(
  { name: "ship_power_state" },
  {
    shipId: t.string().primaryKey(),
    instanceRevision: t.u64(),
    inputHash: t.string(),
    tick: t.u64(),
    solvedMicros: t.u64(),
    energyJ: t.f64(),
    generationW: t.f64(),
    demandW: t.f64(),
    brownout: t.bool(),
    corePowered: t.bool(),
    supplyJson: t.string(),
    networksJson: t.string(),
  },
);
