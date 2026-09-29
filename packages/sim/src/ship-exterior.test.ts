import { describe, expect, it } from "vitest";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { dressShip } from "./ship-dresser";
import {
  exteriorOnlyDress,
  prefabExteriorAssetId,
  prefabIdOfExterior,
  UNPUBLISHED_EXTERIOR_ID,
} from "./ship-exterior";

const catalog = defaultPrefabComponentCatalog();

describe("exterior-only dressing (other ships never render interiors)", () => {
  it.each(PREFAB_SHIPS.map((p) => [p.id, p] as const))(
    "%s keeps the flight exterior and drops every interior placement",
    (_id, prefab) => {
      const full = dressShip(prefab, { catalog });
      const outside = exteriorOnlyDress(full);
      // Nothing deck-only and nothing mounted inside the hull.
      for (const rows of [
        outside.kit,
        outside.generated,
        outside.decals,
        outside.components,
      ])
        expect(rows.every((r) => r.view !== "deck")).toBe(true);
      expect(
        outside.components.some((c) => c.placement.mount.attach === "interior"),
      ).toBe(false);
      expect(outside.objects).toEqual([]);
      expect(outside.lights).toEqual([]);
      expect(outside.labels).toEqual([]);
      expect(outside.contacts).toEqual([]);
      // The hull itself survives unchanged: every flight/both kit piece and exterior mount.
      expect(outside.kit).toEqual(full.kit.filter((k) => k.view !== "deck"));
      expect(outside.components.map((c) => c.mount)).toEqual(
        full.components
          .filter(
            (c) => c.view !== "deck" && c.placement.mount.attach !== "interior",
          )
          .map((c) => c.mount),
      );
      expect(outside.kit.length).toBeGreaterThan(0);
      expect(outside.bounds).toEqual(full.bounds);
    },
  );

  it("the Wren's interior modules and furniture exist in the deck dressing only", () => {
    const wren = PREFAB_SHIPS.find((p) => p.id === "fed.s.wren")!;
    const full = dressShip(wren, { catalog });
    expect(
      full.components.some((c) => c.placement.mount.attach === "interior"),
    ).toBe(true);
    expect(full.objects.length).toBeGreaterThan(0);
    expect(full.labels.length).toBeGreaterThan(0);
    const outside = exteriorOnlyDress(full);
    const interiorMounts = new Set(
      wren.mounts.filter((m) => m.attach === "interior").map((m) => m.id),
    );
    expect(outside.components.some((c) => interiorMounts.has(c.mount))).toBe(
      false,
    );
  });
});

describe("published prefab exterior ids", () => {
  it("round-trips a prefab id and rejects anything else", () => {
    expect(prefabExteriorAssetId("fed.s.wren")).toBe("prefab:fed.s.wren");
    expect(prefabIdOfExterior("prefab:fed.s.wren")).toBe("fed.s.wren");
    expect(prefabIdOfExterior(UNPUBLISHED_EXTERIOR_ID)).toBeUndefined();
    expect(prefabIdOfExterior("prefab:../x")).toBeUndefined();
    expect(prefabIdOfExterior("stock-wayfarer-exterior:abc")).toBeUndefined();
    expect(() => prefabExteriorAssetId("Bad Id")).toThrow();
  });
});
