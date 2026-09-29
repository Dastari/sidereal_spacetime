/** Finite, deterministic 20 Hz power. No mutation, clock, database or catalogue globals. */
import type {
  ShipSystemsInput,
  ShipSystemsReport,
  ShipSystemsMode,
} from "./ship-systems";
import {
  degradeShipComponent,
  shipPowerDemandKw,
  shipPowerPriority,
} from "./ship-systems";

export const POWER_STEP_SECONDS = 0.05;
export interface PowerDevice {
  id: string;
  definition: string;
  alive: boolean;
  demandW: number;
  idleW: number;
  generationW: number;
  capacityJ: number;
  dischargeW: number;
  chargeW: number;
  priority: number;
}
export interface PowerDeviceState {
  id: string;
  uuid: string;
  energyJ: number;
  running: boolean;
}
export interface PowerNetworkStep {
  id: string;
  generationJ: number;
  loadJ: number;
  startupJ: number;
  dischargeJ: number;
  chargeJ: number;
  dissipatedJ: number;
  beforeJ: number;
  afterJ: number;
  brownout: boolean;
}
export interface PowerStep {
  devices: PowerDeviceState[];
  supply: Record<string, number>;
  networks: PowerNetworkStep[];
}
const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Exact pinned definitions + damage from S4-1, and its authoritative network islands. */
export function powerDevices(
  input: ShipSystemsInput,
  mode: ShipSystemsMode = "combat",
): PowerDevice[] {
  const definitions = new Map(input.catalog.components.map((d) => [d.id, d]));
  return [...input.components]
    .sort((a, b) => order(a.id, b.id))
    .map((p) => {
      const original = definitions.get(p.componentId);
      if (!original)
        throw Error("Missing pinned power component " + p.componentId);
      const performance = input.performance?.[p.id] ?? 1;
      const d = degradeShipComponent(original, performance);
      const connected = d.ports.some((port) => port.channel === "power");
      return {
        id: p.id,
        definition: `${original.id}@${original.revision}`,
        alive: performance > 0,
        demandW: connected ? shipPowerDemandKw(d, mode, p) * 1000 : 0,
        idleW: d.power.idleKw * 1000,
        generationW: d.power.generationKw * 1000,
        capacityJ: original.power.storageKwh * 3_600_000,
        dischargeW: d.power.maxDischargeKw * 1000,
        chargeW: d.power.maxChargeKw * 1000,
        priority: shipPowerPriority(d),
      };
    });
}

/** Missing devices are empty/stopped. No implicit issue, recharge or grandfathering. */
export function stepPower(
  devices: readonly PowerDevice[],
  islands: readonly Pick<
    ShipSystemsReport["networks"][number],
    "channel" | "members"
  >[],
  previous: readonly PowerDeviceState[],
): PowerStep {
  const old = new Map(previous.map((s) => [s.id, s]));
  const states = new Map<string, PowerDeviceState>();
  const supply: Record<string, number> = {};
  const defs = new Map(devices.map((d) => [d.id, d]));
  if (defs.size !== devices.length) throw Error("Duplicate power placement");
  for (const d of [...devices].sort((a, b) => order(a.id, b.id))) {
    for (const value of [
      d.demandW,
      d.idleW,
      d.generationW,
      d.capacityJ,
      d.dischargeW,
      d.chargeW,
    ])
      if (!Number.isFinite(value) || value < 0)
        throw Error("Invalid power device");
    const s = old.get(d.id);
    if (
      s &&
      (!Number.isFinite(s.energyJ) || s.energyJ < 0 || s.energyJ > d.capacityJ)
    )
      throw Error("Invalid stored energy");
    states.set(d.id, {
      id: d.id,
      uuid: s?.uuid ?? d.id,
      energyJ: s?.energyJ ?? 0,
      running: !!s?.running && d.alive,
    });
    supply[d.id] = d.alive && d.demandW === 0 ? 1 : 0;
  }
  const networks: PowerNetworkStep[] = [];
  const seen = new Set<string>();
  const groups = islands
    .filter((n) => n.channel === "power")
    .map((n) => [...n.members].sort(order))
    .sort((a, b) => order(a.join("|"), b.join("|")));
  // Components with no power ports still get destruction handling without creating a bus.
  for (const d of devices)
    if (!groups.some((g) => g.includes(d.id))) groups.push([d.id]);
  for (const ids of groups) {
    const members = ids.map((id) => {
      if (seen.has(id)) throw Error("Power islands overlap");
      seen.add(id);
      const d = defs.get(id);
      if (!d) throw Error("Unknown power island member");
      return d;
    });
    const row: PowerNetworkStep = {
      id: ids.join("|"),
      generationJ: 0,
      loadJ: 0,
      startupJ: 0,
      dischargeJ: 0,
      chargeJ: 0,
      dissipatedJ: 0,
      beforeJ: 0,
      afterJ: 0,
      brownout: false,
    };
    let netGeneration = 0;
    const operating = new Set<string>();
    const stores = members
      .filter((d) => d.capacityJ > 0)
      .sort(
        (a, b) =>
          order(a.id, b.id) ||
          order(states.get(a.id)!.uuid, states.get(b.id)!.uuid),
      );
    const dischargeLeft = new Map<string, number>();
    for (const d of members) {
      const s = states.get(d.id)!;
      row.beforeJ += s.energyJ;
      if (!d.alive) {
        row.dissipatedJ += s.energyJ;
        s.energyJ = 0;
        s.running = false;
        supply[d.id] = 0;
      }
      dischargeLeft.set(
        d.id,
        d.alive ? Math.min(s.energyJ, d.dischargeW * POWER_STEP_SECONDS) : 0,
      );
      if (s.running && d.generationW > 0 && d.generationW >= d.idleW) {
        operating.add(d.id);
        const own = d.idleW * POWER_STEP_SECONDS;
        row.generationJ += own;
        row.loadJ += own;
        netGeneration += (d.generationW - d.idleW) * POWER_STEP_SECONDS;
        supply[d.id] = 1;
      } else s.running = false;
    }
    const budget = () =>
      netGeneration +
      stores.reduce((n, d) => n + (dischargeLeft.get(d.id) ?? 0), 0);
    const take = (amount: number) => {
      const generated = Math.min(netGeneration, amount);
      netGeneration -= generated;
      amount -= generated;
      row.generationJ += generated;
      for (const d of stores) {
        const give = Math.min(dischargeLeft.get(d.id)!, amount);
        states.get(d.id)!.energyJ -= give;
        dischargeLeft.set(d.id, dischargeLeft.get(d.id)! - give);
        row.dischargeJ += give;
        amount -= give;
      }
      if (amount > 1e-6) throw Error("Power allocation exceeds budget");
    };
    // A stopped generator can only start on external energy, all-or-nothing. Its own output
    // stays unavailable this step. Newly started sources cannot bootstrap other sources yet.
    for (const d of members
      .filter(
        (d) =>
          d.alive &&
          d.generationW > 0 &&
          d.generationW >= d.idleW &&
          !operating.has(d.id),
      )
      .sort((a, b) => order(a.id, b.id))) {
      const required = d.idleW * POWER_STEP_SECONDS;
      if (budget() >= required) {
        take(required);
        row.startupJ += required;
        states.get(d.id)!.running = true;
        supply[d.id] = 1;
      }
    }
    for (const d of members
      .filter((d) => d.alive && d.generationW === 0)
      .sort((a, b) => a.priority - b.priority || order(a.id, b.id))) {
      const required = d.demandW * POWER_STEP_SECONDS;
      const give = Math.min(required, budget());
      take(give);
      row.loadJ += give;
      supply[d.id] = required > 0 ? give / required : 1;
      if (give < required) row.brownout = true;
    }
    for (const d of members.filter((d) => d.alive && d.generationW > 0))
      if (!states.get(d.id)!.running) row.brownout = true;
    // Never discharge and recharge the same store in one solve. Charging uses running
    // generation alone; another store cannot donate energy to it as a hidden transfer.
    for (const d of stores) {
      const s = states.get(d.id)!;
      if (!d.alive || s.energyJ < (old.get(d.id)?.energyJ ?? 0)) continue;
      const give = Math.min(
        netGeneration,
        d.chargeW * POWER_STEP_SECONDS,
        d.capacityJ - s.energyJ,
      );
      netGeneration -= give;
      s.energyJ += give;
      row.chargeJ += give;
      row.generationJ += give;
    }
    row.afterJ = members.reduce((n, d) => n + states.get(d.id)!.energyJ, 0);
    const residual =
      row.beforeJ +
      row.generationJ -
      row.afterJ -
      row.loadJ -
      row.startupJ -
      row.dissipatedJ;
    const tolerance =
      1e-6 +
      1e-9 *
        Math.max(
          row.beforeJ,
          row.generationJ,
          row.afterJ,
          row.loadJ,
          row.startupJ,
        );
    if (Math.abs(residual) > tolerance)
      throw Error("Power conservation failed");
    networks.push(row);
  }
  return { devices: [...states.values()], supply, networks };
}
