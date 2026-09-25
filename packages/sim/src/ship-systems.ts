/**
 * Pure ship-systems validation and compilation for the proposed component
 * catalog (`@sidereal/content/ship-components`).
 *
 * - Hardpoint fit: socket kind, size class, rear-only rule, orientation.
 * - Port compatibility and explicit connections (typed channels).
 * - Network budgets per mode: power (priority brownout allocation, batteries,
 *   capacitors), heat (radiators limited by pump flow, hull passive, sinks),
 *   coolant flow, fuel endurance, data bandwidth and control slots, air/crew.
 * - Summaries: mass, thrust per axis, weapons, shields, sensors, utilities.
 * - Adapters to the existing generic flight compiler
 *   (`compileFlightDefinition`) so installed engines bound performance.
 *
 * This is a design-time/authority helper, not a live resource simulation:
 * nothing here deducts fuel or energy or grants control. Callers remain
 * responsible for permission, revision and live-state checks. Deterministic
 * and bounded; inputs are never mutated.
 */
import {
  SHIP_CHANNEL_TO_SERVICE_RATE,
  SHIP_SIZE_CELLS,
  SHIP_THERMAL_MODEL,
  shipSizeRank,
  type ShipComponentCatalog,
  type ShipComponentChannel,
  type ShipComponentConnection,
  type ShipComponentDefinition,
  type ShipComponentPlacement,
  type ShipComponentPort,
  type ShipHardpoint,
  type ShipHullSystemsProfile,
  type ShipVec3,
} from "@sidereal/content/ship-components";
import type { ServicePort } from "./construction-services";
import type {
  ActuatorDefinition,
  ComputerDefinition,
  FlightCargoMass,
  FlightDefinitionCatalog,
  FlightDefinitionInput,
  FlightFitting,
  FlightHullDefinition,
  FlightPhysicalDefinition,
  FlightPlacedPart,
} from "./flight-definition";

export const SHIP_SYSTEMS_LIMITS = Object.freeze({
  components: 1024,
  connections: 4096,
  hardpoints: 1024,
});
export const SHIP_SYSTEMS_MODES = [
  "cruise",
  "combat",
  "industry",
  "peak",
] as const;
export type ShipSystemsMode = (typeof SHIP_SYSTEMS_MODES)[number];
type Load = "off" | "idle" | "active" | "peak";

export interface ShipSystemsIssue {
  code: string;
  severity: "error" | "warning" | "info";
  ids: string[];
  message: string;
}
export interface ShipSystemsInput {
  catalog: ShipComponentCatalog;
  hull: ShipHullSystemsProfile;
  components: readonly ShipComponentPlacement[];
  /** Explicit port links. Omitted: every channel is one ideal ship bus (design-time estimate). */
  connections?: readonly ShipComponentConnection[];
  /** Tank fill 0..1 (default 1). */
  fuelFraction?: number;
  /** Magazine fill 0..1 (default 1). */
  ammoFraction?: number;
  /** Allow `status: "future"` placeholders (they stay idle). */
  allowFuture?: boolean;
}
export interface ShipPowerModeReport {
  demandKw: number;
  generationKw: number;
  balanceKw: number;
  /** Seconds the batteries cover a deficit (null: no deficit). */
  batteryEnduranceS: number | null;
  /** Deficit larger than battery discharge: priority shedding applies. */
  brownout: boolean;
  /** Supplied fraction of demand per placement id (1 = fully supplied). */
  supply: Record<string, number>;
}
export interface ShipHeatModeReport {
  generatedKw: number;
  rejectionKw: number;
  balanceKw: number;
  /** Seconds until heat sinks saturate (null: sustainable). */
  timeToOverheatS: number | null;
}
export interface ShipNetworkReport {
  channel: ShipComponentChannel;
  members: string[];
  supply: number;
  demand: number;
  unit: string;
}
export interface ShipSystemsReport {
  status: "ok" | "warnings" | "invalid";
  issues: ShipSystemsIssue[];
  connectionMode: "bus" | "explicit";
  mass: {
    componentsKg: number;
    hullKg: number;
    fuelKg: number;
    ammoKg: number;
    totalKg: number;
  };
  propulsion: {
    /** Planar thrust by direction (kN), before power supply. */
    forwardKn: number;
    reverseKn: number;
    starboardKn: number;
    portKn: number;
    /** Simple thrust/mass acceleration (m/s^2) using combat power supply. */
    forwardAccel: number;
    reverseAccel: number;
    lateralAccel: number;
    thrustToMassKnPerT: number;
    mainEngines: number;
  };
  power: {
    generationKw: number;
    storageKwh: number;
    batteryDischargeKw: number;
    capacitorKj: number;
    modes: Record<ShipSystemsMode, ShipPowerModeReport>;
  };
  heat: {
    radiatorKw: number;
    pumpLimitedKw: number;
    passiveKw: number;
    sinkMj: number;
    modes: Record<ShipSystemsMode, ShipHeatModeReport>;
  };
  coolant: { supplyLps: number; demandLps: number };
  fuel: {
    capacityL: number;
    loadedL: number;
    modes: Record<ShipSystemsMode, { burnLps: number; enduranceS: number | null }>;
  };
  data: {
    supplyKbps: number;
    demandKbps: number;
    controlSlots: number;
    controlSlotsUsed: number;
  };
  crew: {
    minimumCrew: number;
    berths: number;
    lifeSupportCrew: number;
    oxygenReserveHours: number | null;
    stations: Record<string, number>;
  };
  weapons: {
    count: number;
    alphaDamage: number;
    sustainedDps: number;
    maxRangeM: number;
    ammo: {
      type: string;
      stockRounds: number;
      useRoundsPerS: number;
      sustainS: number | null;
    }[];
  };
  defense: {
    shieldHp: number;
    shieldRechargePerS: number;
    shieldRadiusM: number;
    armorPlates: number;
  };
  sensors: { maxRangeM: number; radar360: boolean; commRangeM: number };
  utility: {
    tractorForceKn: number;
    tractorRangeM: number;
    miningKgPerS: number;
    salvageKgPerS: number;
    clampMaxMassKg: number;
    drones: number;
    cargoThroughputM3PerMin: number;
    airlocks: number;
    dockingPorts: number;
    gravityAreaM2: number;
  };
  economy: { costCredits: number; buildTimeS: number };
  networks: ShipNetworkReport[];
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const sum = <T>(rows: readonly T[], f: (r: T) => number) =>
  rows.reduce((n, r) => n + f(r), 0);
const finiteVec = (v: unknown): v is ShipVec3 =>
  Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(n));

// --------------------------------------------------------------- orientation
/** Mirror part-local X (reflected), then rotate by quarter turns about +Z.
 * Same convention as `transformFlightVector`. */
export function orientShipVector(
  v: ShipVec3,
  quarterTurns: number,
  reflected: boolean,
): [number, number, number] {
  const x = reflected ? -v[0] : v[0];
  const q = ((quarterTurns % 4) + 4) % 4;
  const c = [1, 0, -1, 0][q],
    s = [0, 1, 0, -1][q];
  return [c * x - s * v[1], s * x + c * v[1], v[2]];
}
/** A port's ship-frame position and normal for a placement. */
export function placedShipPort(
  placement: ShipComponentPlacement,
  port: ShipComponentPort,
): { position: [number, number, number]; normal: [number, number, number] } {
  const p = orientShipVector(port.position, placement.quarterTurns, placement.reflected);
  return {
    position: [
      p[0] + placement.position[0],
      p[1] + placement.position[1],
      p[2] + placement.position[2],
    ],
    normal: orientShipVector(port.normal, placement.quarterTurns, placement.reflected),
  };
}

// ------------------------------------------------------------ compatibility
/** Whether `from` may feed `to`. Channels, media and connector families never
 * substitute; direction must be out/both -> in/both. */
export function shipPortsCompatible(
  from: ShipComponentPort,
  to: ShipComponentPort,
): { ok: boolean; reason: string | null; flow: number } {
  const reason =
    from.channel !== to.channel
      ? "channel-mismatch"
      : from.medium !== to.medium
        ? "medium-mismatch"
        : from.connectorFamily !== to.connectorFamily
          ? "connector-mismatch"
          : from.direction === "in"
            ? "source-is-input"
            : to.direction === "out"
              ? "target-is-output"
              : null;
  return { ok: !reason, reason, flow: reason ? 0 : Math.min(from.capacity, to.capacity) };
}

/** Hardpoint fit per the design grammar (12.8 / r006). A smaller component
 * may use a larger hardpoint (adapter plate, warning); larger never fits. */
export function fitShipComponentToHardpoint(
  definition: ShipComponentDefinition,
  hardpoint: ShipHardpoint,
): { ok: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [],
    warnings: string[] = [];
  const sockets = definition.mount.sockets;
  if (!sockets.includes(hardpoint.socket)) errors.push("socket-mismatch");
  if (definition.mount.rearOnly && hardpoint.socket !== "rear")
    errors.push("rear-only");
  const d = shipSizeRank(definition.sizeClass),
    h = shipSizeRank(hardpoint.sizeClass);
  const cells = SHIP_SIZE_CELLS[hardpoint.sizeClass];
  if (hardpoint.socket === "edge") {
    // Edge openings are measured by width: SM 2 m, MD 4 m, LG 6 m, XL 8 m.
    const width = 2 * cells;
    if (definition.mount.cells[0] > width) errors.push("edge-too-wide");
    else if (definition.mount.cells[0] < width && !errors.length)
      warnings.push("edge-narrower-than-opening");
  } else {
    if (d > h) errors.push("size-too-large");
    if (definition.mount.cells[0] > cells || definition.mount.cells[1] > cells)
      errors.push("footprint-too-large");
    if (!errors.length && d < h) warnings.push("undersized-adapter");
  }
  return { ok: errors.length === 0, errors, warnings };
}

// ------------------------------------------------------------------- modes
type Rule = "main" | "maneuver" | "weapon" | "defense" | "sensor" | "utility" | "always" | "standby";
function rule(d: ShipComponentDefinition): Rule {
  if (d.family === "propulsion")
    return d.propulsion?.role === "maneuver"
      ? "maneuver"
      : d.propulsion?.role === "main"
        ? "main"
        : "standby";
  if (d.family === "weapon") return "weapon";
  if (d.family === "defense") return "defense";
  if (d.family === "sensor") return "sensor";
  if (d.family === "utility") return "utility";
  if (d.family === "structure") return "standby";
  return "always";
}
const MODE_TABLE: Record<ShipSystemsMode, Record<Rule, Load>> = {
  cruise: { main: "active", maneuver: "active", weapon: "idle", defense: "idle", sensor: "active", utility: "idle", always: "active", standby: "idle" },
  combat: { main: "active", maneuver: "active", weapon: "active", defense: "active", sensor: "active", utility: "idle", always: "active", standby: "idle" },
  industry: { main: "idle", maneuver: "active", weapon: "idle", defense: "idle", sensor: "active", utility: "active", always: "active", standby: "idle" },
  peak: { main: "peak", maneuver: "peak", weapon: "peak", defense: "peak", sensor: "peak", utility: "peak", always: "peak", standby: "peak" },
};
/** Load of a placed component in a mode. In cruise only forward-pushing main
 * engines burn; retro/lateral main engines idle (combat manoeuvres use all). */
function loadOf(
  d: ShipComponentDefinition,
  mode: ShipSystemsMode,
  p?: ShipComponentPlacement,
): Load {
  if (d.status === "future") return "idle";
  if (mode === "cruise" && p && d.propulsion?.role === "main") {
    const [, fy] = orientShipVector([0, 1, 0], p.quarterTurns, p.reflected);
    if (fy <= 0.5) return "idle";
  }
  return MODE_TABLE[mode][rule(d)];
}
const pick = (v: { idleKw: number; activeKw: number; peakKw: number }, l: Load) =>
  l === "off" ? 0 : l === "idle" ? v.idleKw : l === "active" ? v.activeKw : v.peakKw;
/** Lower value = supplied first under brownout. */
function priority(d: ShipComponentDefinition): number {
  if (d.family === "interior") return 0;
  if (d.family === "thermal" || d.family === "structure" || d.family === "ammunition" || d.family === "power") return 1;
  if (d.family === "sensor") return 2;
  if (d.family === "defense") return 3;
  if (d.family === "propulsion") return 4;
  if (d.family === "weapon") return 5;
  return 6;
}

// ---------------------------------------------------------------- networks
class UnionFind {
  parent = new Map<string, string>();
  find(a: string): string {
    let p = this.parent.get(a) ?? a;
    if (p !== a) {
      p = this.find(p);
      this.parent.set(a, p);
    }
    return p;
  }
  join(a: string, b: string) {
    const x = this.find(a),
      y = this.find(b);
    if (x !== y) this.parent.set(x < y ? y : x, x < y ? x : y);
  }
}
interface Resolved {
  p: ShipComponentPlacement;
  d: ShipComponentDefinition;
}
const hasPort = (d: ShipComponentDefinition, ch: ShipComponentChannel, dir: "in" | "out") =>
  d.ports.some((p) => p.channel === ch && (p.direction === dir || p.direction === "both"));

// ------------------------------------------------------------------ compile
export function compileShipSystems(input: ShipSystemsInput): ShipSystemsReport {
  const issues: ShipSystemsIssue[] = [];
  const issue = (
    severity: ShipSystemsIssue["severity"],
    code: string,
    ids: string[],
    message: string,
  ) => issues.push({ severity, code, ids: [...ids].sort(order), message });
  const components = input.components ?? [];
  const connections = input.connections;
  const hull = input.hull;
  if (
    !Array.isArray(components) ||
    components.length > SHIP_SYSTEMS_LIMITS.components ||
    (connections && connections.length > SHIP_SYSTEMS_LIMITS.connections) ||
    !hull ||
    !Array.isArray(hull.hardpoints) ||
    hull.hardpoints.length > SHIP_SYSTEMS_LIMITS.hardpoints
  )
    throw new Error("Ship systems input budget exceeded");
  if (!(hull.massKg >= 0) || !(hull.lengthM > 0) || !(hull.beamM > 0))
    issue("error", "invalid-hull", [String(hull.id)], "Hull mass/length/beam invalid");
  const fuelFraction = Math.min(1, Math.max(0, input.fuelFraction ?? 1));
  const ammoFraction = Math.min(1, Math.max(0, input.ammoFraction ?? 1));
  const defs = new Map(input.catalog.components.map((c) => [c.id, c]));

  // Resolve placements.
  const resolved: Resolved[] = [];
  const seen = new Set<string>();
  for (const p of [...components].sort((a, b) => order(a.id, b.id))) {
    if (!p || typeof p.id !== "string" || !p.id || seen.has(p.id)) {
      issue("error", "duplicate-or-invalid-placement", [String(p?.id)], "Placement ids must be unique non-empty strings");
      continue;
    }
    seen.add(p.id);
    const d = defs.get(p.componentId);
    if (!d) {
      issue("error", "unknown-component", [p.id], `Unknown component ${p.componentId}`);
      continue;
    }
    if (
      !finiteVec(p.position) ||
      ![0, 1, 2, 3].includes(p.quarterTurns) ||
      typeof p.reflected !== "boolean"
    ) {
      issue("error", "invalid-placement", [p.id], "Position/orientation invalid");
      continue;
    }
    if (d.status === "future" && !input.allowFuture)
      issue("error", "future-component", [p.id], `${d.id} is a future placeholder`);
    resolved.push({ p, d });
  }

  // Hardpoints.
  const hardpoints = new Map(hull.hardpoints.map((h) => [h.id, h]));
  const occupied = new Map<string, string>();
  for (const { p, d } of resolved) {
    const interiorOk = d.mount.sockets.includes("interior");
    if (!p.hardpointId) {
      if (!interiorOk && hull.hardpoints.length)
        issue("error", "missing-hardpoint", [p.id], `${d.id} needs a ${d.mount.sockets.join("/")} hardpoint`);
      continue;
    }
    const h = hardpoints.get(p.hardpointId);
    if (!h) {
      issue("error", "unknown-hardpoint", [p.id], `Unknown hardpoint ${p.hardpointId}`);
      continue;
    }
    const prior = occupied.get(h.id);
    if (prior) issue("error", "hardpoint-occupied", [prior, p.id], `Hardpoint ${h.id} holds two components`);
    occupied.set(h.id, p.id);
    const fit = fitShipComponentToHardpoint(d, h);
    for (const e of fit.errors) issue("error", e, [p.id], `${d.id} on ${h.id} (${h.socket} ${h.sizeClass})`);
    for (const w of fit.warnings) issue("warning", w, [p.id], `${d.id} (${d.sizeClass}) on a ${h.sizeClass} hardpoint`);
    if (
      p.position.some((v, i) => Math.abs(v - h.position[i]) > 1e-6) ||
      p.quarterTurns !== h.quarterTurns ||
      p.reflected !== h.reflected
    )
      issue("error", "hardpoint-transform-mismatch", [p.id], `Placement must use hardpoint ${h.id}'s position and orientation`);
  }

  // Connections and networks.
  const byId = new Map(resolved.map((r) => [r.p.id, r]));
  const explicit = Array.isArray(connections);
  const uf = new Map<ShipComponentChannel, UnionFind>();
  const connected = new Set<string>(); // placement:port
  if (explicit) {
    const inputs = new Set<string>();
    const connIds = new Set<string>();
    for (const c of [...connections!].sort((a, b) => order(a.id, b.id))) {
      if (connIds.has(c.id)) issue("error", "duplicate-connection", [c.id], "Duplicate connection id");
      connIds.add(c.id);
      const a = byId.get(c.from?.placementId),
        b = byId.get(c.to?.placementId);
      const pa = a?.d.ports.find((x) => x.id === c.from.portId),
        pb = b?.d.ports.find((x) => x.id === c.to.portId);
      if (!a || !b || !pa || !pb || a === b) {
        issue("error", "connection-endpoint", [c.id], "Connection needs two distinct existing ports");
        continue;
      }
      const compat = shipPortsCompatible(pa, pb);
      if (!compat.ok || pa.channel !== c.channel) {
        issue("error", "incompatible-ports", [c.id], compat.reason ?? "channel-mismatch");
        continue;
      }
      const key = `${b.p.id}:${pb.id}`;
      if (pb.direction === "in" && inputs.has(key))
        issue("error", "duplicate-input", [c.id], `${key} already has a feeder`);
      inputs.add(key);
      connected.add(`${a.p.id}:${pa.id}`);
      connected.add(key);
      if (!uf.has(c.channel)) uf.set(c.channel, new UnionFind());
      uf.get(c.channel)!.join(a.p.id, b.p.id);
    }
    for (const { p, d } of resolved)
      for (const port of d.ports)
        if (port.direction !== "out" && !port.id.startsWith("shore-") && port.channel !== "ammo" && !connected.has(`${p.id}:${port.id}`))
          issue(
            port.channel === "ventilation" ? "warning" : "error",
            "unconnected-port",
            [p.id],
            `${d.id} ${port.id} (${port.channel}) has no connection`,
          );
  }
  const island = (ch: ShipComponentChannel, id: string) =>
    explicit ? (uf.get(ch)?.find(id) ?? id) : "bus";

  // Mass.
  const componentsKg = sum(resolved, (r) => r.d.massKg);
  const capacityL = sum(resolved, (r) => r.d.fluids.fuelCapacityL);
  const loadedL = capacityL * fuelFraction;
  const fuelKg = loadedL * SHIP_THERMAL_MODEL.fuelKgPerL;
  const ammoKg = sum(resolved, (r) => r.d.magazine?.capacityKg ?? 0) * ammoFraction;
  const totalKg = componentsKg + hull.massKg + fuelKg + ammoKg;

  // Power per mode, per island, with priority brownout allocation.
  const powerModes = {} as Record<ShipSystemsMode, ShipPowerModeReport>;
  const storageKwh = sum(resolved, (r) => (r.d.kind === "battery" ? r.d.power.storageKwh : 0));
  const batteryDischargeKw = sum(resolved, (r) => (r.d.kind === "battery" ? r.d.power.maxDischargeKw : 0));
  const capacitorKj = sum(resolved, (r) => (r.d.kind === "capacitor" ? r.d.power.storageKwh * 3600 : 0));
  const generationKw = sum(resolved, (r) => r.d.power.generationKw);
  const reactorLoad = {} as Record<ShipSystemsMode, number>;
  for (const mode of SHIP_SYSTEMS_MODES) {
    const groups = new Map<string, Resolved[]>();
    for (const r of resolved) {
      const k = island("power", r.p.id);
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    const supply: Record<string, number> = {};
    let demand = 0,
      deficitTotal = 0,
      brownout = false,
      used = 0;
    for (const [, members] of [...groups].sort(([a], [b]) => order(a, b))) {
      const gen = sum(members, (r) => r.d.power.generationKw);
      const bat = sum(members, (r) => (r.d.kind === "battery" ? r.d.power.maxDischargeKw : 0));
      const loads = members
        .filter((r) => hasPort(r.d, "power", "in"))
        .map((r) => ({ r, kw: pick(r.d.power, loadOf(r.d, mode, r.p)) }));
      const need = sum(loads, (l) => l.kw);
      demand += need;
      const deficit = Math.max(0, need - gen);
      deficitTotal += deficit;
      if (deficit > bat + 1e-9) brownout = true;
      let available = gen + Math.min(bat, deficit);
      used += Math.min(need, gen);
      for (const l of loads.sort((a, b) => priority(a.r.d) - priority(b.r.d) || order(a.r.p.id, b.r.p.id))) {
        const give = Math.min(l.kw, available);
        available -= give;
        supply[l.r.p.id] = l.kw > 0 ? r2(give / l.kw) : available > 0 || gen > 0 ? 1 : 0;
      }
      if (explicit && gen === 0 && bat === 0)
        for (const l of loads) supply[l.r.p.id] = 0;
    }
    reactorLoad[mode] = generationKw > 0 ? Math.min(1, used / generationKw) : 0;
    powerModes[mode] = {
      demandKw: r2(demand),
      generationKw: r2(generationKw),
      balanceKw: r2(generationKw - demand),
      batteryEnduranceS: deficitTotal > 0 ? (storageKwh > 0 ? Math.round((storageKwh * 3600) / deficitTotal) : 0) : null,
      brownout,
      supply,
    };
  }
  if (!generationKw && resolved.some((r) => r.d.power.peakKw > 0))
    issue("error", "no-power-generation", [], "Components need power but nothing generates it");
  if (powerModes.cruise.brownout)
    issue("error", "power-brownout-cruise", [], `Cruise demand ${powerModes.cruise.demandKw} kW exceeds generation and batteries`);
  else if (powerModes.combat.brownout)
    issue("warning", "power-brownout-combat", [], `Combat demand ${powerModes.combat.demandKw} kW exceeds generation and batteries; low-priority loads shed`);
  else if (powerModes.combat.balanceKw < 0)
    issue("info", "power-battery-combat", [], `Combat runs on batteries for ${powerModes.combat.batteryEnduranceS} s`);

  // Heat.
  const radiatorKw = sum(resolved, (r) => r.d.heat.rejectionKw);
  const pumpLps = sum(resolved, (r) => r.d.fluids.coolantSupplyLps);
  const pumpLimitedKw = Math.min(radiatorKw, pumpLps * SHIP_THERMAL_MODEL.coolantKwPerLps);
  const sinkMj = sum(resolved, (r) => r.d.heat.storageMj);
  const passiveKw = hull.passiveHeatRejectionKw;
  const heatModes = {} as Record<ShipSystemsMode, ShipHeatModeReport>;
  for (const mode of SHIP_SYSTEMS_MODES) {
    const generated = sum(resolved, (r) => {
      if (r.d.power.generationKw > 0 && r.d.kind === "reactor")
        return r.d.heat.idleKw + (pick(r.d.heat, mode === "peak" ? "peak" : "active") - r.d.heat.idleKw) * reactorLoad[mode];
      const f = powerModes[mode].supply[r.p.id] ?? 1;
      return pick(r.d.heat, loadOf(r.d, mode, r.p)) * (hasPort(r.d, "power", "in") ? f : 1);
    });
    const rejection = pumpLimitedKw + passiveKw;
    const balance = rejection - generated;
    heatModes[mode] = {
      generatedKw: r2(generated),
      rejectionKw: r2(rejection),
      balanceKw: r2(balance),
      timeToOverheatS: balance < 0 ? Math.round((sinkMj * 1000) / -balance) : null,
    };
  }
  if (radiatorKw > pumpLps * SHIP_THERMAL_MODEL.coolantKwPerLps + 1e-9)
    issue("warning", "radiators-pump-limited", [], `Pumps move ${r2(pumpLps)} L/s: only ${r2(pumpLimitedKw)} of ${r2(radiatorKw)} kW radiator capacity is usable`);
  if (heatModes.cruise.balanceKw < 0)
    issue("error", "heat-cruise-unsustainable", [], `Cruise heat exceeds rejection by ${-heatModes.cruise.balanceKw} kW`);
  if (heatModes.combat.balanceKw < 0)
    issue(
      heatModes.combat.timeToOverheatS && heatModes.combat.timeToOverheatS >= 120 ? "info" : "warning",
      "heat-combat-limited",
      [],
      `Combat overheats in ${heatModes.combat.timeToOverheatS} s`,
    );
  const coolantDemand = sum(resolved, (r) => r.d.fluids.coolantDemandLps);
  if (coolantDemand > pumpLps + 1e-9)
    issue("warning", "coolant-shortfall", [], `Coolant demand ${r2(coolantDemand)} L/s exceeds pump supply ${r2(pumpLps)} L/s`);

  // Fuel.
  const fuelModes = {} as ShipSystemsReport["fuel"]["modes"];
  for (const mode of SHIP_SYSTEMS_MODES) {
    const burn = sum(resolved, (r) => {
      const l = loadOf(r.d, mode, r.p);
      if (r.d.kind === "reactor")
        return r.d.fluids.fuelIdleLps + (r.d.fluids.fuelActiveLps - r.d.fluids.fuelIdleLps) * reactorLoad[mode];
      const f = powerModes[mode].supply[r.p.id] ?? 1;
      return (l === "idle" || l === "off" ? r.d.fluids.fuelIdleLps : r.d.fluids.fuelActiveLps) * f;
    });
    fuelModes[mode] = { burnLps: Math.round(burn * 1e4) / 1e4, enduranceS: burn > 0 ? Math.round(loadedL / burn) : null };
  }
  if (resolved.some((r) => r.d.fluids.fuelActiveLps > 0) && capacityL === 0)
    issue("error", "no-fuel-storage", [], "Fuel burners installed without a fuel tank");

  // Data and control.
  const supplyKbps = sum(resolved, (r) => r.d.data.supplyKbps);
  const demandKbps = sum(resolved, (r) => r.d.data.demandKbps);
  const slots = sum(resolved, (r) => r.d.data.controlSlots);
  const slotsUsed = sum(resolved, (r) => r.d.data.controlSlotsUsed);
  const cores = resolved.filter((r) => r.d.kind === "computer-core");
  if (resolved.some((r) => r.d.crew.automation === "computer") && !cores.length)
    issue("error", "no-computer-core", [], "Computer-controlled components need a powered computer core");
  if (demandKbps > supplyKbps && cores.length)
    issue("warning", "data-bandwidth-exceeded", [], `Data demand ${demandKbps} kbit/s exceeds ${supplyKbps}`);
  if (slotsUsed > slots && cores.length)
    issue("error", "control-slots-exceeded", [], `${slotsUsed} control slots used, ${slots} available`);

  // Crew and stations.
  const stations: Record<string, number> = {};
  for (const r of resolved)
    if (r.d.control) stations[r.d.crew.station ?? r.d.control.grants] = (stations[r.d.crew.station ?? r.d.control.grants] ?? 0) + r.d.control.seats;
  const manual: Record<string, number> = {};
  for (const r of resolved)
    if (!r.d.control && r.d.crew.automation === "manual" && r.d.crew.station)
      manual[r.d.crew.station] = (manual[r.d.crew.station] ?? 0) + r.d.crew.operators;
  for (const [role, n] of Object.entries(manual))
    if (!stations[role])
      issue("error", "missing-station", resolved.filter((r) => !r.d.control && r.d.crew.station === role && r.d.crew.automation === "manual").map((r) => r.p.id), `Manual ${role} components need a ${role} console`);
  if (resolved.some((r) => r.d.propulsion && r.d.propulsion.thrustKn > 0) && !stations.pilot)
    issue("error", "no-pilot-station", [], "A navigation console (pilot station) is required to fly");
  const stationCrew = sum(Object.values(stations), (n) => n);
  const minimumCrew =
    stationCrew + sum(Object.entries(manual), ([role, n]) => Math.max(0, n - (stations[role] ?? 0)));
  const berths = sum(resolved, (r) => r.d.crew.berths);
  const lifeSupportCrew = sum(resolved, (r) => r.d.fluids.crewSupported);
  const reserveHours = sum(resolved, (r) => r.d.fluids.reserveCrewHours);
  if (minimumCrew > 0 && lifeSupportCrew < Math.max(minimumCrew, berths))
    issue(lifeSupportCrew < minimumCrew ? "error" : "warning", "life-support-short", [], `Life support for ${lifeSupportCrew}, crew ${minimumCrew}, berths ${berths}`);
  if (berths < minimumCrew)
    issue("warning", "berths-short", [], `${berths} berths for a minimum crew of ${minimumCrew}`);

  // Weapons.
  const weapons = resolved.filter((r) => r.d.weapon);
  const combat = powerModes.combat.supply;
  const alphaDamage = sum(weapons, (r) => r.d.weapon!.damagePerShot * r.d.weapon!.projectilesPerShot);
  const sustainedDps = sum(
    weapons,
    (r) => (r.d.weapon!.damagePerShot * r.d.weapon!.projectilesPerShot * r.d.weapon!.shotsPerMinute * (combat[r.p.id] ?? 1)) / 60,
  );
  const ammoTypes = new Map(input.catalog.ammoTypes.map((a) => [a.id, a]));
  const use = new Map<string, number>();
  for (const r of weapons)
    if (r.d.weapon!.ammoType)
      use.set(r.d.weapon!.ammoType, (use.get(r.d.weapon!.ammoType) ?? 0) + (r.d.weapon!.roundsPerShot * r.d.weapon!.shotsPerMinute) / 60);
  const magazines = resolved.filter((r) => r.d.magazine);
  const ammo: ShipSystemsReport["weapons"]["ammo"] = [];
  for (const cls of ["ballistic", "missile", "torpedo"] as const) {
    const types = [...use].filter(([t]) => ammoTypes.get(t)?.ammoClass === cls).sort(([a], [b]) => order(a, b));
    if (!types.length) continue;
    const stockKg = sum(magazines.filter((m) => m.d.magazine!.ammoClass === cls), (m) => m.d.magazine!.capacityKg) * ammoFraction;
    const kgRate = sum(types, ([t, rate]) => rate * ammoTypes.get(t)!.massKgPerRound);
    for (const [t, rate] of types) {
      const kgPerRound = ammoTypes.get(t)!.massKgPerRound;
      const shareKg = kgRate > 0 ? (stockKg * rate * kgPerRound) / kgRate : 0;
      const stockRounds = Math.floor(shareKg / kgPerRound + 1e-9);
      ammo.push({ type: t, stockRounds, useRoundsPerS: r2(rate), sustainS: rate > 0 ? Math.round(stockRounds / rate) : null });
      if (!stockRounds)
        issue("error", "no-magazine", weapons.filter((r) => r.d.weapon!.ammoType === t).map((r) => r.p.id), `No ${cls} magazine stock for ${t}`);
    }
    const feed = sum(magazines.filter((m) => m.d.magazine!.ammoClass === cls), (m) => m.d.ports.find((p) => p.channel === "ammo")?.capacity ?? 0);
    const need = sum(types, ([, rate]) => rate);
    if (feed > 0 && feed + 1e-9 < need)
      issue("warning", "ammo-feed-limited", [], `${cls} magazines feed ${feed} rounds/s, weapons use ${r2(need)}`);
  }
  const pulseKj = sum(weapons, (r) => r.d.weapon!.capacitorKjPerShot);
  if (pulseKj > capacitorKj + 1e-9)
    issue("error", "capacitor-too-small", weapons.filter((r) => r.d.weapon!.capacitorKjPerShot > 0).map((r) => r.p.id), `Pulse weapons need ${pulseKj} kJ of capacitors, ${capacitorKj} installed`);

  // Defense.
  const generators = resolved.filter((r) => r.d.shield?.role === "generator");
  const emitters = resolved.filter((r) => r.d.shield?.role === "emitter");
  const shieldRadius = Math.max(0, ...emitters.map((r) => r.d.shield!.radiusM));
  if (generators.length && !emitters.length)
    issue("error", "shield-without-emitter", generators.map((r) => r.p.id), "Shield generators need an emitter");
  if (emitters.length && !generators.length)
    issue("warning", "emitter-without-generator", emitters.map((r) => r.p.id), "Shield emitters without a generator do nothing");
  if (generators.length && emitters.length && shieldRadius < hull.lengthM / 2)
    issue("warning", "shield-bubble-small", [], `Shield bubble ${shieldRadius} m does not cover half-length ${hull.lengthM / 2} m`);

  // Sensors and utility.
  const sensors = resolved.filter((r) => r.d.sensor);
  const tools = resolved.filter((r) => r.d.tool);
  const toolSum = (k: string, f: (t: NonNullable<ShipComponentDefinition["tool"]>) => number) =>
    sum(tools.filter((r) => r.d.tool!.kind === k), (r) => f(r.d.tool!));
  const toolMax = (k: string, f: (t: NonNullable<ShipComponentDefinition["tool"]>) => number) =>
    Math.max(0, ...tools.filter((r) => r.d.tool!.kind === k).map((r) => f(r.d.tool!)));

  // Propulsion: planar thrust by direction (future/vertical/jump excluded).
  const thrusters = resolved.filter(
    (r) => r.d.propulsion && r.d.status !== "future" && (r.d.propulsion.role === "main" || r.d.propulsion.role === "maneuver"),
  );
  let fwd = 0,
    rev = 0,
    stb = 0,
    prt = 0,
    fwdSupplied = 0,
    revSupplied = 0,
    latSupplied = 0;
  for (const r of thrusters) {
    const [fx, fy] = orientShipVector([0, 1, 0], r.p.quarterTurns, r.p.reflected);
    const t = r.d.propulsion!.thrustKn;
    const f = combat[r.p.id] ?? 1;
    if (fy > 0.5) (fwd += t), (fwdSupplied += t * f);
    if (fy < -0.5) (rev += t), (revSupplied += t * f);
    if (fx > 0.5) (stb += t), (latSupplied += t * f * 0.5);
    if (fx < -0.5) (prt += t), (latSupplied += t * f * 0.5);
  }
  const tonnes = totalKg / 1000;

  // Networks (reported per channel island).
  const networks: ShipNetworkReport[] = [];
  const channelRates: [ShipComponentChannel, (d: ShipComponentDefinition) => [number, number], string][] = [
    ["power", (d) => [d.power.generationKw + (d.kind === "battery" ? d.power.maxDischargeKw : 0), d.power.activeKw], "kW"],
    ["coolant", (d) => [d.fluids.coolantSupplyLps, d.fluids.coolantDemandLps], "L/s"],
    ["fuel", (d) => [d.ports.find((p) => p.id === "fuel-out")?.capacity ?? 0, d.fluids.fuelActiveLps], "L/s"],
    ["data", (d) => [d.data.supplyKbps, d.data.demandKbps], "kbit/s"],
    ["ventilation", (d) => [d.fluids.airSupplyM3s, d.ports.find((p) => p.id === "air-in")?.capacity ?? 0], "m3/s"],
  ];
  for (const [ch, rate, unit] of channelRates) {
    const groups = new Map<string, Resolved[]>();
    for (const r of resolved.filter((x) => x.d.ports.some((p) => p.channel === ch))) {
      const k = island(ch, r.p.id);
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    for (const [, members] of [...groups].sort(([a], [b]) => order(a, b))) {
      const supply = sum(members, (r) => rate(r.d)[0]),
        demand = sum(members, (r) => rate(r.d)[1]);
      networks.push({ channel: ch, members: members.map((r) => r.p.id), supply: r2(supply), demand: r2(demand), unit });
      if (explicit && demand > 0 && supply === 0)
        issue("error", "network-without-supply", members.map((r) => r.p.id), `${ch} network has consumers but no supply`);
    }
  }

  issues.sort((a, b) => order(a.severity, b.severity) || order(a.code, b.code) || order(a.ids.join(","), b.ids.join(",")));
  const status = issues.some((i) => i.severity === "error")
    ? "invalid"
    : issues.some((i) => i.severity === "warning")
      ? "warnings"
      : "ok";
  return {
    status,
    issues,
    connectionMode: explicit ? "explicit" : "bus",
    mass: {
      componentsKg: r2(componentsKg),
      hullKg: r2(hull.massKg),
      fuelKg: r2(fuelKg),
      ammoKg: r2(ammoKg),
      totalKg: r2(totalKg),
    },
    propulsion: {
      forwardKn: r2(fwd),
      reverseKn: r2(rev),
      starboardKn: r2(stb),
      portKn: r2(prt),
      forwardAccel: tonnes > 0 ? r2(fwdSupplied / tonnes) : 0,
      reverseAccel: tonnes > 0 ? r2(revSupplied / tonnes) : 0,
      lateralAccel: tonnes > 0 ? r2(latSupplied / tonnes) : 0,
      thrustToMassKnPerT: tonnes > 0 ? r2(fwd / tonnes) : 0,
      mainEngines: thrusters.filter((r) => r.d.propulsion!.role === "main").length,
    },
    power: {
      generationKw: r2(generationKw),
      storageKwh: r2(storageKwh),
      batteryDischargeKw: r2(batteryDischargeKw),
      capacitorKj: r2(capacitorKj),
      modes: powerModes,
    },
    heat: {
      radiatorKw: r2(radiatorKw),
      pumpLimitedKw: r2(pumpLimitedKw),
      passiveKw: r2(passiveKw),
      sinkMj: r2(sinkMj),
      modes: heatModes,
    },
    coolant: { supplyLps: r2(pumpLps), demandLps: r2(coolantDemand) },
    fuel: { capacityL: r2(capacityL), loadedL: r2(loadedL), modes: fuelModes },
    data: { supplyKbps, demandKbps, controlSlots: slots, controlSlotsUsed: slotsUsed },
    crew: {
      minimumCrew,
      berths,
      lifeSupportCrew,
      oxygenReserveHours: minimumCrew > 0 ? r2(reserveHours / minimumCrew) : null,
      stations,
    },
    weapons: {
      count: weapons.length,
      alphaDamage: r2(alphaDamage),
      sustainedDps: r2(sustainedDps),
      maxRangeM: Math.max(0, ...weapons.map((r) => r.d.weapon!.rangeM)),
      ammo,
    },
    defense: {
      shieldHp: sum(generators, (r) => r.d.shield!.capacityHp),
      shieldRechargePerS: r2(sum(generators, (r) => r.d.shield!.rechargePerS * (combat[r.p.id] ?? 1))),
      shieldRadiusM: shieldRadius,
      armorPlates: resolved.filter((r) => r.d.armor).length,
    },
    sensors: {
      maxRangeM: Math.max(0, ...sensors.filter((r) => r.d.sensor!.kind !== "relay").map((r) => r.d.sensor!.rangeM)),
      radar360: sensors.some((r) => r.d.sensor!.kind === "radar"),
      commRangeM: Math.max(0, ...sensors.map((r) => r.d.sensor!.commRangeM)),
    },
    utility: {
      tractorForceKn: toolSum("tractor", (t) => t.forceKn),
      tractorRangeM: toolMax("tractor", (t) => t.rangeM),
      miningKgPerS: r2(toolSum("mining", (t) => t.rateKgPerS)),
      salvageKgPerS: r2(toolSum("salvage", (t) => t.rateKgPerS)),
      clampMaxMassKg: toolMax("clamp", (t) => t.maxTargetMassKg),
      drones: toolSum("drone-bay", (t) => t.drones),
      cargoThroughputM3PerMin: r2(sum(resolved.filter((r) => r.d.access?.kind === "cargo-door"), (r) => r.d.access!.throughputM3PerMin)),
      airlocks: resolved.filter((r) => r.d.access?.kind === "airlock").length,
      dockingPorts: resolved.filter((r) => r.d.access?.kind === "docking-port").length,
      gravityAreaM2: sum(resolved, (r) => r.d.gravity?.areaM2 ?? 0),
    },
    economy: {
      costCredits: sum(resolved, (r) => r.d.economy.costCredits),
      buildTimeS: sum(resolved, (r) => r.d.economy.buildTimeS),
    },
    networks,
  };
}

// ------------------------------------------------------------ flight adapter
export const shipComponentFlightId = (componentId: string) => `component:${componentId}`;
const hullFlightId = (hullId: string) => `hull:${hullId}`;
const envelopeCentre = (d: ShipComponentDefinition): [number, number] => {
  const [lo, hi] = d.mount.envelopeM;
  return [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2];
};
const planarInertia = (m: number, w: number, l: number) => (m * (w * w + l * l)) / 12;

/** Physical definitions for the generic flight compiler. Planar main and
 * maneuver thrusters become actuators (force along part +Y, nozzle at the
 * outer -Y end); computer cores become flight computers; everything else is
 * mass. Future placeholders are excluded. Includes the hull as one mass. */
export function shipComponentFlightCatalog(
  catalog: ShipComponentCatalog,
  hull: ShipHullSystemsProfile,
): FlightDefinitionCatalog {
  const definitions: FlightPhysicalDefinition[] = [];
  for (const d of catalog.components) {
    if (d.status === "future") continue;
    const [lo, hi] = d.mount.envelopeM;
    const base = {
      id: shipComponentFlightId(d.id),
      revision: d.revision,
      massKg: d.massKg,
      centroid: envelopeCentre(d),
      inertiaKgM2: r2(planarInertia(d.massKg, hi[0] - lo[0], hi[1] - lo[1])),
    };
    if (d.propulsion && (d.propulsion.role === "main" || d.propulsion.role === "maneuver") && d.propulsion.thrustKn > 0) {
      const a: ActuatorDefinition = {
        ...base,
        kind: "actuator",
        fittingDefinitionId: d.id,
        maxThrustN: d.propulsion.thrustKn * 1000,
        forceAxis: [0, 1],
        mountOffset: [0, 0],
        nozzleOffset: [0, lo[1]],
        nozzleHeight: (lo[2] + hi[2]) / 2,
      };
      definitions.push(a);
    } else if (d.kind === "computer-core") {
      const c: ComputerDefinition = {
        ...base,
        kind: "computer",
        fittingDefinitionId: d.id,
        requiredPowerW: d.power.activeKw * 1000,
      };
      definitions.push(c);
    } else definitions.push({ ...base, kind: `ship-${d.family}` });
  }
  definitions.push({
    id: hullFlightId(hull.id),
    revision: 1,
    kind: "ship-hull",
    massKg: hull.massKg,
    centroid: [0, 0],
    inertiaKgM2: r2(planarInertia(hull.massKg, hull.beamM, hull.lengthM)),
  });
  return { id: `${catalog.id}.${hull.id}`, revision: catalog.revision, definitions };
}

export function shipComponentFlightHull(hull: ShipHullSystemsProfile): FlightHullDefinition {
  const radius = hull.beamM / 2;
  return {
    id: `${hull.id}-capsule`,
    revision: 1,
    radius,
    halfLength: Math.max(0, hull.lengthM / 2 - radius),
    center: [0, 0],
  };
}

/** Flight compiler input for a fitted ship. Actuator supply comes from the
 * power allocation of `mode` in `report`; fuel and magazine contents are
 * cargo masses at their containers. Crew masses are left to the caller. */
export function shipComponentFlightInput(
  input: ShipSystemsInput,
  report: ShipSystemsReport,
  mode: ShipSystemsMode = "combat",
): FlightDefinitionInput {
  const defs = new Map(input.catalog.components.map((c) => [c.id, c]));
  const catalog = shipComponentFlightCatalog(input.catalog, input.hull);
  const parts: FlightPlacedPart[] = [
    {
      id: "hull",
      definitionId: hullFlightId(input.hull.id),
      revision: 1,
      position: [0, 0, 0],
      rotation: 0,
      flipped: false,
    },
  ];
  const fittings: FlightFitting[] = [];
  const supply: Record<string, number> = {};
  const cargo: FlightCargoMass[] = [];
  const fuelFraction = Math.min(1, Math.max(0, input.fuelFraction ?? 1));
  const ammoFraction = Math.min(1, Math.max(0, input.ammoFraction ?? 1));
  for (const p of [...input.components].sort((a, b) => order(a.id, b.id))) {
    const d = defs.get(p.componentId);
    if (!d || d.status === "future") continue;
    parts.push({
      id: p.id,
      definitionId: shipComponentFlightId(d.id),
      revision: d.revision,
      position: [...p.position],
      rotation: (p.quarterTurns * Math.PI) / 2,
      flipped: p.reflected,
    });
    const flightDef = catalog.definitions.find((x) => x.id === shipComponentFlightId(d.id));
    const fraction = report.power.modes[mode].supply[p.id] ?? 1;
    if (flightDef?.kind === "actuator" || flightDef?.kind === "computer") {
      const fitId = `fit:${p.id}`;
      fittings.push({
        id: fitId,
        placedObjectId: p.id,
        definitionId: d.id,
        definitionRevision: d.revision,
        installed: true,
        powered: fraction > 0,
        availability: 1,
      });
      if (flightDef.kind === "actuator") supply[fitId] = Math.min(1, Math.max(0, fraction));
    }
    const contents =
      d.fluids.fuelCapacityL * fuelFraction * SHIP_THERMAL_MODEL.fuelKgPerL +
      (d.magazine?.capacityKg ?? 0) * ammoFraction;
    if (contents > 0)
      cargo.push({ containerId: `contents:${p.id}`, massKg: r2(contents), position: [p.position[0], p.position[1]] });
  }
  return {
    parts,
    fittings,
    cargo,
    crew: [],
    catalog,
    hull: shipComponentFlightHull(input.hull),
    supply,
  };
}

// ----------------------------------------------------------- service ports
/** Converts a placed component's typed ports to construction-services ports
 * (integer 1/32 m lattice, per-second service quantities). Ammo feeds are
 * mechanical and are not routed there, so they are omitted. */
export function shipComponentServicePorts(
  placement: ShipComponentPlacement,
  definition: ShipComponentDefinition,
  location: { regionId: string; deckId: string },
): ServicePort[] {
  const out: ServicePort[] = [];
  for (const port of definition.ports) {
    const rate = SHIP_CHANNEL_TO_SERVICE_RATE[port.channel];
    if (rate === null || port.channel === "ammo") continue;
    const { position } = placedShipPort(placement, port);
    out.push({
      id: `${placement.id}:${port.id}`,
      kind: "port",
      definitionId: definition.id,
      position: position.map((v) => Math.round(v * 32)) as [number, number, number],
      regionId: location.regionId,
      deckId: location.deckId,
      channel: port.channel,
      medium: port.medium,
      connectorFamily: port.connectorFamily,
      direction: port.direction,
      capacityPerSecond: port.capacity * rate,
    });
  }
  return out;
}
