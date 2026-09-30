import { expect, test } from "vitest";
import {
  POWER_STEP_SECONDS,
  stepPower,
  powerDevices,
  type PowerDevice,
  type PowerDeviceState,
} from "./ship-power";
import { compilePrefabShipSystems } from "./prefab-ship-systems";
import { prefabById } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
const device = (id: string, patch: Partial<PowerDevice> = {}): PowerDevice => ({
  id,
  definition: id,
  alive: true,
  demandW: 0,
  idleW: 0,
  generationW: 0,
  capacityJ: 0,
  dischargeW: 0,
  chargeW: 0,
  priority: 0,
  ...patch,
});
const reactor = device("reactor", {
  generationW: 10_000,
  idleW: 2_000,
  priority: 1,
});
const battery = device("battery", {
  capacityJ: 10_000,
  dischargeW: 10_000,
  chargeW: 1_000,
  priority: 1,
});
const core = device("core", { demandW: 2_000, priority: 0 });
const thruster = device("drive", { demandW: 10_000, priority: 4 });
const island = (...ids: string[]) => ({
  channel: "power" as const,
  members: ids,
});
const state = (id: string, energyJ = 0, running = false): PowerDeviceState => ({
  id,
  uuid: "uuid-" + id,
  energyJ,
  running,
});
const bus = [island("reactor", "battery", "core", "drive")];
const kit = [reactor, battery, core, thruster];
function conserved(result: ReturnType<typeof stepPower>) {
  for (const n of result.networks)
    expect(n.beforeJ + n.generationJ).toBeCloseTo(
      n.afterJ + n.loadJ + n.startupJ + n.dissipatedJ,
      6,
    );
}
test("dead bus cannot self-start; externally funded idle tick starts without output until next step", () => {
  const dead = stepPower(kit, bus, []);
  expect(dead.devices.find((s) => s.id === "reactor")!.running).toBe(false);
  expect(dead.networks[0].generationJ).toBe(0);
  const start = stepPower(kit, bus, [state("battery", 100)]);
  expect(start.devices.find((s) => s.id === "reactor")!.running).toBe(true);
  expect(start.networks[0]).toMatchObject({
    generationJ: 0,
    startupJ: 100,
    afterJ: 0,
    loadJ: 0,
  });
  const next = stepPower(kit, bus, start.devices);
  expect(next.networks[0].generationJ).toBe(500);
  expect(next.supply.core).toBe(1);
  expect(next.supply.drive).toBeCloseTo(0.6);
  conserved(start);
  conserved(next);
});
test("incomplete startup is free; distinct priorities then stable identity break ties", () => {
  const start = stepPower(kit, bus, [state("battery", 99)]);
  expect(start.networks[0].startupJ).toBe(0);
  expect(start.supply.core).toBe(0.99);
  const a = device("a", { demandW: 1000, priority: 4 }),
    z = device("z", { demandW: 1000, priority: 4 });
  const first = stepPower(
    [z, battery, a],
    [island("z", "a", "battery")],
    [state("battery", 75)],
  );
  const second = stepPower(
    [a, z, battery],
    [island("battery", "a", "z")],
    [state("battery", 75)],
  );
  expect(first).toEqual(second);
  expect(first.supply).toMatchObject({ a: 1, z: 0.5 });
});
test("a generator derated below its own idle demand cannot repeatedly consume startup energy", () => {
  const damaged = { ...reactor, generationW: 1000 };
  let previous = [state("battery", 1000), state("reactor", 0, true)];
  for (let tick = 0; tick < 4; tick++) {
    const out = stepPower(
      [damaged, battery],
      [island("reactor", "battery")],
      previous,
    );
    expect(out.devices.find((s) => s.id === "reactor")!.running).toBe(false);
    expect(out.networks[0].startupJ).toBe(0);
    expect(out.devices.find((s) => s.id === "battery")!.energyJ).toBe(1000);
    conserved(out);
    previous = out.devices;
  }
});
test("isolated networks never exchange storage or generation", () => {
  const out = stepPower(
    kit,
    [island("reactor", "battery"), island("core", "drive")],
    [state("reactor", 0, true), state("battery", 1000)],
  );
  expect(out.supply.core).toBe(0);
  expect(out.supply.drive).toBe(0);
  expect(out.devices.find((s) => s.id === "battery")!.energyJ).toBe(1050);
  conserved(out);
});
test("rate/capacity limits, no simultaneous cycling, finite depletion over many steps", () => {
  let previous = [state("reactor", 0, true), state("battery", 25)];
  const first = stepPower(kit, bus, previous);
  expect(first.networks[0]).toMatchObject({
    dischargeJ: 25,
    chargeJ: 0,
    afterJ: 0,
  });
  for (let i = 0; i < 500; i++) {
    const out = stepPower(kit, bus, previous);
    conserved(out);
    previous = out.devices;
    expect(
      out.devices.find((s) => s.id === "battery")!.energyJ,
    ).toBeGreaterThanOrEqual(0);
  }
  expect(previous.find((s) => s.id === "battery")!.energyJ).toBe(0);
  const charged = stepPower(
    [reactor, battery],
    [island("reactor", "battery")],
    [state("reactor", 0, true), state("battery", 9999)],
  );
  expect(charged.networks[0].chargeJ).toBe(1);
  expect(charged.devices.find((s) => s.id === "battery")!.energyJ).toBe(10_000);
  conserved(charged);
});
test("destruction dissipates stored energy and stops sources; missing state never invents joules", () => {
  const out = stepPower(
    [
      { ...reactor, alive: false, generationW: 0 },
      { ...battery, alive: false, dischargeW: 0, chargeW: 0 },
    ],
    [island("reactor", "battery")],
    [state("reactor", 0, true), state("battery", 1234)],
  );
  expect(out.devices.every((s) => s.energyJ === 0 && !s.running)).toBe(true);
  expect(out.networks[0].dissipatedJ).toBe(1234);
  conserved(out);
  expect(stepPower([battery], [island("battery")], []).devices[0].energyJ).toBe(
    0,
  );
});
test("pinned definitions scale generator and store rates once under physical damage", () => {
  const wren = prefabById("fed.s.wren")!,
    catalog = defaultPrefabComponentCatalog().revision;
  const undamaged = compilePrefabShipSystems(wren, catalog);
  const damaged = compilePrefabShipSystems(wren, catalog, [
    { objectId: "mount:reactor", performance: 0.5 },
    { objectId: "mount:battery", performance: 0.5 },
  ]);
  const a = powerDevices(undamaged.input),
    b = powerDevices(damaged.input);
  const pick = (v: PowerDevice[], id: string) =>
    v.find((d) => d.id === `mount:${id}`)!;
  expect(pick(b, "reactor").generationW).toBe(
    pick(a, "reactor").generationW / 2,
  );
  expect(pick(b, "reactor").idleW).toBe(pick(a, "reactor").idleW);
  expect(pick(b, "battery").dischargeW).toBe(pick(a, "battery").dischargeW / 2);
  expect(pick(b, "battery").capacityJ).toBe(pick(a, "battery").capacityJ);
  expect(POWER_STEP_SECONDS).toBe(0.05);
});
