import { describe, expect, test } from "vitest";
import { buildShipComponentCatalog } from "@sidereal/content/ship-components-source";
import { prefabById } from "@sidereal/content/prefabs";
import {
  catalogBaseRevision,
  isComposedCatalogPin,
  registerComponentCatalogSnapshot,
  snapshotPin,
} from "./component-catalogs";
import { prefabComponentCatalogFor } from "./prefab-catalog";
import { shipComponentCatalogFor } from "./prefab-ship-systems";
import { prefabComponentDefinition } from "./prefab-deck-objects";
import { catalogDamageStates } from "./combat-damage";
import { prefabFlightModel, catalogRevisionNumber } from "./prefab-flight";

const seed = (id: string) =>
  JSON.parse(
    JSON.stringify(
      buildShipComponentCatalog(4).components.find((c) => c.id === id)!,
    ),
  );

describe("registry-composed component catalogues", () => {
  test("pins are content-addressed and parse to their base revision", () => {
    const drive = { ...seed("thrust-block.sm"), massKg: 999 };
    const a = snapshotPin({ base: 4, components: [drive], removed: [] });
    const b = snapshotPin({ base: 4, components: [drive], removed: [] });
    expect(a.pin).toBe(b.pin);
    expect(a.pin).toMatch(/^ship-components-v1@4\+[0-9a-f]{16}$/);
    expect(isComposedCatalogPin(a.pin)).toBe(true);
    expect(isComposedCatalogPin("ship-components-v1@4")).toBe(false);
    expect(catalogBaseRevision(a.pin)).toBe(4);
    expect(catalogRevisionNumber(a.pin)).toBe(4);
    expect(() =>
      registerComponentCatalogSnapshot(
        a.pin.replace(/.$/, (c) => (c === "0" ? "1" : "0")),
        a.canonical,
      ),
    ).toThrow(/does not match/);
  });
  test("every resolver serves the composed catalogue once registered", () => {
    const drive = seed("thrust-block.sm");
    const heavier = { ...drive, massKg: drive.massKg + 100 };
    const { pin, canonical } = snapshotPin({
      base: 4,
      components: [heavier],
      removed: [],
    });
    expect(() => prefabComponentCatalogFor(pin)).toThrow(/not loaded/);
    registerComponentCatalogSnapshot(pin, canonical);
    const prefab = prefabComponentCatalogFor(pin);
    expect(prefab.revision).toBe(pin);
    expect(shipComponentCatalogFor(pin).components).toHaveLength(
      buildShipComponentCatalog(4).components.length,
    );
    expect(prefabComponentDefinition("thrust-block.sm", pin)?.massKg).toBe(
      heavier.massKg,
    );
    expect(prefabComponentDefinition("thrust-block.sm")?.massKg).toBe(
      drive.massKg,
    );
    expect(catalogDamageStates(pin)).toEqual(catalogDamageStates());
    // A ship on the composed catalogue is heavier; the plain pin is unchanged.
    const wren = prefabById("fed.s.wren")!;
    const base = prefabFlightModel(
      wren,
      prefabComponentCatalogFor("ship-components-v1@4"),
    );
    const composed = prefabFlightModel(wren, prefab);
    const mass = (m: typeof base) =>
      m.catalog.definitions.reduce((sum, d) => sum + d.massKg, 0);
    expect(mass(composed)).toBeGreaterThan(mass(base));
  });
  test("invalid composed catalogues are refused", () => {
    const broken = { ...seed("thrust-block.sm"), ports: [] };
    const { pin, canonical } = snapshotPin({
      base: 4,
      components: [broken],
      removed: [],
    });
    expect(() => registerComponentCatalogSnapshot(pin, canonical)).toThrow(
      /is invalid/,
    );
  });
});
