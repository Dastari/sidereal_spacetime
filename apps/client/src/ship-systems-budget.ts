/**
 * Ship-systems budget for the Ship systems panel (S4-1).
 *
 * The server compiles the budget (`own_ship_networks`: owner and admitted crew; the full report in
 * `own_ship_systems_report`: owner only). While the server compile is pending the owner sees the
 * client estimate: the same `compilePrefabShipSystems` over the same inputs the server reads (the
 * visited construction document and the owner's `own_ship_component_damage` rows), labelled as an
 * estimate. Nothing here is authority.
 */
import {
  compilePrefabShipSystems,
  type PrefabComponentCondition,
} from "@sidereal/sim/prefab-ship-systems";
import type { ShipSystemsReport } from "@sidereal/sim/ship-systems";
import { prefabShipOf } from "./prefab-objects";

/** The summary columns the panel shows (a `ShipNetworkSummary` row or an estimate). */
export interface ShipBudget {
  status: string;
  errors: number;
  warnings: number;
  massKg: number;
  generationKw: number;
  storageKwh: number;
  cruiseDemandKw: number;
  cruiseBalanceKw: number;
  cruiseBrownout: boolean;
  combatDemandKw: number;
  combatBalanceKw: number;
  combatBrownout: boolean;
  combatHeatBalanceKw: number;
  combatOverheatS?: number;
  coolantSupplyLps: number;
  coolantDemandLps: number;
  fuelCapacityL: number;
  cruiseFuelEnduranceS?: number;
  dataSupplyKbps: number;
  dataDemandKbps: number;
  controlSlots: number;
  controlSlotsUsed: number;
  lifeSupportCrew: number;
  oxygenReserveHours?: number;
  forwardAccel: number;
  damagedComponents: number;
  destroyedComponents: number;
}

const opt = (v: number | null) => (v === null ? undefined : v);

/** Summary of a compiled report, in the server row's shape. */
export function budgetOfReport(
  r: ShipSystemsReport,
  damaged = 0,
  destroyed = 0,
): ShipBudget {
  return {
    status: r.status,
    errors: r.issues.filter((i) => i.severity === "error").length,
    warnings: r.issues.filter((i) => i.severity === "warning").length,
    massKg: r.mass.totalKg,
    generationKw: r.power.generationKw,
    storageKwh: r.power.storageKwh,
    cruiseDemandKw: r.power.modes.cruise.demandKw,
    cruiseBalanceKw: r.power.modes.cruise.balanceKw,
    cruiseBrownout: r.power.modes.cruise.brownout,
    combatDemandKw: r.power.modes.combat.demandKw,
    combatBalanceKw: r.power.modes.combat.balanceKw,
    combatBrownout: r.power.modes.combat.brownout,
    combatHeatBalanceKw: r.heat.modes.combat.balanceKw,
    combatOverheatS: opt(r.heat.modes.combat.timeToOverheatS),
    coolantSupplyLps: r.coolant.supplyLps,
    coolantDemandLps: r.coolant.demandLps,
    fuelCapacityL: r.fuel.capacityL,
    cruiseFuelEnduranceS: opt(r.fuel.modes.cruise.enduranceS),
    dataSupplyKbps: r.data.supplyKbps,
    dataDemandKbps: r.data.demandKbps,
    controlSlots: r.data.controlSlots,
    controlSlotsUsed: r.data.controlSlotsUsed,
    lifeSupportCrew: r.crew.lifeSupportCrew,
    oxygenReserveHours: opt(r.crew.oxygenReserveHours),
    forwardAccel: r.propulsion.forwardAccel,
    damagedComponents: damaged,
    destroyedComponents: destroyed,
  };
}

/** Client estimate from the visited prefab document and the owner's damage rows. */
export function estimateShipSystems(
  documentJson: string | undefined,
  damage: readonly PrefabComponentCondition[] = [],
) {
  const ship = prefabShipOf(documentJson);
  if (!ship) return undefined;
  try {
    return compilePrefabShipSystems(ship.doc, ship.catalog.revision, damage);
  } catch {
    return undefined;
  }
}

const kw = (v: number) => `${Math.round(v).toLocaleString("en-GB")} kW`;
const signedKw = (v: number) => `${v >= 0 ? "+" : "−"}${kw(Math.abs(v))}`;
function duration(s: number | undefined) {
  if (s === undefined) return "sustainable";
  if (s < 60) return `${Math.round(s)} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  return `${(s / 3600).toFixed(1)} h`;
}

/** Label/value lines, in panel order. */
export function budgetLines(b: ShipBudget): { label: string; value: string }[] {
  const lines = [
    {
      label: "Power",
      value: `${kw(b.generationKw)} generated · cruise ${signedKw(b.cruiseBalanceKw)}${b.cruiseBrownout ? " (brownout)" : ""} · combat ${signedKw(b.combatBalanceKw)}${b.combatBrownout ? " (brownout)" : ""}`,
    },
    {
      label: "Heat",
      value: `combat ${signedKw(b.combatHeatBalanceKw)} · overheat ${duration(b.combatOverheatS)}`,
    },
    {
      label: "Coolant",
      value: `${b.coolantSupplyLps.toFixed(1)} of ${b.coolantDemandLps.toFixed(1)} L/s`,
    },
    {
      label: "Fuel",
      value: `${Math.round(b.fuelCapacityL)} L · cruise ${b.cruiseFuelEnduranceS === undefined ? "no burn" : duration(b.cruiseFuelEnduranceS)}`,
    },
    {
      label: "Data",
      value: `${Math.round(b.dataDemandKbps)} of ${Math.round(b.dataSupplyKbps)} kbit/s · ${b.controlSlotsUsed}/${b.controlSlots} control slots`,
    },
    {
      label: "Life support",
      value: `${b.lifeSupportCrew} crew${b.oxygenReserveHours ? ` · ${b.oxygenReserveHours} h O₂ reserve` : ""}`,
    },
    {
      label: "Mass",
      value: `${(b.massKg / 1000).toFixed(1)} t`,
    },
  ];
  if (b.damagedComponents)
    lines.push({
      label: "Damage",
      value: `${b.damagedComponents} degraded${b.destroyedComponents ? `, ${b.destroyedComponents} destroyed` : ""}`,
    });
  return lines;
}

/** Headline: catalogue rule status (budgets only; nothing is gated on it yet). */
export function budgetStatus(b: ShipBudget) {
  if (b.status === "ok") return "All systems within budget";
  const parts = [
    b.errors ? `${b.errors} error${b.errors === 1 ? "" : "s"}` : "",
    b.warnings ? `${b.warnings} warning${b.warnings === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  return `Outside catalogue budget: ${parts.join(", ")}`;
}
