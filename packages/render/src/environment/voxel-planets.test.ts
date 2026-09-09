import { describe, expect, it } from "vitest";
import { buildVoxelPlanet } from "./voxel-planets";

describe("seeded celestial presentation geometry", () => {
  it("reproduces a seed and changes topology with another seed", () => {
    const a = buildVoxelPlanet(17, "ocean", false, 24);
    expect(buildVoxelPlanet(17, "ocean", false, 24)).toEqual(a);
    expect(buildVoxelPlanet(18, "ocean", false, 24).positions).not.toEqual(
      a.positions,
    );
  });
  it("emits only grid-aligned exposed quads with bounded indices", () => {
    const g = buildVoxelPlanet(68, "moon", false, 24);
    expect(g.positions.length).toBe(g.faces * 12);
    expect(g.indices.length).toBe(g.faces * 6);
    expect(g.normals.length).toBe(g.positions.length);
    expect(g.colors.length).toBe(g.faces * 16);
    expect(Math.max(...g.indices)).toBe(g.positions.length / 3 - 1);
    for (let i = 0; i < g.normals.length; i += 3) {
      expect(
        g.normals.slice(i, i + 3).reduce((a, b) => a + Math.abs(b), 0),
      ).toBe(1);
    }
    // Removing internal cube faces is essential to the bounded draw geometry.
    expect(g.faces).toBeLessThan(g.occupied * 2);
    expect(g.positions.every(Number.isFinite)).toBe(true);
  });
  it("keeps the fixed production mesh budget across styles and seeds", () => {
    for (const seed of [17, 38, 68])
      for (const style of [
        "ocean",
        "gas",
        "moon",
        "ice",
        "volcanic",
        "toxic",
      ] as const) {
        const terrain = buildVoxelPlanet(seed, style);
        const weather = buildVoxelPlanet(seed, style, true);
        expect(terrain.faces).toBeLessThan(16000);
        expect(weather.faces).toBeLessThan(6000);
        expect(weather.occupied).toBeGreaterThan(0);
        for (let i = 0; i < weather.positions.length; i += 3) {
          expect(
            Math.hypot(...weather.positions.slice(i, i + 3)),
          ).toBeGreaterThan(0.98);
        }
      }
  });
  it("rejects unbounded resolution requests", () => {
    expect(() => buildVoxelPlanet(1, "ocean", false, 256)).toThrow(RangeError);
    expect(() => buildVoxelPlanet(1, "moon", false, 24.5)).toThrow(RangeError);
  });
});

import { buildPlanetRecipe } from "./voxel-planets";
import {
  PLANET_STYLES,
  planetRecipe,
  validatePlanetRecipe,
} from "../../../content/src/environment";
describe("parameterized planet recipes", () => {
  it("supports all ten families inside the hard face and cell budgets", () => {
    for (const style of PLANET_STYLES) {
      const recipe = { ...planetRecipe(style, 913), resolution: 24 };
      const geometry = buildPlanetRecipe(recipe);
      expect(geometry.faces).toBeGreaterThan(100);
      expect(geometry.faces).toBeLessThanOrEqual(60000);
      expect(geometry.occupied).toBeLessThanOrEqual(24 ** 3);
      expect(geometry.positions.every(Number.isFinite)).toBe(true);
    }
  });
  it("changes coastlines, relief and weather independently and reproduces exported recipes", () => {
    const recipe = { ...planetRecipe("temperate", 63), resolution: 24 };
    const base = buildPlanetRecipe(recipe);
    expect(buildPlanetRecipe(JSON.parse(JSON.stringify(recipe)))).toEqual(base);
    expect(buildPlanetRecipe({ ...recipe, seaLevel: 0.2 }).colors).not.toEqual(
      base.colors,
    );
    expect(
      buildPlanetRecipe({ ...recipe, mountains: 0 }).positions,
    ).not.toEqual(base.positions);
    expect(buildPlanetRecipe({ ...recipe, terrain: 0 }).positions).not.toEqual(
      base.positions,
    );
    expect(buildPlanetRecipe({ ...recipe, cloudCoverage: 0 }, true).faces).toBe(
      0,
    );
    expect(
      buildPlanetRecipe({ ...recipe, cloudCoverage: 0.8 }, true).faces,
    ).toBeGreaterThan(0);
    const recolor = buildPlanetRecipe({
      ...recipe,
      palette: recipe.palette.map(() => "ff0011"),
    });
    expect(recolor.positions).toEqual(base.positions);
    expect(recolor.colors).not.toEqual(base.colors);
  });
  it("reserves emission exclusively for deposits, with opaque alpha-independent geometry", () => {
    for (const style of ["volcanic", "crystal"] as const) {
      const geometry = buildPlanetRecipe({
        ...planetRecipe(style, 17),
        resolution: 32,
      });
      const flags = geometry.colors.filter((_, i) => i % 4 === 3);
      expect(flags.some((v) => v === 1)).toBe(true);
      expect(flags.some((v) => v === 0)).toBe(true);
    }
  });
  it("rejects unbounded or malformed import recipes before allocating geometry", () => {
    const recipe = planetRecipe();
    for (const patch of [
      { seed: NaN },
      { resolution: 97 },
      { terrain: Infinity },
      { seaLevel: -1 },
      { emission: 5 },
      { cloudSpeed: 1 },
      { palette: ["ffffff"] },
      { version: 2 },
    ])
      expect(() =>
        validatePlanetRecipe({ ...recipe, ...patch } as typeof recipe),
      ).toThrow();
  });
});
