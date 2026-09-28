import { describe, expect, it } from "vitest";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { prefabConstructionDocument } from "@sidereal/sim/prefab-construction";
import {
  PREFAB_OBJECT_PREFIX,
  prefabObjectDetails,
  prefabShipOf,
} from "./prefab-objects";

const catalog = defaultPrefabComponentCatalog();
const FED_WREN = PREFAB_SHIPS.find((p) => p.id === "fed.s.wren")!;
const stat = (s: ReturnType<typeof prefabObjectDetails>, label: string) =>
  s?.stats.find((row) => row.label === label)?.value;

describe("prefab object details", () => {
  it("reads the trusted prefab binding of a construction document only", () => {
    const json = JSON.stringify(prefabConstructionDocument(FED_WREN, catalog));
    expect(prefabShipOf(json)?.doc.id).toBe("fed.s.wren");
    expect(prefabShipOf(JSON.stringify({ layout: {} }))).toBeUndefined();
    expect(prefabShipOf("{not json")).toBeUndefined();
  });

  it("shows the owner the catalog stats and live state of the reactor and drives", () => {
    const reactor = prefabObjectDetails(
      PREFAB_OBJECT_PREFIX + "mount:reactor",
      FED_WREN,
      catalog,
      "owner",
      { shipId: "ship-1", powerFittings: [] },
      { localX: 0, localY: 0 },
    )!;
    expect(reactor.name).toMatch(/reactor/i);
    expect(stat(reactor, "Size class")).toBe("MD");
    expect(stat(reactor, "Power output")).toMatch(/MW|kW/);
    expect(stat(reactor, "Mass")).toMatch(/t$/);
    expect(stat(reactor, "Location")).toBe("ENGINE");
    expect(stat(reactor, "State")).toBe("Installed");
    expect(reactor.distance).toBeGreaterThan(0);
    const drive = prefabObjectDetails(
      PREFAB_OBJECT_PREFIX + "mount:main-s1",
      FED_WREN,
      catalog,
      "owner",
      {
        shipId: "ship-1",
        powerFittings: [{ sourceDeviceId: "mount-main-s1", powered: true }],
        throttles: [{ actuatorId: "ship-1:mount-main-s1", throttle: 0.5 }],
      },
    )!;
    expect(stat(drive, "Thrust")).toMatch(/kN$/);
    expect(stat(drive, "State")).toBe("Powered");
    expect(stat(drive, "Throttle")).toBe("50%");
    expect(stat(drive, "Location")).toBe("Hull face");
  });

  it("describes bunks, furniture and doors", () => {
    const bunk = prefabObjectDetails(
      PREFAB_OBJECT_PREFIX + "mount:bunk",
      FED_WREN,
      catalog,
      "owner",
    )!;
    expect(stat(bunk, "Berths")).toBeDefined();
    const locker = prefabObjectDetails(
      PREFAB_OBJECT_PREFIX + "socket:bunks:0",
      FED_WREN,
      catalog,
      "owner",
    )!;
    expect(locker.name).toBe("Wall Locker");
    expect(locker.category).toBe("Furniture");
    expect(stat(locker, "Collision")).toBe("Solid");
    const door = prefabObjectDetails(
      PREFAB_OBJECT_PREFIX + "door:d-bridge",
      FED_WREN,
      catalog,
      "owner",
    )!;
    expect(door.name).toBe("Sliding door");
    expect(stat(door, "State")).toBe("Open passage");
    const hatch = prefabObjectDetails(
      PREFAB_OBJECT_PREFIX + "door:airlock",
      FED_WREN,
      catalog,
      "owner",
    )!;
    expect(stat(hatch, "State")).toBe("Sealed");
  });

  it("gives a passenger only what is visibly installed, and nothing without access", () => {
    const reactor = prefabObjectDetails(
      PREFAB_OBJECT_PREFIX + "mount:reactor",
      FED_WREN,
      catalog,
      "passenger",
      // Even if live rows were supplied, a passenger view never reads them.
      {
        shipId: "s",
        powerFittings: [{ sourceDeviceId: "mount-reactor", powered: true }],
      },
    )!;
    expect(reactor.stats.map((s) => s.label)).toEqual([
      "Size class",
      "Location",
    ]);
    expect(reactor.status).toMatch(/owner/);
    expect(
      prefabObjectDetails(
        PREFAB_OBJECT_PREFIX + "mount:reactor",
        FED_WREN,
        catalog,
        undefined,
      ),
    ).toBeUndefined();
    expect(
      prefabObjectDetails("native-part", FED_WREN, catalog, "owner"),
    ).toBeUndefined();
    expect(
      prefabObjectDetails(
        PREFAB_OBJECT_PREFIX + "mount:nope",
        FED_WREN,
        catalog,
        "owner",
      ),
    ).toBeUndefined();
  });
});
