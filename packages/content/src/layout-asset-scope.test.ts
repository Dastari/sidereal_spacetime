import { describe, expect, it } from "vitest";
import type { PartAsset, PartCategory } from "./assembly";
import {
  isExteriorAsset,
  isObjectAsset,
  isStructuralAsset,
} from "./layout-asset-scope";

function asset(category: PartCategory, designId?: string): PartAsset {
  return {
    id: "scope-test",
    label: "Component",
    category,
    nodes: [],
    bounds: { min: [0, 0, 0], max: [1, 1, 1] },
    ...(designId
      ? {
          visual: {
            url: "/test.glb",
            sha256: "test",
            designId,
            revision: 1,
            bounds: { min: [0, 0, 0], max: [1, 1, 1] },
            damagePreview: "unsupported" as const,
          },
        }
      : {}),
  };
}

describe("Shipyard component editing scope", () => {
  it.each(["engine", "equipment", "cargo", "decoration"] as const)(
    "edits %s in Objects without changing its source category",
    (category) => {
      const part = asset(category);
      expect(isObjectAsset(part)).toBe(true);
      expect(isExteriorAsset(part)).toBe(false);
      expect(isStructuralAsset(part)).toBe(false);
      expect(part.category).toBe(category);
    },
  );
  it.each([
    ["wall", "shipyard.hull.pilot-section"],
    ["wall", "shipyard.hull.side-armor"],
    ["roof", "shipyard.roof.frontier"],
  ] as const)(
    "keeps legacy %s shell art in Hull (%s)",
    (category, designId) => {
      const part = asset(category, designId);
      expect(isExteriorAsset(part)).toBe(true);
      expect(isObjectAsset(part)).toBe(false);
      expect(isStructuralAsset(part)).toBe(false);
    },
  );
  it.each(["floor", "wall", "roof"] as const)(
    "keeps structural %s out of both object palettes",
    (category) => {
      const part = asset(category);
      expect(isStructuralAsset(part)).toBe(true);
      expect(isObjectAsset(part)).toBe(false);
      expect(isExteriorAsset(part)).toBe(false);
    },
  );
});
