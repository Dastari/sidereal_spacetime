/**
 * S4-1 network compile authority (2026-09-29, additive).
 *
 * The world owns each prefab ship's compiled ship-systems budget (`@sidereal/sim/prefab-ship-systems`
 * over `compileShipSystems`): power generation and demand per mode with priority brownout, heat and
 * coolant, fuel capacity and endurance, data bandwidth and control slots, crew and propulsion. It is
 * recompiled on the dirty path, never by a client:
 * - install (`installPrefabShip`, which the operator upgrade/refit reinstall also runs);
 * - component damage (`ship_component_damage` writes);
 * - a stale sweep (1 Hz) that queues ships whose construction instance revision differs from the
 *   compiled one (any refit or in-place upgrade) and backfills ships spawned before this module.
 * At most `SHIP_SYSTEMS_COMPILES_PER_TICK` ships compile per tick; the rest stay queued oldest
 * first and the deferral is counted on `ship_systems_clock`.
 *
 * Scope: S4-1 is a budget authority only. Nothing reads these rows to gate flight, power a device or
 * grant control; live flight keeps its own compile and `prefabPowerFactor` until S4-2 replaces it.
 * Visibility: the owner reads the full report; admitted crew (an accepted passenger aboard) read the
 * summary; anyone who can see the ship reads only its outward power effect.
 */
import type { InferSchema, ReducerCtx, ViewCtx } from "spacetimedb/server";
import { Range, t } from "spacetimedb/server";
import type world from "./index";
import {
  compilePrefabShipSystems,
  type PrefabComponentCondition,
} from "@sidereal/sim/prefab-ship-systems";
import type { ShipSystemsReport } from "@sidereal/sim/ship-systems";
import { prefabBindingOf } from "./combat-damage";
import { acceptedPassengerAccess } from "./construction-passenger-access";
import {
  visibleShipMotion,
  type SharedViewContext,
} from "./shared-world-views";
import { markShipSystemsDirty } from "./ship-systems-dirty";

type Context = ReducerCtx<InferSchema<typeof world>>;
type ReadContext = Pick<ViewCtx<InferSchema<typeof world>>, "db" | "sender">;
type Db = Context["db"];

export const SHIP_SYSTEMS_COMPILES_PER_TICK = 2;
/** Ships examined per stale sweep, and the sweep period. */
export const SHIP_SYSTEMS_SWEEP_LIMIT = 256;
export const SHIP_SYSTEMS_SWEEP_MICROS = 1_000_000n;
const CLOCK_ID = 0;

export { markShipSystemsDirty };

const none = (v: number | null) => (v === null ? undefined : v);

/** Stored row for a compile (pure; the caller decides whether to write). */
export function shipSystemsRow(
  shipId: string,
  instanceRevision: bigint,
  binding: { catalog: string; doc: { id: string; revision: number } },
  compiled: ReturnType<typeof compilePrefabShipSystems>,
  compileRevision: bigint,
  compiledMicros: bigint,
) {
  const r: ShipSystemsReport = compiled.report;
  const cruise = r.power.modes.cruise,
    combat = r.power.modes.combat;
  return {
    shipId,
    instanceRevision,
    catalog: binding.catalog,
    prefabId: binding.doc.id,
    prefabRevision: binding.doc.revision,
    inputHash: compiled.inputHash,
    compileRevision,
    status: r.status,
    errors: r.issues.filter((i) => i.severity === "error").length,
    warnings: r.issues.filter((i) => i.severity === "warning").length,
    massKg: r.mass.totalKg,
    generationKw: r.power.generationKw,
    storageKwh: r.power.storageKwh,
    cruiseDemandKw: cruise.demandKw,
    cruiseBalanceKw: cruise.balanceKw,
    cruiseBrownout: cruise.brownout,
    combatDemandKw: combat.demandKw,
    combatBalanceKw: combat.balanceKw,
    combatBrownout: combat.brownout,
    combatBatteryEnduranceS: none(combat.batteryEnduranceS),
    cruiseHeatBalanceKw: r.heat.modes.cruise.balanceKw,
    combatHeatBalanceKw: r.heat.modes.combat.balanceKw,
    combatOverheatS: none(r.heat.modes.combat.timeToOverheatS),
    coolantSupplyLps: r.coolant.supplyLps,
    coolantDemandLps: r.coolant.demandLps,
    fuelCapacityL: r.fuel.capacityL,
    fuelLoadedL: r.fuel.loadedL,
    cruiseFuelEnduranceS: none(r.fuel.modes.cruise.enduranceS),
    dataSupplyKbps: r.data.supplyKbps,
    dataDemandKbps: r.data.demandKbps,
    controlSlots: r.data.controlSlots,
    controlSlotsUsed: r.data.controlSlotsUsed,
    minimumCrew: r.crew.minimumCrew,
    lifeSupportCrew: r.crew.lifeSupportCrew,
    oxygenReserveHours: none(r.crew.oxygenReserveHours),
    forwardKn: r.propulsion.forwardKn,
    forwardAccel: r.propulsion.forwardAccel,
    damagedComponents: compiled.damaged,
    destroyedComponents: compiled.destroyed,
    reportJson: JSON.stringify(r),
    compiledMicros,
  };
}

/** The current damage conditions of a ship's placed components. */
function conditionsOf(db: Db, shipId: string): PrefabComponentCondition[] {
  const out: PrefabComponentCondition[] = [];
  for (const row of db.shipComponentDamage.by_ship.filter(shipId)) {
    if (out.length >= 1024) break;
    out.push({ objectId: row.objectId, performance: row.performance });
  }
  return out;
}

/**
 * Compile one ship now and write its row when the input changed. A ship that no longer exists (or
 * is no longer a prefab ship) loses its row. Throws only on a malformed binding.
 */
export function compileShipSystemsFor(
  ctx: Pick<Context, "db" | "timestamp">,
  shipId: string,
): "changed" | "unchanged" | "removed" {
  const db = ctx.db;
  const old = db.shipSystemsState.shipId.find(shipId);
  const instance = db.constructionInstance.id.find(shipId);
  const binding =
    instance && db.ship.id.find(shipId) ? prefabBindingOf(instance) : undefined;
  if (!instance || !binding) {
    if (old) db.shipSystemsState.shipId.delete(shipId);
    return "removed";
  }
  const compiled = compilePrefabShipSystems(
    binding.doc,
    binding.catalog,
    conditionsOf(db, shipId),
  );
  if (
    old &&
    old.inputHash === compiled.inputHash &&
    old.instanceRevision === instance.revision
  )
    return "unchanged";
  const row = shipSystemsRow(
    shipId,
    instance.revision,
    binding,
    compiled,
    (old?.compileRevision ?? 0n) + 1n,
    ctx.timestamp.microsSinceUnixEpoch,
  );
  if (old) db.shipSystemsState.shipId.update(row);
  else db.shipSystemsState.insert(row);
  return "changed";
}

function clockOf(db: Db) {
  return (
    db.shipSystemsClock.id.find(CLOCK_ID) ??
    db.shipSystemsClock.insert({
      id: CLOCK_ID,
      compiles: 0n,
      changed: 0n,
      failed: 0n,
      deferredTicks: 0n,
      deferredShips: 0n,
      lastQueue: 0,
      lastSweepMicros: 0n,
    })
  );
}

/** Queue prefab ships whose compile is missing or older than their instance revision. */
function sweepStale(ctx: Pick<Context, "db" | "timestamp">) {
  const db = ctx.db;
  let examined = 0;
  for (const access of db.gameShipAccess.iter()) {
    if (++examined > SHIP_SYSTEMS_SWEEP_LIMIT) break;
    const shipId = access.shipId;
    if (db.shipSystemsDirty.shipId.find(shipId)) continue;
    const instance = db.constructionInstance.id.find(shipId);
    if (!instance || !db.ship.id.find(shipId)) continue;
    const state = db.shipSystemsState.shipId.find(shipId);
    if (state && state.instanceRevision === instance.revision) continue;
    if (!prefabBindingOf(instance)) continue;
    markShipSystemsDirty(ctx, shipId, state ? "refit" : "backfill");
  }
  examined = 0;
  const orphans: string[] = [];
  for (const state of db.shipSystemsState.iter()) {
    if (++examined > SHIP_SYSTEMS_SWEEP_LIMIT) break;
    if (!db.ship.id.find(state.shipId)) orphans.push(state.shipId);
  }
  for (const shipId of orphans) db.shipSystemsState.shipId.delete(shipId);
}

/** Scheduled step: the stale sweep (1 Hz) and at most N compiles, oldest first. Never throws. */
export function stepShipSystems(ctx: Pick<Context, "db" | "timestamp">) {
  const db = ctx.db;
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const clock = clockOf(db);
  const sweep = now - clock.lastSweepMicros >= SHIP_SYSTEMS_SWEEP_MICROS;
  if (sweep) sweepStale(ctx);
  const pending: { shipId: string }[] = [];
  for (const row of db.shipSystemsDirty.by_revision.filter(
    new Range<bigint>(),
  )) {
    pending.push(row);
    if (pending.length === SHIP_SYSTEMS_COMPILES_PER_TICK) break;
  }
  let compiles = 0n,
    changed = 0n,
    failed = 0n;
  for (const { shipId } of pending) {
    db.shipSystemsDirty.shipId.delete(shipId);
    compiles++;
    try {
      if (compileShipSystemsFor(ctx, shipId) === "changed") changed++;
    } catch {
      failed++;
    }
  }
  const remaining = Number(db.shipSystemsDirty.count());
  // Idle ticks write nothing (no queue, no sweep, nothing compiled).
  if (sweep || compiles > 0n || remaining > 0 || clock.lastQueue !== remaining)
    db.shipSystemsClock.id.update({
      ...clock,
      compiles: clock.compiles + compiles,
      changed: clock.changed + changed,
      failed: clock.failed + failed,
      deferredTicks: clock.deferredTicks + (remaining > 0 ? 1n : 0n),
      deferredShips: clock.deferredShips + BigInt(remaining),
      lastQueue: remaining,
      lastSweepMicros: sweep ? now : clock.lastSweepMicros,
    });
  return { compiled: pending.length, changed, failed, remaining };
}

// ------------------------------------------------------------------- views
const summaryColumns = {
  shipId: t.string().primaryKey(),
  /** owner | crew */
  access: t.string(),
  compileRevision: t.u64(),
  instanceRevision: t.u64(),
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
  compiledMicros: t.u64(),
};
export const shipNetworkSummaryProjection = t.row(
  "ShipNetworkSummary",
  summaryColumns,
);
export const shipSystemsReportProjection = t.row("ShipSystemsReportRow", {
  shipId: t.string().primaryKey(),
  compileRevision: t.u64(),
  instanceRevision: t.u64(),
  catalog: t.string(),
  prefabId: t.string(),
  prefabRevision: t.u32(),
  reportJson: t.string(),
});
export const shipSystemEffectsProjection = t.row("ShipSystemEffects", {
  shipId: t.string().primaryKey(),
  /** What an outsider can perceive: powered | brownout | dark */
  power: t.string(),
});

type StateRow = NonNullable<
  ReturnType<ReadContext["db"]["shipSystemsState"]["shipId"]["find"]>
>;
/** Only the summary columns: never the report, input hash or prefab identity. */
function summary(row: StateRow, access: "owner" | "crew") {
  const out: Record<string, unknown> = { access };
  for (const key of Object.keys(summaryColumns))
    if (key !== "access") out[key] = row[key as keyof StateRow];
  return out as Omit<
    StateRow,
    "catalog" | "prefabId" | "prefabRevision" | "inputHash" | "reportJson"
  > & { access: "owner" | "crew" };
}

/**
 * The actor's own ships (owner) and the ship the actor is aboard as an accepted passenger (crew).
 * Summary only; the per-component report and the damage rows stay owner-only.
 */
export function ownShipNetworks(ctx: ReadContext) {
  const out: ReturnType<typeof summary>[] = [];
  const seen = new Set<string>();
  let owned = 0;
  for (const ship of ctx.db.ship.by_owner.filter(ctx.sender)) {
    if (++owned > 64) break;
    const row = ctx.db.shipSystemsState.shipId.find(ship.id);
    if (row && !seen.has(ship.id)) {
      seen.add(ship.id);
      out.push(summary(row, "owner"));
    }
  }
  let actors = 0;
  for (const actor of ctx.db.character.by_owner.filter(ctx.sender)) {
    if (++actors > 4) break;
    if (seen.has(actor.shipId)) continue;
    const visit = ctx.db.constructionPassengerVisit.characterId.find(actor.id);
    if (!visit || visit.shipId !== actor.shipId) continue;
    if (!acceptedPassengerAccess(ctx, actor.id).readInterior) continue;
    const row = ctx.db.shipSystemsState.shipId.find(actor.shipId);
    if (row) {
      seen.add(actor.shipId);
      out.push(summary(row, "crew"));
    }
  }
  return out;
}

/** Full compiled report (per-component supply and issues) of ships the sender owns. */
export function ownShipSystemsReport(ctx: ReadContext) {
  const out = [];
  let owned = 0;
  for (const ship of ctx.db.ship.by_owner.filter(ctx.sender)) {
    if (++owned > 64) break;
    const row = ctx.db.shipSystemsState.shipId.find(ship.id);
    if (row)
      out.push({
        shipId: row.shipId,
        compileRevision: row.compileRevision,
        instanceRevision: row.instanceRevision,
        catalog: row.catalog,
        prefabId: row.prefabId,
        prefabRevision: row.prefabRevision,
        reportJson: row.reportJson,
      });
  }
  return out;
}

/** Outward effect of a compiled budget: lights on, dimmed or dark. */
export function shipPowerEffect(row: {
  generationKw: number;
  storageKwh: number;
  cruiseBrownout: boolean;
}): "powered" | "brownout" | "dark" {
  if (row.generationKw <= 0 && row.storageKwh <= 0) return "dark";
  return row.cruiseBrownout ? "brownout" : "powered";
}

/** Inspect scope: ships the viewer currently discovers, effects only (no figures). */
export function visibleShipSystemEffects(ctx: SharedViewContext) {
  const db = ctx.db as unknown as ReadContext["db"];
  return visibleShipMotion(ctx).flatMap((m) => {
    const row = db.shipSystemsState.shipId.find(m.shipId);
    return row ? [{ shipId: m.shipId, power: shipPowerEffect(row) }] : [];
  });
}
