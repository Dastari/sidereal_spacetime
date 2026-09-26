import { describe, expect, it } from "vitest";
import { buildShipComponentCatalog } from "@sidereal/content/ship-components-source";
import {
  SHIP_COMPONENT_REFERENCE_FITS,
  REFERENCE_FIT_LG_FRIGATE,
  REFERENCE_FIT_MD_CORVETTE,
  REFERENCE_FIT_SM_FIGHTER,
} from "@sidereal/content/ship-components-reference-fits";
import {
  shipComponentIndex,
  type ShipComponentConnection,
  type ShipComponentFit,
  type ShipComponentPlacement,
  type ShipHardpoint,
} from "@sidereal/content/ship-components";
import {
  autoWireShipComponents,
  compileShipSystems,
  fitShipComponentToHardpoint,
  orientShipVector,
  placedShipPort,
  shipComponentFlightInput,
  shipComponentServicePorts,
  shipPortsCompatible,
  type ShipSystemsInput,
} from "./ship-systems";
import { compileFlightDefinition } from "./flight-definition";

const catalog = buildShipComponentCatalog();
const def = shipComponentIndex(catalog);
const input = (fit: ShipComponentFit, extra: Partial<ShipSystemsInput> = {}): ShipSystemsInput => ({
  catalog,
  hull: fit.hull,
  components: fit.components,
  ...extra,
});
const codes = (r: ReturnType<typeof compileShipSystems>) => r.issues.map((i) => i.code);
const hardpoint = (socket: ShipHardpoint["socket"], sizeClass: ShipHardpoint["sizeClass"]): ShipHardpoint => ({
  id: "h",
  socket,
  sizeClass,
  position: [0, 0, 0],
  quarterTurns: 0,
  reflected: false,
});
const inside = (id: string, componentId: string, x = 0, y = 0): ShipComponentPlacement => ({
  id,
  componentId,
  position: [x, y, 0],
  quarterTurns: 0,
  reflected: false,
  hardpointId: null,
});
const without = (fit: ShipComponentFit, ...ids: string[]): ShipComponentFit => ({
  ...fit,
  components: fit.components.filter((c) => !ids.some((id) => c.id === id || c.componentId === id)),
});

describe("reference balance fits", () => {
  it("all compile without errors and close their cruise budgets", () => {
    for (const fit of SHIP_COMPONENT_REFERENCE_FITS) {
      const r = compileShipSystems(input(fit));
      expect(r.issues.filter((i) => i.severity === "error"), fit.id).toEqual([]);
      expect(r.power.modes.cruise.balanceKw, fit.id).toBeGreaterThan(0);
      expect(r.heat.modes.cruise.timeToOverheatS, fit.id).toBeNull();
      expect(r.power.modes.cruise.brownout, fit.id).toBe(false);
      expect(r.power.modes.combat.brownout, fit.id).toBe(false);
      expect(r.coolant.supplyLps, fit.id).toBeGreaterThanOrEqual(r.coolant.demandLps);
      expect(r.data.controlSlotsUsed, fit.id).toBeLessThanOrEqual(r.data.controlSlots);
      expect(r.crew.lifeSupportCrew, fit.id).toBeGreaterThanOrEqual(r.crew.berths);
      expect(r.fuel.modes.cruise.enduranceS!, fit.id).toBeGreaterThan(20 * 60);
    }
  });

  it("orders performance by size class: fighters accelerate hardest", () => {
    const [sm, md, lg] = [REFERENCE_FIT_SM_FIGHTER, REFERENCE_FIT_MD_CORVETTE, REFERENCE_FIT_LG_FRIGATE].map((f) => compileShipSystems(input(f)));
    expect(sm.propulsion.forwardAccel).toBeGreaterThan(3.5);
    expect(md.propulsion.forwardAccel).toBeGreaterThan(1.8);
    expect(lg.propulsion.forwardAccel).toBeGreaterThan(1.8);
    expect(sm.mass.totalKg).toBeLessThan(md.mass.totalKg);
    expect(md.mass.totalKg).toBeLessThan(lg.mass.totalKg);
    expect(lg.weapons.alphaDamage).toBeGreaterThan(md.weapons.alphaDamage);
    expect(md.weapons.alphaDamage).toBeGreaterThan(sm.weapons.alphaDamage);
    // The fighter is combat-heat limited by design; the heat sink buys minutes.
    expect(sm.heat.modes.combat.timeToOverheatS).toBeGreaterThan(120);
  });

  it("feeds the generic flight compiler with matching mass and envelope", () => {
    for (const fit of SHIP_COMPONENT_REFERENCE_FITS) {
      const i = input(fit);
      const r = compileShipSystems(i);
      const flight = compileFlightDefinition(shipComponentFlightInput(i, r));
      expect(flight.status, fit.id).toBe("ready");
      if (flight.status !== "ready") continue;
      expect(flight.mass.massKg).toBeCloseTo(r.mass.totalKg, 3);
      // Symmetric fits: the torque-free envelope equals thrust / mass.
      expect(flight.envelope.forward).toBeCloseTo(r.propulsion.forwardAccel, 1);
      expect(flight.actuators.length).toBe(fit.components.filter((c) => def.get(c.componentId)!.propulsion).length);
      expect(flight.computers.length).toBe(1);
    }
  });

  it("slows a big hull fitted with small engines (design doc P5 acceptance)", () => {
    const fit = REFERENCE_FIT_LG_FRIGATE;
    const small = {
      ...fit,
      components: fit.components.map((c) =>
        c.componentId === "ion-drive.xl" ? { ...c, componentId: "ion-drive.sm" } : c,
      ),
    };
    const big = compileShipSystems(input(fit));
    const slow = compileShipSystems(input(small));
    expect(slow.propulsion.forwardAccel).toBeLessThan(big.propulsion.forwardAccel / 2);
    expect(codes(slow)).toContain("undersized-adapter");
  });

  it("is deterministic under input order", () => {
    const a = compileShipSystems(input(REFERENCE_FIT_MD_CORVETTE));
    const b = compileShipSystems(input({ ...REFERENCE_FIT_MD_CORVETTE, components: [...REFERENCE_FIT_MD_CORVETTE.components].reverse() }));
    expect(b).toEqual(a);
  });
});

describe("hardpoint fit", () => {
  it("applies socket, size and rear-only rules", () => {
    expect(fitShipComponentToHardpoint(def.get("ion-drive.md")!, hardpoint("rear", "MD")).ok).toBe(true);
    expect(fitShipComponentToHardpoint(def.get("ion-drive.lg")!, hardpoint("rear", "MD")).errors).toContain("size-too-large");
    expect(fitShipComponentToHardpoint(def.get("ion-drive.xl")!, hardpoint("face", "XL")).errors).toContain("rear-only");
    expect(fitShipComponentToHardpoint(def.get("autocannon.md")!, hardpoint("rear", "MD")).errors).toContain("socket-mismatch");
    expect(fitShipComponentToHardpoint(def.get("autocannon.sm")!, hardpoint("top", "LG")).warnings).toEqual(["undersized-adapter"]);
    expect(fitShipComponentToHardpoint(def.get("cargo-door.6m")!, hardpoint("edge", "MD")).errors).toContain("edge-too-wide");
    expect(fitShipComponentToHardpoint(def.get("cargo-door.4m")!, hardpoint("edge", "MD")).ok).toBe(true);
    expect(fitShipComponentToHardpoint(def.get("airlock.exterior.md")!, hardpoint("edge", "SM")).ok).toBe(true);
  });

  it("reports missing, occupied and misaligned hardpoints", () => {
    const fit = REFERENCE_FIT_SM_FIGHTER;
    const gun = fit.components.find((c) => c.componentId === "autocannon.sm")!;
    const moved = { ...gun, id: "moved", position: [9, 9, 9] as const };
    const loose = { ...gun, id: "loose", hardpointId: null };
    const r = compileShipSystems(input({ ...fit, components: [...fit.components, moved, loose] }));
    expect(codes(r)).toEqual(expect.arrayContaining(["hardpoint-occupied", "hardpoint-transform-mismatch", "missing-hardpoint"]));
    expect(r.status).toBe("invalid");
  });
});

describe("ports and networks", () => {
  const reactor = def.get("reactor.sm")!,
    engine = def.get("ion-drive.sm")!;
  const out = reactor.ports.find((p) => p.id === "power-out")!,
    into = engine.ports.find((p) => p.id === "power-in")!;

  it("checks channel, medium, connector and direction", () => {
    expect(shipPortsCompatible(out, into)).toEqual({ ok: true, reason: null, flow: Math.min(out.capacity, into.capacity) });
    expect(shipPortsCompatible(into, out).reason).toBe("source-is-input");
    expect(shipPortsCompatible(out, engine.ports.find((p) => p.id === "fuel-in")!).reason).toBe("channel-mismatch");
    expect(shipPortsCompatible(out, { ...into, connectorFamily: "other" }).reason).toBe("connector-mismatch");
  });

  it("transforms ports with the placement like flight vectors", () => {
    expect(orientShipVector([0, 1, 0], 1, false)).toEqual([-1, 0, 0]);
    expect(orientShipVector([1, 0, 0], 0, true)).toEqual([-1, 0, 0]);
    const placed = placedShipPort({ ...inside("e", engine.id), position: [2, -5, 1], quarterTurns: 2 }, into);
    expect(placed.normal).toEqual([-0, -1, 0]);
    expect(placed.position[1]).toBeCloseTo(-5);
  });

  it("re-mounts top-authored components on faces and bottoms", () => {
    const gun = def.get("autocannon.md")!;
    expect(gun.mount.frame).toBe("top");
    const port = gun.ports[0];
    const starboard = { ...inside("g", gun.id), position: [5, 0, 1.75] as const, quarterTurns: 1 as const };
    // Authored into-roof normal (-Z) becomes into-hull (-X) on a starboard face.
    expect(placedShipPort(starboard, port, { definition: gun, socket: "face" }).normal.map((v) => v + 0)).toEqual([-1, 0, 0]);
    // On a bottom hardpoint the connector points up into the hull.
    expect(placedShipPort(inside("b", gun.id), port, { definition: gun, socket: "bottom" }).normal.map((v) => v + 0)).toEqual([0, 0, 1]);
    // A face-authored docking port on the roof points its connector down.
    const dock = def.get("docking-port.md")!;
    expect(placedShipPort(inside("d", dock.id), dock.ports[0], { definition: dock, socket: "top" }).normal.map((v) => v + 0)).toEqual([0, 0, -1]);
  });

  it("isolates explicit power networks and flags unconnected consumers", () => {
    const hull = { ...REFERENCE_FIT_SM_FIGHTER.hull, hardpoints: [] };
    const components = [
      inside("reactor", "reactor.sm"),
      inside("core", "computer-core.sm"),
      inside("helm", "console.navigation.sm"),
      inside("pump", "coolant-pump.sm"),
      inside("tank", "fuel-tank.sm"),
      { ...inside("engine-a", "ion-drive.sm"), position: [-1, -5, 1] as const },
      { ...inside("engine-b", "ion-drive.sm"), position: [1, -5, 1] as const },
    ];
    const link = (id: string, channel: ShipComponentConnection["channel"], from: string, fp: string, to: string, tp: string): ShipComponentConnection => ({
      id,
      channel,
      from: { placementId: from, portId: fp },
      to: { placementId: to, portId: tp },
    });
    const connections = [
      link("p1", "power", "reactor", "power-out", "engine-a", "power-in"),
      link("p2", "power", "reactor", "power-out", "core", "power-in"),
      link("p3", "power", "reactor", "power-out", "helm", "power-in"),
      link("p4", "power", "reactor", "power-out", "pump", "power-in"),
    ];
    const r = compileShipSystems({ catalog, hull, components, connections });
    expect(r.connectionMode).toBe("explicit");
    // engine-b has no feeder: its island has no generation.
    expect(r.power.modes.cruise.supply["engine-b"]).toBe(0);
    expect(r.power.modes.cruise.supply["engine-a"]).toBe(1);
    expect(codes(r)).toContain("unconnected-port");
    const dup = compileShipSystems({ catalog, hull, components, connections: [...connections, link("p5", "power", "reactor", "power-out", "engine-a", "power-in")] });
    expect(codes(dup)).toContain("duplicate-input");
    const bad = compileShipSystems({ catalog, hull, components, connections: [link("x", "power", "reactor", "power-out", "tank", "fuel-out")] });
    expect(codes(bad)).toContain("incompatible-ports");
  });

  it("auto-wires reference fits into valid explicit networks", () => {
    for (const fit of SHIP_COMPONENT_REFERENCE_FITS) {
      const connections = autoWireShipComponents(catalog, fit.hull, fit.components);
      const r = compileShipSystems(input(fit, { connections }));
      expect(r.connectionMode).toBe("explicit");
      expect(r.issues.filter((i) => i.severity === "error"), fit.id).toEqual([]);
      expect(codes(r)).not.toContain("unconnected-port");
      // One feeder per input, and every link joins compatible ports.
      expect(new Set(connections.map((c) => `${c.to.placementId}:${c.to.portId}`)).size).toBe(connections.length);
      expect(r.power.modes.cruise.balanceKw).toBeCloseTo(compileShipSystems(input(fit)).power.modes.cruise.balanceKw, 6);
    }
    const again = autoWireShipComponents(catalog, REFERENCE_FIT_MD_CORVETTE.hull, [...REFERENCE_FIT_MD_CORVETTE.components].reverse());
    expect(again).toEqual(autoWireShipComponents(catalog, REFERENCE_FIT_MD_CORVETTE.hull, REFERENCE_FIT_MD_CORVETTE.components));
  });

  it("converts ports to construction-services lattice ports", () => {
    const placement = { ...inside("r", "reactor.md"), position: [1, 2, 0] as const };
    const ports = shipComponentServicePorts(placement, def.get("reactor.md")!, { regionId: "room", deckId: "deck-1" });
    const power = ports.find((p) => p.id === "r:power-out")!;
    expect(power.capacityPerSecond).toBe(700_000);
    expect(power.position.every(Number.isInteger)).toBe(true);
    expect(power.channel).toBe("power");
    expect(ports.find((p) => p.id === "r:fuel-in")!.capacityPerSecond).toBeCloseTo(0.1 * 0.8);
  });
});

describe("budgets and rules", () => {
  it("sheds low-priority loads first in a brownout", () => {
    const fit = REFERENCE_FIT_MD_CORVETTE;
    const weak = { ...fit, components: fit.components.map((c) => (c.componentId === "reactor.md" ? { ...c, componentId: "reactor.sm" } : c)) };
    const r = compileShipSystems(input(without(weak, "battery.md")));
    const combat = r.power.modes.combat;
    expect(combat.brownout).toBe(true);
    expect(combat.supply["life"]).toBe(1);
    expect(combat.supply["core"]).toBe(1);
    const weapon = fit.components.find((c) => c.componentId === "laser-cannon.md")!.id;
    expect(combat.supply[weapon]).toBeLessThan(1);
    // Starved engines reduce the flight envelope through the supply map.
    const flight = compileFlightDefinition(shipComponentFlightInput(input(without(weak, "battery.md")), r, "peak"));
    expect(flight.status).toBe("ready");
    if (flight.status === "ready") expect(flight.envelope.forward).toBeLessThan(r.propulsion.forwardKn / (r.mass.totalKg / 1000));
  });

  it("requires stations, cores, capacitors, emitters, magazines and fuel", () => {
    const f = REFERENCE_FIT_LG_FRIGATE;
    expect(codes(compileShipSystems(input(without(f, "gunnery"))))).toContain("missing-station");
    expect(codes(compileShipSystems(input(without(f, "helm"))))).toContain("no-pilot-station");
    expect(codes(compileShipSystems(input(without(f, "core"))))).toContain("no-computer-core");
    expect(codes(compileShipSystems(input(without(f, "capacitor"))))).toContain("capacitor-too-small");
    expect(codes(compileShipSystems(input(without(f, "shield-emitter.lg"))))).toContain("shield-without-emitter");
    expect(codes(compileShipSystems(input(without(f, "torpedoes"))))).toContain("no-magazine");
    expect(codes(compileShipSystems(input(without(f, "tank-main", "tank-aux"))))).toContain("no-fuel-storage");
    expect(codes(compileShipSystems(input(without(f, "reactor-main", "reactor-aux"))))).toContain("power-brownout-cruise");
  });

  it("limits radiators by pump flow and reports heat endurance", () => {
    const f = REFERENCE_FIT_SM_FIGHTER;
    const r = compileShipSystems(input(without(f, "pump")));
    expect(r.heat.pumpLimitedKw).toBe(0);
    expect(codes(r)).toEqual(expect.arrayContaining(["radiators-pump-limited", "coolant-shortfall"]));
    expect(r.heat.modes.combat.timeToOverheatS).toBeGreaterThan(0);
  });

  it("rejects unknown and future components unless allowed", () => {
    const fit = REFERENCE_FIT_LG_FRIGATE;
    const warp = inside("warp", "warp-drive.lg");
    expect(codes(compileShipSystems(input({ ...fit, components: [...fit.components, warp] })))).toContain("future-component");
    const allowed = compileShipSystems(input({ ...fit, components: [...fit.components, warp] }, { allowFuture: true }));
    expect(codes(allowed)).not.toContain("future-component");
    expect(allowed.propulsion.forwardKn).toBe(compileShipSystems(input(fit)).propulsion.forwardKn);
    expect(codes(compileShipSystems(input({ ...fit, components: [...fit.components, inside("x", "nope")] })))).toContain("unknown-component");
  });

  it("scales fuel and ammunition mass by fill fraction", () => {
    const full = compileShipSystems(input(REFERENCE_FIT_MD_CORVETTE));
    const empty = compileShipSystems(input(REFERENCE_FIT_MD_CORVETTE, { fuelFraction: 0, ammoFraction: 0 }));
    expect(full.mass.totalKg - empty.mass.totalKg).toBeCloseTo(full.mass.fuelKg + full.mass.ammoKg, 5);
    expect(empty.fuel.modes.cruise.enduranceS).toBe(0);
    expect(empty.weapons.ammo.every((a) => a.stockRounds === 0)).toBe(true);
  });

  it("rejects oversized inputs", () => {
    const many = Array.from({ length: 1025 }, (_, i) => inside(`c${i}`, "crew-bunk.sm"));
    expect(() => compileShipSystems({ catalog, hull: REFERENCE_FIT_SM_FIGHTER.hull, components: many })).toThrow("budget");
  });
});
