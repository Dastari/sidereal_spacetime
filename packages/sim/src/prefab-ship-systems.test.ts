import { expect, test } from "vitest";
import { PREFAB_SHIPS, prefabById } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { prefabStats } from "@sidereal/content/ship-prefab";
import {
  compilePrefabShipSystems,
  prefabShipSystemsInput,
  shipComponentCatalogFor,
  shipSystemsAvailability,
} from "./prefab-ship-systems";
import { compileShipSystems, degradeShipComponent } from "./ship-systems";

const catalog = defaultPrefabComponentCatalog();
const FIT_ERRORS = new Set([
  "socket-mismatch",
  "rear-only",
  "size-too-large",
  "footprint-too-large",
  "edge-too-wide",
  "missing-hardpoint",
  "unknown-hardpoint",
  "hardpoint-occupied",
  "hardpoint-transform-mismatch",
  "unknown-component",
  "future-component",
  "invalid-placement",
  "duplicate-or-invalid-placement",
  "invalid-hull",
]);

test("every prefab compiles: mounts restate as valid hardpoints and mass/thrust match the grammar stats", () => {
  expect(PREFAB_SHIPS).toHaveLength(12);
  for (const p of PREFAB_SHIPS) {
    const { report: r } = compilePrefabShipSystems(p, catalog.revision);
    const fit = r.issues.filter((i) => FIT_ERRORS.has(i.code));
    expect(fit, p.id).toEqual([]);
    expect(r.connectionMode).toBe("bus");
    const stats = prefabStats(p, catalog);
    // Same structure and component mass as the Shipyard stats (fuel and ammunition on top).
    expect(r.mass.totalKg - r.mass.fuelKg - r.mass.ammoKg, p.id).toBeCloseTo(
      stats.massKg,
      1,
    );
    // Forward thrust includes the aft-face main drives the grammar counts (plus any
    // forward-pushing manoeuvre thrusters, which the catalogue estimator also counts).
    expect(r.propulsion.forwardKn * 1000, p.id).toBeGreaterThanOrEqual(
      stats.thrustN - 1e-6,
    );
    expect(r.propulsion.forwardKn, p.id).toBeGreaterThan(0);
    expect(r.power.generationKw * 1000, p.id).toBeCloseTo(
      stats.powerGenerationW,
      1,
    );
  }
});

test("an unknown catalogue revision is refused (pinned legacy Wren revisions: world suite)", () => {
  expect(() =>
    compilePrefabShipSystems(
      prefabById("fed.s.wren")!,
      "ship-components-v1@99",
    ),
  ).toThrow("Unsupported ship component catalog");
});

test("deterministic, with damage folded into the input hash; unknown objects are ignored", () => {
  const wren = prefabById("fed.s.wren")!;
  const a = compilePrefabShipSystems(wren, catalog.revision);
  const b = compilePrefabShipSystems(wren, catalog.revision, [
    { objectId: "mount:nope", performance: 0 },
  ]);
  expect(b.inputHash).toBe(a.inputHash);
  expect(JSON.stringify(b.report)).toBe(JSON.stringify(a.report));
  const reactor = wren.mounts.find((m) => m.component.startsWith("reactor."))!;
  const half = compilePrefabShipSystems(wren, catalog.revision, [
    { objectId: `mount:${reactor.id}`, performance: 0.5 },
  ]);
  expect(half.inputHash).not.toBe(a.inputHash);
  expect(half.damaged).toBe(1);
  expect(half.destroyed).toBe(0);
  expect(half.report.power.generationKw).toBeCloseTo(
    a.report.power.generationKw / 2,
    6,
  );
  // Demand is unchanged while the part still works.
  expect(half.report.power.modes.cruise.demandKw).toBe(
    a.report.power.modes.cruise.demandKw,
  );
});

test("degradeShipComponent scales output, keeps demand, and a destroyed part is inert", () => {
  const defs = shipComponentCatalogFor(catalog.revision).components;
  const drive = defs.find((d) => d.propulsion?.role === "main")!;
  expect(degradeShipComponent(drive, 1)).toBe(drive);
  const half = degradeShipComponent(drive, 0.5);
  expect(half.propulsion!.thrustKn).toBeCloseTo(drive.propulsion!.thrustKn / 2);
  expect(half.power.activeKw).toBe(drive.power.activeKw);
  expect(half.massKg).toBe(drive.massKg);
  const dead = degradeShipComponent(drive, 0);
  expect(dead.propulsion!.thrustKn).toBe(0);
  expect(dead.power.activeKw).toBe(0);
  expect(dead.heat.activeKw).toBe(0);
  expect(dead.fluids.fuelActiveLps).toBe(0);
  expect(dead.massKg).toBe(drive.massKg);
  // Absent performance leaves the compile byte-identical.
  const input = prefabShipSystemsInput(
    prefabById("fed.s.wren")!,
    catalog.revision,
  );
  expect(
    JSON.stringify(compileShipSystems({ ...input, performance: {} })),
  ).toBe(JSON.stringify(compileShipSystems(input)));
});

test("availability: per-placement power, fuel and performance from the compile", () => {
  const wren = prefabById("fed.s.wren")!;
  const whole = shipSystemsAvailability(
    compilePrefabShipSystems(wren, catalog.revision),
  );
  const drives = wren.mounts.filter(
    (m) =>
      m.component.startsWith("thrust-block") ||
      m.component.startsWith("ion-drive"),
  );
  expect(drives.length).toBeGreaterThan(0);
  for (const m of drives)
    expect(whole[`mount:${m.id}`], m.id).toEqual({
      power: 1,
      fuel: 1,
      performance: 1,
    });
  // No tank: burners are unfed. No reactor: powered parts are unsupplied.
  const tank = wren.mounts.find((m) => m.component.startsWith("fuel-tank"))!;
  const reactor = wren.mounts.find((m) => m.component.startsWith("reactor."))!;
  const dry = shipSystemsAvailability(
    compilePrefabShipSystems(wren, catalog.revision, [
      { objectId: `mount:${tank.id}`, performance: 0 },
      { objectId: `mount:${reactor.id}`, performance: 0 },
    ]),
  );
  for (const m of drives) {
    const a = dry[`mount:${m.id}`];
    if (a.fuel !== 1 || whole[`mount:${m.id}`].fuel !== 1)
      expect(a.fuel, m.id).toBe(0);
    expect(a.power, m.id).toBe(0);
  }
  expect(
    drives.some((m) => dry[`mount:${m.id}`].fuel === 0),
    "some drive burns fuel",
  ).toBe(true);
  expect(dry[`mount:${reactor.id}`].performance).toBe(0);
});
