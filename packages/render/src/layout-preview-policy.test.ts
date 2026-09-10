import { describe, expect, it } from "vitest";
import { PART_CATEGORIES } from "@sidereal/content/assembly";
import {
  layoutPartVisible,
  type LayoutPreviewLayers,
} from "./layout-preview-policy";
const all = new Set(PART_CATEGORIES);
describe("editor semantic preview layers", () => {
  it("retains the legacy category filter and default visibility", () => {
    for (const category of PART_CATEGORIES)
      expect(layoutPartVisible(category, all)).toBe(true);
    expect(layoutPartVisible(undefined, all)).toBe(false);
    expect(
      layoutPartVisible("roof", new Set(["wall"]), { layers: { roof: true } }),
    ).toBe(false);
  });
  it("independently hides every native structural and object layer", () => {
    const groups: Record<keyof LayoutPreviewLayers, string[]> = {
      walls: ["wall"],
      floors: ["floor"],
      roof: ["roof"],
      objects: ["decoration", "equipment", "cargo"],
      exteriorHull: ["superstructure", "engine"],
    };
    for (const [layer, hidden] of Object.entries(groups))
      for (const category of PART_CATEGORIES)
        expect(
          layoutPartVisible(category, all, { layers: { [layer]: false } }),
          `${layer}:${category}`,
        ).toBe(!hidden.includes(category));
  });
  it("suppresses solid systems equipment without overriding explicitly enabled structure", () => {
    const policy = {
      suppressEquipmentSolids: true,
      layers: { objects: true, exteriorHull: true },
    };
    for (const category of ["equipment", "cargo", "engine"] as const)
      expect(layoutPartVisible(category, all, policy)).toBe(false);
    for (const category of ["wall", "floor", "roof", "superstructure"] as const)
      expect(layoutPartVisible(category, all, policy)).toBe(true);
  });
});
