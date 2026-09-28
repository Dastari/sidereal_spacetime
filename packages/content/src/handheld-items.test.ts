import { describe, expect, it } from "vitest";
import { CREW_ITEMS } from "./crew-items";
import {
  HANDHELD_DEFINITIONS,
  HANDHELD_MASS_KG,
  INVENTORY_DEFINITIONS,
  LEGACY_HANDHELD_ART,
  OPERATOR_ITEM_KITS,
  legacyHandheldFootprint,
} from "./inventory";
import { INVENTORY_PHYSICAL_DEFINITIONS } from "./inventory-physical-definitions";
import { LAB_WEAPONS } from "./weapons";

/** The 2026-09-08 lab items as live players own them (footprint and mass before batch A). */
const LIVE_LEGACY: Record<string, { w: number; h: number; kg: number }> = {
  "compact-pistol": { w: 2, h: 2, kg: 1.1 },
  "heavy-handgun": { w: 2, h: 2, kg: 1.8 },
  carbine: { w: 2, h: 4, kg: 3.2 },
  "long-rifle": { w: 2, h: 5, kg: 4.4 },
  scanner: { w: 1, h: 2, kg: 0.5 },
  "plasma-cutter": { w: 2, h: 3, kg: 2.4 },
  medkit: { w: 2, h: 2, kg: 0.8 },
};
const byId = (id: string) => INVENTORY_DEFINITIONS.find((d) => d.id === id)!;

describe("r001 handheld inventory definitions", () => {
  it("makes every r001 item exactly one real definition", () => {
    const ids = INVENTORY_DEFINITIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(HANDHELD_DEFINITIONS).toHaveLength(CREW_ITEMS.length);
    for (const item of CREW_ITEMS) {
      const canonical = HANDHELD_DEFINITIONS.find(
        (d) => d.crewItemId === item.id && d.id === item.id,
      );
      expect(canonical, item.id).toBeDefined();
      expect(canonical!.maxStack).toBe(1);
      expect(canonical!.iconUrl).toContain(`/icons/grid/${item.id}.png`);
      if (!canonical!.legacy) {
        expect([canonical!.width, canonical!.height], item.id).toEqual([
          item.grid.width,
          item.grid.height,
        ]);
        expect(canonical!.massKg).toBe(HANDHELD_MASS_KG[item.id]);
      }
    }
  });

  it("takes categories from the catalog (weapon, medical, tool, utility)", () => {
    const category = (id: string) => byId(id).category;
    expect(category("shotgun")).toBe("weapon");
    expect(category("beam-rifle")).toBe("weapon");
    expect(category("medgun")).toBe("medical");
    expect(category("welder")).toBe("tool");
    expect(category("data-pad")).toBe("utility");
    expect(category("plasma-cutter")).toBe("tool");
    expect(category("power-cell")).toBeUndefined();
  });

  it("gives every weapon provisional server stats and nothing else fires", () => {
    for (const d of INVENTORY_DEFINITIONS.filter(
      (d) => d.category === "weapon",
    ))
      expect(LAB_WEAPONS[d.id], d.id).toBeDefined();
    for (const id of Object.keys(LAB_WEAPONS)) {
      expect(byId(id).category, id).toBe("weapon");
      expect(byId(id).equipSlot, id).toBe("hand");
    }
    for (const id of ["medgun", "repair-tool", "scanner", "grapple", "medkit"])
      expect(LAB_WEAPONS[id], id).toBeUndefined();
  });

  it("keeps legacy items working: same ids, never a larger footprint or mass", () => {
    for (const [id, old] of Object.entries(LIVE_LEGACY)) {
      const d = byId(id);
      expect(d.legacy, id).toBe(true);
      expect(d.crewItemId).toBe(LEGACY_HANDHELD_ART[id]);
      expect(d.width, id).toBeLessThanOrEqual(old.w);
      expect(d.height, id).toBeLessThanOrEqual(old.h);
      expect(d.massKg, id).toBe(old.kg);
    }
    // shrinks keep the orientation: the long rifle stays portrait, one cell shorter
    expect([byId("long-rifle").width, byId("long-rifle").height]).toEqual([
      2, 4,
    ]);
    expect([
      byId("compact-pistol").width,
      byId("compact-pistol").height,
    ]).toEqual([2, 2]);
    expect([byId("plasma-cutter").width, byId("plasma-cutter").height]).toEqual(
      [1, 3],
    );
    expect(
      legacyHandheldFootprint({ width: 2, height: 4 }, { width: 4, height: 2 }),
    ).toEqual({
      width: 2,
      height: 4,
    });
    // the medkit becomes holdable; the old equipment slots are unchanged
    expect(byId("medkit").equipSlot).toBe("hand");
    expect(byId("scanner").equipSlot).toBe("hand");
  });

  it("has an explicit physical definition for every handheld (ship flight mass)", () => {
    for (const d of HANDHELD_DEFINITIONS) {
      const physical = INVENTORY_PHYSICAL_DEFINITIONS.find(
        (p) => p.id === "inventory:" + d.id,
      );
      expect(physical?.massKg, d.id).toBe(d.massKg);
    }
  });

  it("offers operator kits of known, holdable items", () => {
    expect(OPERATOR_ITEM_KITS["weapons-and-tools"]).toHaveLength(
      CREW_ITEMS.length,
    );
    expect(OPERATOR_ITEM_KITS.weapons).toContain("grenade");
    expect(OPERATOR_ITEM_KITS["tools-and-utility"]).toContain("repair-tool");
    expect(OPERATOR_ITEM_KITS["uniforms-and-tiers"].length).toBeGreaterThan(0);
    for (const id of Object.values(OPERATOR_ITEM_KITS).flat())
      expect(
        INVENTORY_DEFINITIONS.some((d) => d.id === id),
        id,
      ).toBe(true);
  });
});
