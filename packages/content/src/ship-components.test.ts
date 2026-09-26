import { describe, expect, it } from "vitest";
import snapshot from "./ship-components.v1.json";
import {
  SHIP_COMPONENT_SCHEMA,
  SHIP_THERMAL_MODEL,
  shipComponentIndex,
  shipComponentSizes,
  validateShipComponentCatalog,
  type ShipComponentCatalog,
} from "./ship-components";
import { buildShipComponentCatalog } from "./ship-components-source";

const catalog = buildShipComponentCatalog();
const byId = shipComponentIndex(catalog);
const clone = (): ShipComponentCatalog => JSON.parse(JSON.stringify(catalog));

describe("ship component catalog v1", () => {
  it("matches the checked-in JSON snapshot (run npm run ship-components:export)", () => {
    expect(snapshot).toEqual(catalog);
  });

  it("is structurally valid, versioned and proposed", () => {
    expect(catalog.schema).toBe(SHIP_COMPONENT_SCHEMA);
    expect(catalog.status).toBe("proposed");
    expect(validateShipComponentCatalog(catalog)).toEqual([]);
    expect(catalog.components.length).toBeGreaterThanOrEqual(120);
  });

  it("covers every requested kind and size", () => {
    const sizes = (kind: string, variant = "standard") =>
      shipComponentSizes(catalog, kind, variant).map((c) => c.sizeClass).join(",");
    expect(sizes("ion-drive")).toBe("SM,MD,LG,XL");
    expect(sizes("thrust-block")).toBe("SM,MD,LG,XL");
    expect(sizes("ion-drive", "salvaged")).toBe("SM,MD,LG,XL");
    expect(sizes("resonance-drive", "aurelian")).toBe("SM,MD,LG");
    expect(sizes("rcs")).toBe("SM,MD");
    for (const k of ["reactor", "battery", "capacitor", "fuel-tank", "radiator", "coolant-pump", "shield-generator", "shield-emitter", "sensor-dish", "tractor-projector", "mining-laser", "life-support", "computer-core"])
      expect(sizes(k), k).toBe("SM,MD,LG");
    for (const k of ["point-defense", "autocannon", "laser-cannon", "railgun", "missile-pod", "torpedo-launcher", "flak-cannon", "plasma-turret", "side-cannon"])
      expect(sizes(k).length, k).toBeGreaterThan(0);
    expect(sizes("side-cannon")).toBe("SM,MD,LG");
    expect(["cargo-door.2m", "cargo-door.4m", "cargo-door.6m"].every((id) => byId.has(id))).toBe(true);
    expect(byId.get("cargo-door.6m")!.access!.openingWidthM).toBe(6);
    for (const id of ["airlock.exterior.md", "airlock.interior.sm", "hatch.sm", "hatch.exterior.sm", "docking-port.md", "radar-array.lg", "scanner-mast.md", "relay-beacon.sm", "salvage-arm.md", "docking-clamp.lg", "drone-bay.md", "air-filter.sm", "oxygen-tank.md", "gravity-unit.md", "console.navigation.sm", "console.command.sm", "magazine.ballistic.lg", "magazine.missile.md", "magazine.torpedo.lg", "armor-plate.heavy.sm", "solar-array.md", "heat-sink.md", "aux-generator.sm"])
      expect(byId.has(id), id).toBe(true);
    expect(byId.get("vtol-thruster.sm")!.status).toBe("future");
    expect(byId.get("warp-drive.lg")!.status).toBe("future");
  });

  it("keeps external XL propulsion rear-only and hardpoints whole-cell", () => {
    for (const c of catalog.components) {
      if (c.family === "propulsion" && c.sizeClass === "XL" && c.mount.sockets.includes("rear")) {
        expect(c.mount.rearOnly, c.id).toBe(true);
        expect(c.mount.sockets).toEqual(["rear"]);
      }
      expect(c.mount.cells.every((n) => Number.isInteger(n) && n > 0), c.id).toBe(true);
    }
  });

  it("derives coherent system numbers", () => {
    const g0 = 9.80665;
    for (const c of catalog.components) {
      // Hot components carry heat on coolant at 25 kW per L/s.
      if (c.heat.activeKw > SHIP_THERMAL_MODEL.airCooledMaxKw)
        expect(c.fluids.coolantDemandLps, c.id).toBeCloseTo(c.heat.activeKw / SHIP_THERMAL_MODEL.coolantKwPerLps, 2);
      // Effective specific impulse matches thrust and propellant flow.
      const p = c.propulsion;
      if (p && p.thrustKn > 0 && c.fluids.fuelActiveLps > 0)
        expect(p.specificImpulseS * c.fluids.fuelActiveLps * 0.8 * g0 / 1000, c.id).toBeCloseTo(p.thrustKn, 1);
      // Energy weapons draw their shot energy continuously while firing.
      const w = c.weapon;
      if (w && w.energyPerShotKj > 0)
        expect(c.power.activeKw - c.power.idleKw, c.id).toBeCloseTo((w.energyPerShotKj * w.shotsPerMinute) / 60, 1);
      // Every port capacity covers the rating it serves.
      const port = (id: string) => c.ports.find((x) => x.id === id);
      if (c.power.peakKw > 0) expect(port("power-in")!.capacity, c.id).toBeGreaterThanOrEqual(c.power.peakKw);
      if (c.fluids.coolantDemandLps > 0) expect(port("coolant-in")!.capacity, c.id).toBeGreaterThanOrEqual(c.fluids.coolantDemandLps);
      if (c.fluids.fuelActiveLps > 0) expect(port("fuel-in")!.capacity, c.id).toBeGreaterThanOrEqual(c.fluids.fuelActiveLps);
    }
    // Size ladders increase thrust and mass monotonically.
    for (const kind of ["ion-drive", "thrust-block"]) {
      const ladder = shipComponentSizes(catalog, kind);
      for (let i = 1; i < ladder.length; i++) {
        expect(ladder[i].propulsion!.thrustKn).toBeGreaterThan(ladder[i - 1].propulsion!.thrustKn);
        expect(ladder[i].massKg).toBeGreaterThan(ladder[i - 1].massKg);
      }
    }
    // Thrust blocks trade propellant for power against ion drives.
    const ion = byId.get("ion-drive.md")!, block = byId.get("thrust-block.md")!;
    expect(block.propulsion!.thrustKn).toBeGreaterThan(ion.propulsion!.thrustKn);
    expect(block.fluids.fuelActiveLps).toBeGreaterThan(ion.fluids.fuelActiveLps * 4);
    expect(block.power.activeKw).toBeLessThan(ion.power.activeKw / 4);
    // The salvaged variant shares sockets and hardpoint cells (its bypass pipe
    // stands slightly proud) but is weaker.
    const scrap = byId.get("ion-drive.salvaged.md")!;
    expect(scrap.mount.cells).toEqual(ion.mount.cells);
    expect(scrap.mount.sockets).toEqual(ion.mount.sockets);
    expect(scrap.mount.envelopeM[0][1]).toBe(ion.mount.envelopeM[0][1]);
    expect(scrap.propulsion!.thrustKn).toBeLessThan(ion.propulsion!.thrustKn);
    // SM computer core matches the existing 500 W IFCS lab computer.
    expect(byId.get("computer-core.sm")!.power.activeKw * 1000).toBe(500);
  });

  it("places typed ports on the mounting plane with standard connectors", () => {
    const ion = byId.get("ion-drive.lg")!;
    expect(ion.ports.map((p) => p.channel).sort()).toEqual(["coolant", "data", "fuel", "power"]);
    for (const p of ion.ports) {
      expect(p.position[1]).toBe(0);
      expect(p.normal).toEqual([0, 1, 0]);
    }
    const turret = byId.get("autocannon.md")!;
    expect(turret.ports.find((p) => p.channel === "ammo")).toMatchObject({ direction: "in", medium: "ballistic", connectorFamily: "feed-std" });
    expect(turret.ports.every((p) => p.position[2] === 0 && p.normal[2] === -1)).toBe(true);
    const reactor = byId.get("reactor.md")!;
    expect(reactor.ports.find((p) => p.id === "power-out")!.capacity).toBe(700);
    const dock = byId.get("docking-port.lg")!;
    expect(dock.ports.filter((p) => p.direction === "both").map((p) => p.channel).sort()).toEqual(["data", "fuel", "power", "ventilation"]);
  });

  it("links existing art-library designs and GLB paths", () => {
    expect(byId.get("reactor.md")!.art.artLibraryDesignId).toBe("shipyard.equipment.reactor");
    expect(byId.get("console.command.sm")!.art.artLibraryDesignId).toBe("shipyard.equipment.command-console");
    expect(byId.get("airlock.exterior.md")!.art.artLibraryDesignId).toBe("shipyard.structure.external-airlock");
    expect(byId.get("ion-drive.md")!.art).toMatchObject({ kitKey: "ion.MD", glb: "assets/art-library/ship-components/r002/glb/ion-drive.md.glb" });
    expect(byId.get("armor-plate.light.sm")!.art.glb).toBeNull();
  });

  it("rejects malformed catalogs", () => {
    const dup = clone();
    (dup.components as unknown[]).push(dup.components[0]);
    expect(validateShipComponentCatalog(dup).join()).toContain("duplicate id");
    const noPort = clone();
    (noPort.components[0] as unknown as { ports: unknown[] }).ports = [];
    expect(validateShipComponentCatalog(noPort).join()).toContain("without a power input");
    const outside = clone();
    const port = outside.components[0].ports[0] as unknown as { position: number[] };
    port.position = [0, 50, 0];
    expect(validateShipComponentCatalog(outside).join()).toContain("outside envelope");
    const ammo = clone();
    const w = ammo.components.find((c) => c.weapon?.ammoType)!.weapon as { ammoType: string };
    w.ammoType = "unknown";
    expect(validateShipComponentCatalog(ammo).join()).toContain("unknown ammo type");
    const peak = clone();
    (peak.components[0].power as { peakKw: number }).peakKw = 0;
    expect(validateShipComponentCatalog(peak).join()).toContain("idle <= active <= peak");
  });
});
