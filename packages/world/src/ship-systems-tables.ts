import { table, t } from "spacetimedb/server";

/**
 * S4-1 (additive, 2026-09-29). Private: the server-compiled ship-systems budget of a prefab ship
 * (`compilePrefabShipSystems`: power, heat, coolant, fuel, data, crew and propulsion from the
 * ship's pinned prefab document, catalogue revision and component damage). One row per ship,
 * rewritten only when the compiled input hash changes. Clients read it through the scoped views
 * `own_ship_networks` (owner and admitted crew), `own_ship_systems_report` (owner) and
 * `visible_ship_system_effects` (anyone who can see the ship: effects only).
 * Nullable figures (no deficit, sustainable heat, no fuel burn) are `none`.
 */
export const shipSystemsState = table(
  { name: "ship_systems_state" },
  {
    shipId: t.string().primaryKey(),
    /** Construction instance revision the compile read. */
    instanceRevision: t.u64(),
    /** Pinned component catalogue revision (`ship-components-v1@N`). */
    catalog: t.string(),
    prefabId: t.string(),
    prefabRevision: t.u32(),
    /** sha256 of the compile input (dirty detection only). */
    inputHash: t.string(),
    /** Increments whenever the stored compile changes. */
    compileRevision: t.u64(),
    /** ok | warnings | invalid (catalogue rules; nothing is gated on it in S4-1) */
    status: t.string(),
    errors: t.u32(),
    warnings: t.u32(),
    massKg: t.f64(),
    generationKw: t.f64(),
    storageKwh: t.f64(),
    cruiseDemandKw: t.f64(),
    cruiseBalanceKw: t.f64(),
    cruiseBrownout: t.bool(),
    combatDemandKw: t.f64(),
    combatBalanceKw: t.f64(),
    combatBrownout: t.bool(),
    combatBatteryEnduranceS: t.option(t.f64()),
    cruiseHeatBalanceKw: t.f64(),
    combatHeatBalanceKw: t.f64(),
    combatOverheatS: t.option(t.f64()),
    coolantSupplyLps: t.f64(),
    coolantDemandLps: t.f64(),
    fuelCapacityL: t.f64(),
    fuelLoadedL: t.f64(),
    cruiseFuelEnduranceS: t.option(t.f64()),
    dataSupplyKbps: t.f64(),
    dataDemandKbps: t.f64(),
    controlSlots: t.u32(),
    controlSlotsUsed: t.u32(),
    minimumCrew: t.u32(),
    lifeSupportCrew: t.f64(),
    oxygenReserveHours: t.option(t.f64()),
    forwardKn: t.f64(),
    forwardAccel: t.f64(),
    damagedComponents: t.u32(),
    destroyedComponents: t.u32(),
    /** Full `ShipSystemsReport` JSON (owner-only projection). */
    reportJson: t.string(),
    compiledMicros: t.u64(),
  },
);

/** Private recompile queue (install, damage, refit/upgrade, stale sweep). Oldest first. */
export const shipSystemsDirty = table(
  {
    name: "ship_systems_dirty",
    indexes: [
      { accessor: "by_revision", algorithm: "btree", columns: ["revision"] },
    ],
  },
  {
    shipId: t.string().primaryKey(),
    /** Server micros when first queued. */
    revision: t.u64(),
    /** install | damage | refit | stale | backfill */
    reason: t.string(),
  },
);

/** Private singleton (id 0): compile budget accounting. */
export const shipSystemsClock = table(
  { name: "ship_systems_clock" },
  {
    id: t.u32().primaryKey(),
    /** Compiles attempted (changed or not). */
    compiles: t.u64(),
    /** Compiles that changed the stored row. */
    changed: t.u64(),
    /** Compiles that threw (malformed binding); the ship keeps its last row. */
    failed: t.u64(),
    /** Ticks that ended with ships still queued past the per-tick budget. */
    deferredTicks: t.u64(),
    /** Sum over ticks of ships left queued past the budget. */
    deferredShips: t.u64(),
    /** Queue length left after the latest tick. */
    lastQueue: t.u32(),
    lastSweepMicros: t.u64(),
  },
);
